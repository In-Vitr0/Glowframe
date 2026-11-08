(() => {
 'use strict';
 if(globalThis.__glowframe) return;
 globalThis.__glowframe=true;
 const api=globalThis.browser || globalThis.chrome;
 const {defaults,normalize,geometry}=globalThis.GlowSettings;
 let settings={...defaults},status='Waiting for a video',video=null,lastSample=-1e9,lastRender=-1e9,lastBlend=0,settleUntil=0;
 // Like Ambilight: the video is only sampled at the configured rate (e.g. 15 fps),
 // but the transitions between two samples run smoothly at up to 60 frames per second.
 // Smoothing 0 = hard switches, no in-between frames (cheapest).
 const RENDER_FPS=60;
 const fadeTime=()=>settings.smoothing*6; // ms: 50 % → 300 ms, 90 % → 540 ms
 let failedVideo=null,lastTime=-1,forceFrame=true,firstFrame=true,visible=false,lastTheaterClick=-2000,styledHost=null;
 // If the user toggled theater mode themselves (button or "t" key),
 // their choice is kept until the next video.
 let theaterOptOut=false,objectFit='contain',fitVideo=null;
 const applied=new Map();
 // Only write styles when a value changes: saves style recalculation on every light frame.
 function setStyle(node,values){
  let cache=applied.get(node);if(!cache){cache={};applied.set(node,cache);}
  for(const key of Object.keys(values)){const value=values[key];if(cache[key]!==value){cache[key]=value;node.style[key]=value;}}
 }
 const layer=document.createElement('div');layer.id='glowframe-overlay';layer.setAttribute('aria-hidden','true');
 Object.assign(layer.style,{position:'fixed',pointerEvents:'none',zIndex:'1',display:'none',overflow:'hidden',opacity:'0'});
 const canvas=document.createElement('canvas');canvas.width=96;canvas.height=54;
 Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%'});
 layer.append(canvas);document.documentElement.append(layer);
 // All layers share the same player stacking context: video 0, light 1,
 // gradients 2 and controls 3. No extremely high page overlays.
 const controlsStyle=document.createElement('style');
 controlsStyle.textContent='[data-glowframe-player] > .html5-video-container { z-index:0 !important; } [data-glowframe-player] .ytp-gradient-bottom, [data-glowframe-player] .ytp-gradient-top { z-index:2 !important; } [data-glowframe-player] .ytp-chrome-bottom, [data-glowframe-player] .ytp-chrome-top, [data-glowframe-player] .ytp-popup, [data-glowframe-player] .ytp-tooltip { z-index:3 !important; }';
 document.documentElement.append(controlsStyle);
 // Plain sRGB color space: with P3, Safari converted every 4K HDR frame expensively while drawing
 // (playback stuttered since 1.4.3, even without HDR light).
 const context=canvas.getContext('2d',{alpha:false});
 // Invisible sample canvas: receives the video frame; the visible canvas fades smoothly towards it.
 const sample=document.createElement('canvas');sample.width=96;sample.height=54;
 const sampleContext=sample.getContext('2d',{alpha:false});
 const quality=globalThis.GlowQuality.create(document,()=>location.href);
 // Create the HDR light (WebGPU) only when needed: HDR display and setting enabled.
 const hdrMedia=globalThis.matchMedia?.('(dynamic-range: high)');
 let hdrCanvas=null,hdr=null,visibleSince=0;
 // Detect HDR videos only via the quality level chosen for this video (e.g. "2160p60 HDR").
 // The HDR badge on the settings gear stuck when switching to a normal video, so it is not used.
 // Normal videos get the normal light, which never gets brighter than white.
 function isHdrVideo(){return !!quality.hdrSeen;}
 function hdrWanted(){
  if(!settings.hdr || !hdrMedia?.matches || !globalThis.GlowHDR)return false;
  if(!hdr){
   hdrCanvas=document.createElement('canvas');
   Object.assign(hdrCanvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',display:'none'});
   layer.append(hdrCanvas);hdr=globalThis.GlowHDR.create(hdrCanvas);
  }
  return true;
 }
 function update(values){const wasTheater=settings.theater;settings=normalize(values);forceFrame=true;if(settings.theater && !wasTheater)theaterOptOut=false;}
 api.storage.local.get('glowSettings').then(r=>update(r.glowSettings || defaults)).catch(()=>{});
 api.storage.onChanged.addListener((changes,area)=>{if(area==='local' && changes.glowSettings)update(changes.glowSettings.newValue || defaults);});
 api.runtime.onMessage.addListener((message,sender,reply)=>{if(message.type==='glowStatus')reply({status,settings,videoFound:!!video});});
 document.addEventListener('yt-navigate-finish',()=>{video=null;failedVideo=null;forceFrame=true;lastTheaterClick=-2000;theaterOptOut=false;quality.reset();});
 document.addEventListener('click',event=>{if(event.isTrusted && event.target?.closest?.('.ytp-size-button'))theaterOptOut=true;},true);
 document.addEventListener('keydown',event=>{
  if(!event.isTrusted || event.metaKey || event.ctrlKey || event.altKey || (event.key!=='t' && event.key!=='T'))return;
  const target=event.target;
  if(target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || '')))return;
  theaterOptOut=true;
 },true);
 document.addEventListener('visibilitychange',()=>{forceFrame=true;});window.addEventListener('resize',()=>{forceFrame=true;});
 function ensureTheater(time) {
  if(!settings.theater || theaterOptOut || document.fullscreenElement || video?.webkitDisplayingFullscreen)return;
  const watch=document.querySelector('ytd-watch-flexy');
  if(!watch || watch.hasAttribute('hidden') || watch.hasAttribute('theater') || watch.hasAttribute('fullscreen'))return;
  const button=document.querySelector('#movie_player .ytp-size-button');
  if(!button || button.disabled || time-lastTheaterClick<1200)return;
  lastTheaterClick=time;
  button.click();
 }
 function hide(message){setStyle(layer,{display:'none',opacity:'0'});visible=false;settleUntil=0;status=message;}
 // Measure the height of YouTube's control bar instead of a fixed 48 px; YouTube changes it occasionally.
 function controlsInset(player,playerRect){
  const bar=player?.querySelector?.('.ytp-chrome-bottom');
  if(bar){const r=bar.getBoundingClientRect(),inset=playerRect.bottom-r.top;if(r.height>0 && inset>0 && inset<=playerRect.height/3)return inset;}
  return 48;
 }
 function frame(time){
  requestAnimationFrame(frame);
  if(document.hidden){hide('Paused – tab in background');return;}
  // Sample at the configured rate; in between only render in-between frames while a fade is running.
  const sampleDue=time-lastSample>=1000/settings.fps;
  const blending=settleUntil>0 && time-lastRender>=1000/RENDER_FPS-2;
  if(!sampleDue && !blending)return;
  lastRender=time;
  if(sampleDue){
   lastSample=time;
   ensureTheater(time);
   quality.tick(time,settings.autoQuality,settings.maxQuality);
  }
  if(!settings.enabled){hide('Turned off');return;}
  const current=document.querySelector('#movie_player video.html5-main-video') || document.querySelector('video.html5-main-video');
  if(current!==video){video=current;failedVideo=null;lastTime=-1;forceFrame=true;firstFrame=true;visible=false;fitVideo=null;setStyle(layer,{opacity:'0'});}
  if(!video || !context){hide('Waiting for a YouTube video');return;}
  if(!(settings.top || settings.right || settings.bottom || settings.left)){hide('All light sides are turned off');return;}
  const rect=video.getBoundingClientRect();
  // Safari's native video fullscreen shows no DOM overlays. YouTube's
  // player fullscreen, however, allows an effect inside the fullscreen element.
  const fullscreen=document.fullscreenElement;
  if((video.webkitDisplayingFullscreen && !fullscreen) || fullscreen===video){hide('Native Safari fullscreen: use the YouTube fullscreen button for the light.');return;}
  const player=document.querySelector('#movie_player');
  const insideFullscreen=player && (!fullscreen || fullscreen===player || (typeof fullscreen.contains==='function' && fullscreen.contains(player)));
  const host=insideFullscreen?player:(fullscreen || document.documentElement);
  if(styledHost!==host){
   if(styledHost)styledHost.removeAttribute('data-glowframe-player');
   host.setAttribute('data-glowframe-player','');styledHost=host;
  }
  if(layer.parentNode!==host){host.append(layer);forceFrame=true;}
  const playerRect=player?.getBoundingClientRect() || rect;
  // In page mode the area for comments and the control bar stays free.
  // Fullscreen light reaches down to the bottom edge of the screen.
  const bounds=fullscreen?{top:0,bottom:innerHeight}:{top:playerRect.top,bottom:playerRect.bottom-controlsInset(player,playerRect)};
  if(video.readyState<2 || rect.width<50 || rect.height<30 || rect.bottom<0 || rect.top>innerHeight){hide('Video is loading or out of view');return;}
  if(failedVideo===video){setStyle(layer,{display:'none'});return;}
  // The video element may include the black side areas. Only the visible
  // picture, calculated from the source aspect ratio, is cut out.
  // object-fit practically never changes; getComputedStyle per frame would force a style recalculation.
  if(fitVideo!==video || forceFrame){objectFit=getComputedStyle(video).objectFit;fitVideo=video;}
  const fit=objectFit;
  const {area,clip}=geometry(rect,video.videoWidth,video.videoHeight,innerWidth,innerHeight,settings,fit,bounds);
  if(area.width<=0 || area.height<=0){hide('Player is out of view');return;}
  const wantHDR=hdrWanted();
  const hdrVideo=wantHDR && isHdrVideo();
  const stage=quality.chosenLabel?` (${quality.chosenLabel})`:'';
  const useHDR=hdrVideo && hdr.state.ready && !hdr.state.failed;
  // HDR: CSS opacity would clamp the light to normal white, so the shader does the fade-in.
  setStyle(layer,{display:'block',left:`${area.left}px`,top:`${area.top}px`,width:`${area.width}px`,height:`${area.height}px`,
   clipPath:clip,transition:useHDR?'none':`opacity ${settings.fade}ms ease`});
  const brightness=settings.brightness;
  const opacity=settings.opacity/100;
  const start=100-settings.edgeFade;
  const mask=settings.edgeFade===0?'none':`radial-gradient(ellipse farthest-corner at center, black ${start}%, transparent 100%)`;
  setStyle(layer,{maskImage:mask,webkitMaskImage:mask});
  const baseStatus=video.paused?'Ready – video paused':fullscreen?'Active – fullscreen light like theater mode':'Active – light in the player area, comments stay clear';
  // Draw the video frame into the small 2D canvas. It is also the source of the HDR light,
  // because WebGPU imports HDR/Dolby Vision videos directly only as black.
  const newSample=forceFrame || (sampleDue && video.currentTime!==lastTime);
  if(newSample){
   try{
    // Pixels are never read back: the video stays local, even with cross-origin video data.
    sampleContext.drawImage(video,0,0,sample.width,sample.height);
    lastTime=video.currentTime;forceFrame=false;
   }catch(error){failedVideo=video;hide('Safari blocks drawing the video. Reload the page.');console.warn('Glowframe:',error.name);return;}
  }
  // Fade the visible canvas towards the latest sample over time (exponential, like Ambilight).
  // After about five fade times it is copied exactly; then the canvas rests until the next sample.
  let capture=false;
  const fade=fadeTime();
  if(newSample && (firstFrame || fade<=0)){
   context.globalAlpha=1;context.drawImage(sample,0,0,canvas.width,canvas.height);
   firstFrame=false;settleUntil=0;capture=true;
  } else if(newSample || settleUntil>0){
   if(newSample)settleUntil=time+fade*5;
   const dt=Math.max(1,Math.min(250,time-lastBlend));
   const done=time>=settleUntil;
   context.globalAlpha=done?1:1-Math.exp(-dt/fade);
   context.drawImage(sample,0,0,canvas.width,canvas.height);
   if(done)settleUntil=0;
   capture=true;
  }
  if(capture)lastBlend=time;
  if(useHDR){
   setStyle(canvas,{display:'none'});setStyle(hdrCanvas,{display:'block'});
   if(!visible){visible=true;visibleSince=time;}
   const level=settings.fade>0?Math.min(1,(time-visibleSince)/settings.fade):1;
   setStyle(layer,{opacity:'1'});
   const ok=hdr.render({source:canvas,capture,areaWidth:area.width,areaHeight:area.height,
    blur:settings.blur,brightness:brightness/100,contrast:settings.contrast/100,saturation:settings.saturation/100,opacity:opacity*level});
   if(ok){status=baseStatus+' · HDR light'+stage;return;}
   // Failed: the normal light takes over from the next frame.
   forceFrame=true;visible=false;status=baseStatus;return;
  }
  setStyle(canvas,{display:'block'});if(hdrCanvas)setStyle(hdrCanvas,{display:'none'});
  // Overscan keeps the light strong at the screen edge even after blurring.
  const overscan=settings.blur*2;
  setStyle(canvas,{inset:'auto',left:`${-overscan}px`,top:`${-overscan}px`,width:`${area.width+overscan*2}px`,height:`${area.height+overscan*2}px`});
  setStyle(canvas,{filter:`blur(${settings.blur}px) brightness(${brightness}%) contrast(${settings.contrast}%) saturate(${settings.saturation}%)`});
  if(!visible){visible=true;setStyle(layer,{opacity:'0'});requestAnimationFrame(()=>{if(visible)setStyle(layer,{opacity:String(opacity)});});}
  else setStyle(layer,{opacity:String(opacity)});
  status=baseStatus+(!wantHDR?'':!hdrVideo?(quality.chosenLabel?` · normal light${stage}`:(settings.autoQuality?' · normal light (quality not checked yet)':' · normal light (HDR detection needs "Choose video quality automatically")')):hdr.state.failed?` · HDR not available (${hdr.state.reason})`:'');
 }
 requestAnimationFrame(frame);
})();
