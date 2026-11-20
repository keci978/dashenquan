// Runtime URLs are content addressed; originals never belong in the served directory.
function assetUrl(name){const key=name.replace(/\.(png|webp)$/,'');return globalThis.BAMBOO_ASSETS?.[key]||`assets/${key}.webp`}
const warmedAssets=new Map();
function warmAssets(names){return Promise.all(names.map(name=>{const url=assetUrl(name);if(warmedAssets.has(url))return warmedAssets.get(url);const pending=new Promise(resolve=>{const img=new Image();img.decoding='async';img.fetchPriority='low';img.onload=()=>{if(img.decode)img.decode().catch(()=>{}).then(()=>resolve(true));else resolve(true)};img.onerror=()=>resolve(false);img.src=url});warmedAssets.set(url,pending);return pending}))}
function warmSceneAssets(next){const phase=GameWeather.get().night?'night':'day';return warmAssets([`${next==='room'?'room':'yard'}-${phase}-v2`,...(next==='room'?['read0','read1','read3','panda-sleep']:['tea0','tea1'])])}
function warmPanelAssets(type){if(type==='lottery')warmAssets(['lottery-pavilion','lottery-jar','shop-lantern','shop-boat-ticket','shop-lotus']);if(type==='shop')warmAssets(['shop-stall','shop-sign','shop-clerk0']);if(type==='friend')warmAssets(['friend-aguo','friend-jinjin','friend-baiyu','friend-fangfang'])}
if(typeof window!=='undefined'){
 window.addEventListener('load',()=>{const idle=window.requestIdleCallback||((fn)=>setTimeout(fn,1000));idle(()=>warmAssets(['tea1']).then(()=>warmSceneAssets('room')),{timeout:3000})},{once:true});
 document.addEventListener('pointerover',e=>{const action=e.target.closest?.('button')?.getAttribute('onclick')||'';if(action.includes("changeScene('room')"))warmSceneAssets('room');for(const panelName of ['lottery','shop','friend'])if(action.includes(`'${panelName}'`))warmPanelAssets(panelName)},{passive:true});
}
