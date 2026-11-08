'use strict';
const api=globalThis.browser || globalThis.chrome;
const {defaults,ranges,normalize,presets,presetValues,applyPreset,matchesPreset}=globalThis.GlowSettings;
let settings={...defaults},tabId=null,writeQueue=Promise.resolve(),custom=[],pendingDelete=null,deleteTimer=0;
const MAX_CUSTOM=12;
const el=id=>document.getElementById(id);
const units={brightness:' %',contrast:' %',saturation:' %',spread:' px',blur:' px',opacity:' %',smoothing:' %',fps:' fps',edgeFade:' %'};
function cleanCustom(list){return (Array.isArray(list)?list:[]).filter(p=>p && typeof p.name==='string' && p.name.trim() && p.values && typeof p.values==='object').slice(0,MAX_CUSTOM).map(p=>({name:p.name.trim().slice(0,24),values:presetValues(applyPreset(defaults,p.values))}));}
function saveCustom(){const snapshot=custom.map(p=>({...p}));writeQueue=writeQueue.then(()=>api.storage.local.set({glowPresets:snapshot})).catch(()=>{el('status').textContent='Preset could not be saved.';});}
function chip(name,values,removable){
 const wrap=document.createElement('span');wrap.className='chip'+(matchesPreset(settings,values)?' active':'');
 const load=document.createElement('button');load.type='button';load.textContent=name;load.setAttribute('aria-pressed',String(matchesPreset(settings,values)));
 load.addEventListener('click',()=>{settings=applyPreset(settings,values);render();save();});wrap.append(load);
 if(removable){
  const del=document.createElement('button');del.type='button';const confirming=pendingDelete===name;
  del.className='del'+(confirming?' confirm':'');del.textContent=confirming?'Delete?':'×';del.setAttribute('aria-label',confirming?`Really delete preset "${name}"`:`Delete preset "${name}"`);
  // Two clicks: ask first, then delete.
  del.addEventListener('click',()=>{clearTimeout(deleteTimer);if(pendingDelete===name){custom=custom.filter(p=>p.name!==name);pendingDelete=null;saveCustom();}else{pendingDelete=name;deleteTimer=setTimeout(()=>{pendingDelete=null;renderPresets();},3000);}renderPresets();});
  wrap.append(del);
 }
 return wrap;
}
function renderPresets(){const list=el('presetList');list.replaceChildren(...presets.map(p=>chip(p.name,p.values,false)),...custom.map(p=>chip(p.name,p.values,true)));el('presetSave').disabled=!el('presetName').value.trim();}
function savePreset(){
 const name=el('presetName').value.trim().slice(0,24);if(!name)return;
 const entry={name,values:presetValues(settings)};const index=custom.findIndex(p=>p.name===name);
 if(index>=0)custom[index]=entry;else{if(custom.length>=MAX_CUSTOM){el('status').textContent=`At most ${MAX_CUSTOM} custom presets. Delete one first.`;return;}custom.push(entry);}
 el('presetName').value='';saveCustom();renderPresets();
}
function render(){el('spread').disabled=settings.fullBleed;el('maxQuality').disabled=!settings.autoQuality;el('spread').setAttribute('aria-disabled',String(settings.fullBleed));for(const key of Object.keys(defaults)){if(typeof defaults[key]==='boolean')el(key).checked=settings[key];else{el(key).value=settings[key];const out=el(key+'Value');if(out)out.textContent=key==='fade'?(settings[key]/1000).toFixed(1)+' s':settings[key]+units[key];}}renderPresets();}
async function status(){if(tabId===null){el('status').textContent='Open a YouTube video in this tab.';return;}try{const result=await api.tabs.sendMessage(tabId,{type:'glowStatus'});el('status').textContent=result?.status || 'Please reload the page.';}catch{el('status').textContent='No connection to the video. Allow access to YouTube in Safari and reload the page.';}}
function save(){const snapshot={...settings};writeQueue=writeQueue.then(()=>api.storage.local.set({glowSettings:snapshot})).then(status).catch(()=>{el('status').textContent='Settings could not be saved.';});}
async function init(){
 try{const stored=await api.storage.local.get(['glowSettings','glowPresets']);settings=normalize(stored.glowSettings);custom=cleanCustom(stored.glowPresets);render();const tabs=await api.tabs.query({active:true,currentWindow:true});if(tabs[0] && /^https:\/\/www\.youtube\.com\//.test(tabs[0].url || ''))tabId=tabs[0].id;await status();}catch{render();el('status').textContent='Settings are currently unavailable.';}
 for(const key of Object.keys(defaults))el(key).addEventListener(typeof defaults[key]==='boolean' || el(key).tagName==='SELECT'?'change':'input',()=>{settings[key]=typeof defaults[key]==='boolean'?el(key).checked:Number(el(key).value);render();save();});
 el('presetSave').addEventListener('click',savePreset);
 el('presetName').addEventListener('input',renderPresets);
 el('presetName').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();savePreset();}});
 el('reset').addEventListener('click',()=>{settings={...defaults};render();save();});
 setInterval(status,1500);
}
init();
