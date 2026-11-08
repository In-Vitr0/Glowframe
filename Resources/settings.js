'use strict';
globalThis.GlowSettings = (() => {
 const defaults = {enabled:true,brightness:150,contrast:100,saturation:130,spread:100,blur:55,opacity:65,fade:1200,smoothing:50,fps:15,top:true,right:true,bottom:true,left:true,fullBleed:true,edgeFade:0,theater:true,autoQuality:true,hdr:true,maxQuality:2160};
 const ranges={brightness:[0,600],contrast:[0,200],saturation:[0,400],spread:[20,1200],blur:[5,180],opacity:[0,100],fade:[0,3000],smoothing:[0,90],fps:[5,30],edgeFade:[0,100],maxQuality:[1080,2160]};
 function normalize(input={}) {
  if(!input || typeof input!=="object")input={};
  const result={...defaults};
  for(const key of Object.keys(defaults)) {
   if(typeof defaults[key]==='boolean') {if(typeof input[key]==='boolean') result[key]=input[key];}
   else if(input[key]!==null && input[key]!=='' && Number.isFinite(Number(input[key]))) result[key]=Math.min(ranges[key][1],Math.max(ranges[key][0],Number(input[key])));
  }
  return result;
 }
 function geometry(rect, videoWidth, videoHeight, viewportWidth, viewportHeight, settings, fit='contain', bounds=null) {
  let width=rect.width,height=rect.height;
  if(videoWidth>0 && videoHeight>0 && fit!=='cover') {
   const scale=Math.min(rect.width/videoWidth,rect.height/videoHeight);
   width=videoWidth*scale;height=videoHeight*scale;
  }
  const image={left:rect.left+(rect.width-width)/2,top:rect.top+(rect.height-height)/2,width,height};
  image.right=image.left+width;image.bottom=image.top+height;
  let area=settings.fullBleed?{left:0,top:0,width:viewportWidth,height:viewportHeight}:
   {left:image.left-settings.spread,top:image.top-settings.spread,width:width+settings.spread*2,height:height+settings.spread*2};
  if(bounds) {
   const left=Math.max(0,area.left),top=Math.max(0,area.top,bounds.top);
   const right=Math.min(viewportWidth,area.left+area.width),bottom=Math.min(viewportHeight,area.top+area.height,bounds.bottom);
   area={left,top,width:Math.max(0,right-left),height:Math.max(0,bottom-top)};
  }
  const l=image.left-area.left,t=image.top-area.top,r=image.right-area.left,b=image.bottom-area.top;
  const x0=settings.left?0:l,x1=settings.right?area.width:r,y0=settings.top?0:t,y1=settings.bottom?area.height:b;
  const clip=`polygon(evenodd, ${x0}px ${y0}px, ${x1}px ${y0}px, ${x1}px ${y1}px, ${x0}px ${y1}px, ${x0}px ${y0}px, ${l}px ${t}px, ${l}px ${b}px, ${r}px ${b}px, ${r}px ${t}px, ${l}px ${t}px)`;
  return {image,area,clip};
 }
 // Presets only contain the look of the light. Behaviour (on/off, theater mode, quality choice) is left alone.
 const presetKeys=['brightness','contrast','saturation','spread','blur','opacity','edgeFade','fade','smoothing','fps','top','right','bottom','left','fullBleed','hdr'];
 const sides={top:true,right:true,bottom:true,left:true,fullBleed:true};
 const presets=[
  {id:'mine',name:'My Setup',values:{...sides,brightness:128,contrast:131,saturation:105,spread:100,blur:76,opacity:100,edgeFade:0,fade:2700,smoothing:90,fps:12,hdr:true}},
  {id:'burnin',name:'Burn-in Guard',values:{...sides,brightness:110,contrast:120,saturation:100,spread:100,blur:90,opacity:90,edgeFade:0,fade:1500,smoothing:80,fps:12,hdr:false}},
  {id:'cinema',name:'Cinema Bold',values:{...sides,brightness:150,contrast:100,saturation:130,spread:100,blur:85,opacity:65,edgeFade:0,fade:1200,smoothing:50,fps:15,hdr:true}},
  {id:'eco',name:'Eco',values:{...sides,brightness:120,contrast:120,saturation:100,spread:100,blur:60,opacity:80,edgeFade:0,fade:800,smoothing:0,fps:8,hdr:false}}
 ];
 function presetValues(settings){const values={};for(const key of presetKeys)values[key]=settings[key];return values;}
 function applyPreset(settings,values){const picked={};for(const key of presetKeys)if(values && key in values)picked[key]=values[key];return normalize({...settings,...picked});}
 // Spread does not count when the light reaches the screen edge anyway.
 function matchesPreset(settings,values){const target=applyPreset(settings,values);return presetKeys.every(key=>target[key]===settings[key] || (key==='spread' && target.fullBleed && settings.fullBleed));}
 return {defaults,ranges,normalize,geometry,presets,presetKeys,presetValues,applyPreset,matchesPreset};
})();
