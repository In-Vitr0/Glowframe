'use strict';
// Use the real quality menu: YouTube's public quality setters are obsolete.
globalThis.GlowQuality = (() => {
 const MAX_QUALITY=2160;
 function create(doc, getLocation) {
  let hdrSeen=false,chosenLabel='',key='',stage='',owned=false,attempts=0,next=0,deadline=0,done=false,button=null,prevFocus=null;
  const visible=node=>node && node.getClientRects().length>0;
  const menu=()=>doc.querySelector('#movie_player .ytp-settings-menu');
  // Otherwise focus stays on the settings button after our menu visit,
  // and the space bar triggers that button instead of pausing the video.
  function restoreFocus(){
   const active=doc.activeElement;
   if(active && active!==doc.body && active.closest?.('#movie_player .ytp-settings-button, #movie_player .ytp-settings-menu'))active.blur?.();
   if(prevFocus && prevFocus!==doc.body && prevFocus!==active && prevFocus.isConnected)prevFocus.focus?.({preventScroll:true});
   prevFocus=null;
  }
  function close(){const wasOwned=owned;if(owned && visible(menu()) && button?.getAttribute('aria-expanded')==='true')button.click();owned=false;stage='';if(wasOwned)restoreFocus();}
  function reset(){close();key='';attempts=0;next=0;done=false;hdrSeen=false;chosenLabel='';}
  // Never fight someone using the player controls, including during our short menu visit.
  doc.addEventListener('pointerdown',event=>{if(event.isTrusted && event.target.closest?.('#movie_player')){owned=false;stage='';done=true;}},true);
  doc.addEventListener('keydown',event=>{if(event.isTrusted && owned){close();done=true;}},true);
  // cap: highest allowed line count (1080/1440/2160). Never above 4K: 8K is pointless here and stutters.
  function tick(time,enabled,cap=0) {
   const url=new URL(getLocation());
   const current=url.pathname==='/watch'?url.searchParams.get('v'):null;
   if(current!==key){reset();key=current;next=time+1500;}
   if(!enabled){close();done=false;attempts=0;next=time+1500;return;}
   if(!current || done || time<next)return;
   const player=doc.querySelector('#movie_player'),video=doc.querySelector('#movie_player video.html5-main-video');
   if(!player || !video || video.readyState<2 || player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting')){close();next=time+1000;return;}
   const items=()=>Array.from(player.querySelectorAll('.ytp-settings-menu .ytp-menuitem')).filter(visible);
   if(!stage) {
    if(attempts>=3){done=true;return;}
    // A menu already opened by the user is left alone.
    if(visible(menu())){next=time+2000;return;}
    button=player.querySelector('.ytp-settings-button');
    if(!button || button.disabled){next=time+1000;return;}
    attempts++;owned=true;prevFocus=doc.activeElement;stage='root';deadline=time+4000;button.click();next=time+250;return;
   }
   if(time>deadline || !visible(menu())){close();next=time+10000;return;}
   const rows=items();
   if(stage==='root') {
    const quality=rows.find(row=>/^(Qualität|Quality)$/i.test(row.querySelector('.ytp-menuitem-label')?.textContent.trim() || ''));
    if(quality){quality.click();stage='quality';next=time+250;return;}
   } else {
    const all=rows.map(row=>({row,text:row.textContent.trim()})).filter(x=>! /premium/i.test(x.text)).map(x=>({...x,match:x.text.match(/\b(\d{3,4})p(\d{2,3})?/i)})).filter(x=>x.match).sort((a,b)=>Number(b.match[1])-Number(a.match[1]) || Number(b.match[2]||0)-Number(a.match[2]||0));
    // High resolutions (4K/8K HDR) stutter in Safari; nothing above the cap is chosen.
    // If everything is above it, take the smallest level offered.
    const limit=Math.min(cap>0?cap:MAX_QUALITY,MAX_QUALITY);
    const allowed=all.filter(x=>Number(x.match[1])<=limit);
    const choices=allowed.length?allowed:all.slice(-1);
    // Remembers whether the chosen level is HDR (e.g. "2160p60 HDR") – used for HDR detection.
    if(choices.length){chosenLabel=choices[0].text;hdrSeen=/\bHDR\b/i.test(chosenLabel);choices[0].row.click();close();done=true;return;}
    const advanced=rows.find(row=>/^(Erweitert|Advanced)$/i.test(row.querySelector('.ytp-menuitem-label')?.textContent.trim() || row.textContent.trim()));
    if(advanced && stage!=='advanced'){advanced.click();stage='advanced';next=time+250;return;}
   }
   next=time+250;
  }
  return {tick,reset,get hdrSeen(){return hdrSeen;},get chosenLabel(){return chosenLabel;}};
 }
 return {create};
})();
