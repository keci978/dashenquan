// Long recordings stream. Short gestures share decoded buffers and the effects bus.
globalThis.GameSfx=(()=>{
 const channels={master:['全部声音',0],bgm:['背景音乐',-8],amb:['自然环境声',-6],sfx:['交互音效',-3]};
 const clips=['ui01','ui02','ui03','ui04','ui05','ui06','ui07','prop01','prop02','prop03','fx-eat','fx-read','fx-diary','fx-tea','fx-feed'];
 const buffers=new Map(),effects=new Set(),timeouts=new Set(),streams=new Map();
 let ctx,master,filter,panner,limiter,buses={},quietTimer=0,quietUntil=0,musicId='',passes=0,pausedAt=0,effectEpoch=0;
 function prefs(){
  return state.audioMix??=Object.fromEntries(Object.entries(channels).map(([key,[,db]])=>[key,{on:key==='master'?!state.muted:key==='bgm'?state.roomMusic!==false:true,db}]));
 }
 function enabled(key){const p=prefs();return p.master.on&&p.master.db>-60&&p[key].on&&p[key].db>-60}
 function gain(value){return value<=-60?0:10**(value/20)}
 function ramp(param,value,seconds=.04){
  if(param.cancelAndHoldAtTime)param.cancelAndHoldAtTime(ctx.currentTime);
  else {const current=param.value;param.cancelScheduledValues(ctx.currentTime);param.setValueAtTime(current,ctx.currentTime)}
  param.linearRampToValueAtTime(value,ctx.currentTime+seconds);
 }
 function levels(){
  if(!ctx)return;
  const p=prefs(),duck=[...effects].some(e=>e.id==='prop03')?.5:1;
  for(const key of Object.keys(channels)){
   const node=key==='master'?master:buses[key];
   ramp(node.gain,p[key].on?gain(p[key].db)*(key==='bgm'?duck:1):0);
  }
 }
 function init(){
  if(ctx)return true;
  const Context=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Context)return false;
  ctx=new Context();master=ctx.createGain();limiter=ctx.createDynamicsCompressor();
  Object.assign(limiter.threshold,{value:-2});limiter.knee.value=2;limiter.ratio.value=16;limiter.attack.value=.003;limiter.release.value=.12;
  master.connect(limiter);limiter.connect(ctx.destination);
  for(const key of ['bgm','amb','sfx']){buses[key]=ctx.createGain();buses[key].connect(master)}
  filter=ctx.createBiquadFilter();filter.type='lowpass';filter.Q.value=.55;
  panner=ctx.createStereoPanner?.();if(panner){filter.connect(panner);panner.connect(buses.amb)}else filter.connect(buses.amb);
  levels();return true;
 }
 function buffer(id){
  if(!buffers.has(id))buffers.set(id,fetch('audio/'+id+(['ui01','ui02','ui03','ui06'].includes(id)?'.wav':'.mp3')).then(r=>{if(!r.ok)throw Error(id);return r.arrayBuffer()}).then(b=>ctx.decodeAudioData(b)).catch(()=>{buffers.delete(id);return null}));
  return buffers.get(id);
 }
 function unlock(){
  if(document.hidden||!init())return;
  if(ctx.state!=='running')ctx.resume().then(syncMusic).catch(()=>{});
  if(enabled('sfx'))for(const id of clips)buffer(id);
  syncMusic();
 }
 function stopProps(){for(const e of effects)if(e.id.startsWith('prop'))e.source.stop()}
 async function play(id,rate=1){
  if(!ctx||document.hidden||!enabled('sfx'))return;
  const epoch=effectEpoch,prop=id.startsWith('prop'),tag=prop?++propVersion:0;
  const sample=await buffer(id);
  if(!sample||epoch!==effectEpoch||document.hidden||!enabled('sfx')||(prop&&tag!==propVersion))return;
  if(prop)stopProps();
  const source=ctx.createBufferSource();source.buffer=sample;source.playbackRate.value=rate;source.connect(buses.sfx);
  const e={id,source};effects.add(e);source.onended=()=>{effects.delete(e);source.disconnect();if(id==='prop03')levels()};
  source.start();if(id==='prop03')levels();
 }
 let propVersion=0;
 function stopAll(){
  effectEpoch++;for(const t of timeouts)clearTimeout(t);timeouts.clear();for(const e of effects)e.source.stop();
 }
 function harvest(gold){
  if(!ctx||!enabled('sfx'))return;
  const later=(id,rate,ms)=>{const t=setTimeout(()=>{timeouts.delete(t);play(id,rate)},ms);timeouts.add(t)};
  for(let i=0;i<5;i++)later('ui03',1+i*.05,i*105);if(gold)later('ui04',1,480);
 }
 function seasonCue(term,now){
  // The Mid-Autumn date follows the lunar calendar, independently of solar terms.
  if(['春分','清明','夏至'].includes(term))return 'bgm05';
  if(['秋分','冬至'].includes(term))return 'bgm06';
  if(midAutumn(now))return 'bgm06';
  return '';
 }
 let checkedDay=-1,isFestival=false;
 function midAutumn(now){
  const day=Math.floor((now+28800000)/86400000);if(day===checkedDay)return isFestival;checkedDay=day;
  try{const parts=new Intl.DateTimeFormat('en-u-ca-chinese',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric'}).formatToParts(now);
   isFestival=parts.some(p=>p.type==='month'&&p.value==='8')&&parts.some(p=>p.type==='day'&&p.value==='15');
  }catch{isFestival=false}return isFestival;
 }
 function score(w,term,room,away,letter,now){
  const snow=/snow/i.test(w.type)||term==='冬至',rain=/rain|thunder/i.test(w.type)||term==='清明';
  return {bgm:letter?'bgm04':away?'bgm02':seasonCue(term,now)||(w.night?'bgm03':'bgm01'),
   base:room?'amb05':w.night?'amb02':'amb01',weather:snow?(room?'amb04-fire':'amb04'):rain?'amb03':''};
 }
 function destroy(track){track.player.onended=null;track.player.ontimeupdate=null;track.player.pause();track.player.removeAttribute('src');track.player.load();track.source.disconnect();track.fade.disconnect()}
 const retiring=new Set();
 function retire(slot,instant=false){
  const t=streams.get(slot);if(!t)return;streams.delete(slot);t.player.onended=t.player.ontimeupdate=null;
  if(instant){destroy(t);return}ramp(t.fade.gain,0,1.5);retiring.add(t);
  setTimeout(()=>{if(retiring.delete(t))destroy(t)},1550);
 }
 function start(slot,id){
  if(streams.get(slot)?.id===id)return;
  retire(slot);if(!id)return;
  const player=new Audio();player.preload='auto';player.loop=true;
  const source=ctx.createMediaElementSource(player),fade=ctx.createGain();fade.gain.value=0;
  source.connect(fade);fade.connect(slot==='bgm'?buses.bgm:filter);
  const t={id,player,source,fade};streams.set(slot,t);
  if(slot==='bgm'){
   let previous=0;
   player.ontimeupdate=()=>{if(previous>player.currentTime+2){passes++;if(passes>=1)player.loop=false}previous=player.currentTime};
   if(passes>=1)player.loop=false;
   player.onended=()=>{if(streams.get(slot)!==t)return;passes=0;quietUntil=Date.now()+30000;retire(slot,true);scheduleQuiet()};
  }
  player.src='audio/'+id+'.mp3';
  player.play().then(()=>{if(streams.get(slot)===t)ramp(fade.gain,1,1.5)}).catch(()=>{if(streams.get(slot)===t)retire(slot,true)});
 }
 function scheduleQuiet(){clearTimeout(quietTimer);quietTimer=setTimeout(syncMusic,Math.max(1,quietUntil-Date.now()+10))}
 function syncMusic(){
  if(!ctx||document.hidden)return;
  const w=weatherInfo(),room=scene==='room',now=Date.now(),letter=panel==='return'||panel==='letter'||(panel==='album'&&journalKind==='postcards'&&journalView!=='list'&&(journalView==='envelope'||state.tripPostcards?.[journalIndex]?.rarity==='SSR'));
  const plan=score(w,term(),room,state.mode==='travel'&&!room,letter,now);
  if(plan.bgm!==musicId){musicId=plan.bgm;passes=0;quietUntil=0;clearTimeout(quietTimer)}
  if(enabled('bgm')&&quietUntil<=now)start('bgm',plan.bgm);else retire('bgm',true);
  if(enabled('amb')){start('base',plan.base);start('weather',plan.weather)}else{retire('base',true);retire('weather',true)}
  ramp(filter.frequency,room?1800:15500,1.5);if(panner)ramp(panner.pan,room?.16:-.16,1.5);
 }
 function update(key,field,value){
  const p=prefs();if(field==='on')p[key].on=value;else p[key].db=Math.max(-60,Math.min(0,Number(value)));
  if(!enabled('sfx'))stopAll();levels();syncMusic();save();
 }
 function display(db){return db<=-60?'静音':db+' dB'}
 function settings(){
  const p=prefs();return '<fieldset class="audio-mix"><legend>声音设置</legend>'+Object.entries(channels).map(([key,[name]])=>{
   const {on,db}=p[key];return `<div class="audio-channel"><label><input type="checkbox" role="switch" ${on?'checked':''} onchange="GameSfx.update('${key}','on',this.checked)">${name}</label><output id="vol-${key}">${display(db)}</output><input type="range" aria-label="${name}音量" min="-60" max="0" step="1" value="${db}" oninput="GameSfx.update('${key}','db',this.value);this.previousElementSibling.value=GameSfx.display(+this.value)"></div>`;
  }).join('')+'</fieldset>';
 }
 document.addEventListener('pointerdown',unlock,{capture:true,once:true});document.addEventListener('keydown',unlock,{capture:true,once:true});
 document.addEventListener('click',e=>{if(ctx?.state!=='running')unlock();if(e.target.closest?.('#navigation button,button.primary:not(:disabled)'))play('ui01')},true);
 document.addEventListener('visibilitychange',()=>{
  if(!ctx)return;
  if(document.hidden){pausedAt=Date.now();clearTimeout(quietTimer);stopAll();for(const t of streams.values())t.player.pause();for(const t of retiring)destroy(t);retiring.clear();ctx.suspend().catch(()=>{})}
  else{if(quietUntil>pausedAt){quietUntil+=Date.now()-pausedAt;scheduleQuiet()}ctx.resume().catch(()=>{});syncMusic();for(const t of streams.values())if(t.player.paused)t.player.play().catch(()=>{})}
 });
 return {play,harvest,syncMusic,stopAll,stopProps(){propVersion++;stopProps()},settings,update,display,enabled,score,panelSound(kind){if(['bag','reserve','shop','album','souvenirs'].includes(kind))play('ui02')}};
})();
;
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
;
// Shared game weather. Beijing time keeps scene changes/devices on the same clock.
const GameWeather=(()=>{
 const HOUR=3600000,SLOT=3*HOUR,OFFSET=8*HOUR,EPOCH=Math.floor(Date.UTC(2020,0,1)/SLOT);
 const names={clear:'晴',cloudy:'多云',overcast:'阴天',fog:'雾',lightRain:'小雨',heavyRain:'大雨',thunder:'雷雨',lightSnow:'小雪',heavySnow:'大雪'};
 const graph={clear:['clear','cloudy'],cloudy:['clear','cloudy','overcast','fog'],overcast:['cloudy','overcast','fog','lightRain','lightSnow'],fog:['fog','cloudy','overcast'],lightRain:['overcast','lightRain','heavyRain'],heavyRain:['lightRain','heavyRain','thunder'],thunder:['heavyRain','thunder'],lightSnow:['overcast','lightSnow','heavySnow'],heavySnow:['overcast','lightSnow','heavySnow']};
 const weights={spring:{clear:18,cloudy:32,overcast:20,fog:8,lightRain:18,heavyRain:4},summer:{clear:23,cloudy:25,overcast:12,fog:3,lightRain:15,heavyRain:14,thunder:8},autumn:{clear:36,cloudy:30,overcast:15,fog:12,lightRain:6,heavyRain:1},winter:{clear:27,cloudy:25,overcast:18,fog:10,lightRain:7,heavyRain:1,lightSnow:10,heavySnow:2}};
 const seasonNames={spring:'春季',summer:'夏季',autumn:'秋季',winter:'冬季'};
 function seasonAtLocal(localMs){const year=new Date(localMs).getUTCFullYear();const crossing=i=>31556925974.7*(year-1900)+termMinutes[i]*60000+Date.UTC(1900,0,6,2,5)+OFFSET;return localMs<crossing(2)||localMs>=crossing(20)?'winter':localMs<crossing(8)?'spring':localMs<crossing(14)?'summer':'autumn'}
 function random(slot,salt){let x=(slot^salt)>>>0;x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);return ((x^(x>>>16))>>>0)/4294967296}
 function transition(previous,slot){const season=seasonAtLocal(slot*SLOT),pool=graph[previous];let total=0;for(const id of pool)total+=weights[season][id]||0;if(!total)return 'overcast';let roll=random(slot,0x51a37)*total;for(const id of pool){roll-=weights[season][id]||0;if(roll<0)return id}return pool.find(id=>weights[season][id]>0)||'overcast'}
 // Reconstruct from a fixed epoch on first use; subsequent slots are incremental.
 // No save-game fields or refresh-time random draws are involved.
 let lastSlot=EPOCH,lastType='cloudy';
 function typeAt(slot){if(slot<lastSlot){lastSlot=Math.min(slot,EPOCH);lastType='cloudy'}while(lastSlot<slot){lastSlot++;lastType=transition(lastType,lastSlot)}return lastType}
 function clockLabel(timestamp,now){const date=new Date(timestamp+OFFSET),current=new Date(now+OFFSET);const nextDay=date.toISOString().slice(0,10)!==current.toISOString().slice(0,10);return (nextDay?'明天 ':'')+String(date.getUTCHours()).padStart(2,'0')+':'+String(date.getUTCMinutes()).padStart(2,'0')}
 function get(now=Date.now()){
  const local=now+OFFSET,day=new Date(local),hour=day.getUTCHours(),slot=Math.floor(local/SLOT),type=typeAt(slot),season=seasonAtLocal(local);
  const windRoll=random(slot,0x724ca),wind=windRoll<(season==='winter'?.4:.5)?'calm':windRoll<.9?'breeze':'windy';
  const nextUpdate=(slot+1)*SLOT-OFFSET,nextPhaseLocal=Date.UTC(day.getUTCFullYear(),day.getUTCMonth(),day.getUTCDate(),hour<6?6:hour<18?18:30);
  return {type,label:names[type],night:hour<6||hour>=18,period:slot,season,seasonLabel:seasonNames[season],wind,windLabel:{calm:'无风',breeze:'微风',windy:'有风'}[wind],nextUpdate,until:clockLabel(nextUpdate,now),nextPhase:nextPhaseLocal-OFFSET,nextPhaseLabel:clockLabel(nextPhaseLocal-OFFSET,now),clock:String(hour).padStart(2,'0')+':'+String(day.getUTCMinutes()).padStart(2,'0')};
 }
 function iconFor(w){const n=w.night;return {clear:`header-weather-${n?1:0}`,cloudy:`header-weather-${n?3:2}`,overcast:`header-weather-${n?5:4}`,fog:`header-weather-${n?11:10}`,lightRain:`header-weather-${n?7:6}`,heavyRain:'weather1',thunder:'weather2',lightSnow:'weather3',heavySnow:'weather4'}[w.type]||'header-weather-0'}
 const terms=['小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至'];
 const termMinutes=[0,21208,42467,63836,85337,107014,128867,150921,173149,195551,218072,240693,263343,285989,308563,331033,353350,375494,397447,419210,440795,462224,483532,504758];
 const termCache=new Map();
 function term(now=Date.now()){const year=new Date(now+OFFSET).getUTCFullYear();let dates=termCache.get(year);if(!dates){dates=termMinutes.map(m=>31556925974.7*(year-1900)+m*60000+Date.UTC(1900,0,6,2,5));termCache.set(year,dates)}let result='冬至';for(let i=0;i<24;i++){if(now>=dates[i])result=terms[i]}return result}
 return {get,iconFor,term,graph,transition,seasonAtLocal,SLOT,OFFSET};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GameWeather;
;
// Scene interactions share the existing persisted harvest timestamp and balance.
let drinkingUntil=0, teaTimer=0, harvestClickBlockedUntil=0, harvestGesture=null;
const FIELD_CYCLE_MS=60000;
const GOLDEN_FIELD_CHANCE=.10;
const GOLDEN_FIELD_PITY=10;
// One persisted roll per whole field, with at most one golden shoot.
function ensureFieldRoll(){
 const cycle=state.harvest||0;
 if(!Number.isInteger(state.goldenHarvestMisses)||state.goldenHarvestMisses<0)state.goldenHarvestMisses=0;
 if(!state.shootCycle||state.shootCycle.cycle!==cycle||!Number.isInteger(state.shootCycle.goldenIndex)||state.shootCycle.goldenIndex < -1||state.shootCycle.goldenIndex>4){
  state.shootCycle={cycle,goldenIndex:(state.goldenHarvestMisses>=GOLDEN_FIELD_PITY-1||Math.random()<GOLDEN_FIELD_CHANCE)?Math.floor(Math.random()*5):-1};save();
 }
 return state.shootCycle;
}
function shootVisual(stage,index){
 const golden=stage===3&&ensureFieldRoll().goldenIndex===index;
 return {golden,src:assetUrl(golden?'golden-shoot-v2':`shoot-stage-${Math.min(stage,2)}`),alt:golden?'四叶金竹笋':['幼笋','生长中的竹笋','即将成熟的竹笋','成熟春笋'][stage]};
}
function harvestLabel(){return growthStage()===3?(ensureFieldRoll().goldenIndex>=0?'划动收春笋，收获20竹笋和四叶金竹笋1个':'划动收春笋，收获20竹笋'):'竹笋生长中'}
function isDrinking(){return Date.now()<drinkingUntil}
function growthStage(now=Date.now()){
 if(!state.harvest||now-state.harvest>=FIELD_CYCLE_MS)return 3;
 const age=Math.max(0,now-state.harvest);
 return age<20000?0:age<40000?1:2;
}
function fieldMarkup(){
 const stage=growthStage(), ripe=stage===3;ensureFieldRoll();
 const spots=[[10,73.2,8,8],[19,71.5,9,9.7],[28,73.4,8.5,8.5],[35,72.4,8,9],[22.5,75.5,8,8]];
 return `<div id="shoot-field" class="${ripe?'ripe':'growing'}" data-stage="${stage}">${spots.map(([x,y,w,h],i)=>{const visual=shootVisual(stage,i);return `<img class="prop shoot${visual.golden?' golden':''}" src="${visual.src}" alt="${visual.alt}" style="left:${x}%;top:${y}%;width:${w}%;height:${h}%;--delay:${i*.18}s;--growth:${[.45,.7,.88,1][stage]}">`}).join('')}</div>`;
}
function harvestHotspot(){
 const ready=growthStage()===3;
 return `<button id="harvest-zone" class="hotspot harvest-zone ${ready?'ready':''}" title="每块笋田10%概率出现四叶金竹笋；连续9次未收获，第10次保底。仅成功收获计数。" aria-label="${harvestLabel()}" style="left:4%;top:71%;width:45%;height:15%" onclick="harvestTap(event)"><span id="field-label">${ready?'划一划，收春笋':'竹笋生长中'}</span><i class="swipe-guide" aria-hidden="true"></i></button>`;
}
function feedbackLayer(){let layer=$('feedback-layer');if(!layer){layer=document.createElement('div');layer.id='feedback-layer';layer.setAttribute('aria-hidden','true');$('game').appendChild(layer)}return layer}
function addFeedback(className,style='',text=''){
 const node=document.createElement('div');node.className=className;node.style.cssText=style;node.textContent=text;feedbackLayer().appendChild(node);return node;
}
function clearLater(node,ms){setTimeout(()=>node.remove(),ms)}
function takeMatureField(now){
 if(growthStage(now)!==3)return null;
 // Commit once before showing visual feedback, including multiple pointer samples.
 const foundCharm=ensureFieldRoll().goldenIndex>=0;state.goldenHarvestMisses=foundCharm?0:Math.min(GOLDEN_FIELD_PITY-1,state.goldenHarvestMisses+1);state.leaves+=20;if(foundCharm)state.inventory.charm=(state.inventory.charm||0)+1;state.harvest=now;ensureFieldRoll();save();return {foundCharm};
}
function collectShoots(){
 if(scene!=='yard')return false;
 const now=Date.now();
 if(state.harvest&&now-state.harvest<FIELD_CYCLE_MS){toast(`竹笋正在长大，再等 ${Math.ceil((FIELD_CYCLE_MS-now+state.harvest)/1000)} 秒`);return false}
 const {foundCharm}=takeMatureField(now);render();
 globalThis.GameSfx?.harvest(foundCharm);
 $('field-label').textContent='已收获 · 等春笋再长大';
 const layer=feedbackLayer();layer.querySelectorAll('.harvest-feedback').forEach(n=>n.remove());

 const amount=addFeedback('harvest-feedback harvest-amount','left:22%;top:70%;','＋20');clearLater(amount,1600);
 if(foundCharm){
  const reward=addFeedback('harvest-feedback golden-reward','left:6%;top:58%;','四叶金竹笋 ＋1 · 已存入护身符库存');reward.setAttribute('role','status');reward.setAttribute('aria-live','polite');reward.parentElement.removeAttribute('aria-hidden');clearLater(reward,4000);
 }
 toast(foundCharm?'竹笋 ＋20 · 四叶金竹笋 ＋1（已入库）':'收获竹笋 ＋20');
 if(state.motion&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
  const game=$('game').getBoundingClientRect(), target=$('balance').getBoundingClientRect();
  for(let i=0;i<5;i++){
   const x=game.width*(.14+i*.055),y=game.height*(.77+(i%2)*.025);
   const dx=target.left+target.width/2-game.left-x,dy=target.top+target.height/2-game.top-y;
   const leaf=addFeedback('harvest-feedback flying-leaf',`left:${x}px;top:${y}px;--dx:${dx}px;--dy:${dy}px;--delay:${i*85}ms`);
   clearLater(leaf,1900);
  }
  if(foundCharm){const stars=addFeedback('harvest-feedback field-sparkles','left:13%;top:71%;');clearLater(stars,1200);}
 }
 setTimeout(()=>{if(scene==='yard'){$('balance').classList.remove('balance-pop');void $('balance').offsetWidth;$('balance').classList.add('balance-pop')}},900);
 return true;
}
function harvestTap(event){if(event?.detail!==0&&Date.now()<harvestClickBlockedUntil)return;collectShoots()}
function startTea(){warmAssets(['tea0','tea1','tea2','tea3','tea4','tea5']);
 if(isDrinking()){toast('它正捧着热茶，陪你歇一会儿');return}
 globalThis.GameSfx?.play('fx-tea');
 drinkingUntil=Date.now()+4800;
 clearTimeout(teaTimer);
 let frame=0;
 const step=()=>{
  if(scene!=='yard'||state.mode!=='home'||!isDrinking()){drinkingUntil=0;pandaFrame=0;const layer=$('feedback-layer');if(layer)layer.querySelectorAll('.tea-feedback').forEach(n=>n.remove());render();return}
  pandaFrame=[0,1,2,3,4,5,0][frame];
  $('panda').src=assetUrl(`tea${pandaFrame}`);
  const h=$('hotspots').querySelector('[onclick="pandaClick()"] span');if(h)h.textContent='喝茶中';
  frame++;
  if(frame<7)teaTimer=setTimeout(step,state.motion?620:220);
  else teaTimer=setTimeout(()=>{drinkingUntil=0;pandaFrame=0;render()},450);
 };
 const layer=feedbackLayer();layer.querySelectorAll('.tea-feedback').forEach(n=>n.remove());
 const bubble=addFeedback('tea-feedback tea-bubble','left:11%;top:46%;','陪我喝杯茶吧～');
 const steam=addFeedback('tea-feedback tea-steam','left:14%;top:52%;');
 clearLater(bubble,4800);clearLater(steam,4800);
 step();
}
// Pointer Events cover touch, pen and mouse, including a captured drag outside the button.
document.addEventListener('pointerdown',event=>{
 if(event.button!==0||harvestGesture||panel||scene!=='yard')return;
 const zone=event.target.closest?.('#harvest-zone');if(!zone)return;
 harvestGesture={id:event.pointerId,x:event.clientX,y:event.clientY,done:false,zone};
 zone.setPointerCapture?.(event.pointerId);
});
document.addEventListener('pointermove',event=>{
 const g=harvestGesture;if(!g||g.id!==event.pointerId||g.done)return;
 const dx=event.clientX-g.x,dy=event.clientY-g.y;
 if(Math.hypot(dx,dy)<18)return;
 g.done=true;harvestClickBlockedUntil=Date.now()+700;collectShoots();
});
function releaseHarvest(event){if(harvestGesture?.id===event.pointerId){if(event.type==='pointercancel'||harvestGesture.done)harvestClickBlockedUntil=Date.now()+700;harvestGesture=null}}
document.addEventListener('pointerup',releaseHarvest);document.addEventListener('pointercancel',releaseHarvest);
// Keep visible growth consistent across refreshes and screen changes; no timer-generated rewards.
let lastGrowthStage=-1;
setInterval(()=>{
 if(typeof state==='undefined'||document.hidden||scene!=='yard')return;
 const stage=growthStage();if(stage===lastGrowthStage)return;lastGrowthStage=stage;
 const field=$('shoot-field');if(field&&Number(field.dataset.stage)!==stage){
  field.dataset.stage=stage;field.className=stage===3?'ripe':'growing';
  field.querySelectorAll('img').forEach((im,i)=>{const visual=shootVisual(stage,i);im.src=visual.src;im.classList.toggle('golden',visual.golden);im.style.setProperty('--growth',[.45,.7,.88,1][stage]);im.alt=visual.alt});
  const zone=$('harvest-zone');zone.classList.toggle('ready',stage===3);zone.setAttribute('aria-label',harvestLabel());
  $('field-label').textContent=stage===3?'划一划，收春笋':'竹笋生长中';
 }
},1000);
;
let restPhase='sleeping',restTimer=0,restFeedbackTimer=0;
function cancelRestTransition(){clearTimeout(restTimer);restPhase='sleeping'}
function restHotspots(){
 if(state.mode==='rest')return hotspot('安睡中',5,40,47,18,'sleepFeedback()')+hotspot('轻轻叫醒',27,57,26,8,'wakePanda()');
 return hotspot('上床休息',5,40,48,22,'rest()');
}
function beginRest(){
 if(state.mode==='travel'){toast('它还在远方，床铺已经准备好啦');return}
 if(state.mode==='prepare'){toast('正在准备出发，暂时不休息啦');return}
 if(state.mode==='rest'){sleepFeedback();return}
 if(scene!=='room')changeScene('room');
 clearTimeout(teaTimer);drinkingUntil=0;
 const feedback=$('feedback-layer');if(feedback)feedback.querySelectorAll('.tea-feedback').forEach(n=>n.remove());
 restPhase='settling';state.mode='rest';state.restStarted=Date.now();pandaFrame=0;save();render();
 toast('它钻进被窝，找了个舒服的姿势');
 clearTimeout(restTimer);restTimer=setTimeout(()=>{restPhase='sleeping';if(state.mode==='rest')syncRestScene()},750);
}
function syncRestScene(){
 const sleeping=state.mode==='rest',inRoom=scene==='room';
 $('game').classList.toggle('is-resting',sleeping&&inRoom);
 $('game').classList.toggle('rest-settling',sleeping&&inRoom&&restPhase==='settling');
 $('game').classList.toggle('rest-waking',sleeping&&inRoom&&restPhase==='waking');
 let z=$('sleep-signs');if(!z){z=document.createElement('div');z.id='sleep-signs';z.setAttribute('aria-hidden','true');$('world').appendChild(z)}
 z.hidden=!sleeping||!inRoom;z.innerHTML='<i>z</i><i>z</i><i>Z</i>';
}
function sleepFeedback(){
 if(state.mode!=='rest')return;
 if(scene!=='room'){changeScene('room');toast('它在竹床上睡得很香');return}
 if(restPhase==='waking')return;
 toast('嘘，让它继续做个好梦吧。');
 const z=$('sleep-signs');if(z){z.classList.add('sleep-response');clearTimeout(restFeedbackTimer);restFeedbackTimer=setTimeout(()=>z.classList.remove('sleep-response'),1400)}
}
function restPanel(){
 const mins=state.restStarted?Math.max(0,Math.floor((Date.now()-state.restStarted)/60000)):0;
 return `<img class="sleep-preview" src="${assetUrl('panda-sleep')}" decoding="async" alt="侧躺盖被、枕着枕头安睡的小熊猫"><p class="rest-copy">它把自己裹进软软的被子里，<br>呼吸慢下来，做起了竹林里的梦。</p><p class="muted rest-copy">${mins?'已休息 '+mins+' 分钟':'刚刚睡下'} · 整理行囊、查看收藏都不会打扰它</p>${button('轻轻叫醒它','wakePanda()')}${button('让它再睡一会儿','closePanel()',true)}`;
}
function wakePanda(){
 if(state.mode!=='rest'||restPhase==='waking')return;
 closePanel();restPhase='waking';syncRestScene();toast('它揉揉眼睛，慢慢伸了个懒腰');
 clearTimeout(restTimer);
 restTimer=setTimeout(()=>{
  if(state.mode!=='rest')return;
  state.stamina=Math.min(100,(state.stamina??100)+Math.floor(Math.max(0,Date.now()-state.restStarted)/3600000*20));state.mode='home';if(state.reserveAt)state.reserveAt=Date.now()+GameTravel.reserveDelay(state);state.restStarted=0;restPhase='sleeping';pandaFrame=0;save();render();
  toast(scene==='room'?'醒来啦，又坐回蒲团翻书了':'它醒来啦，精神满满');
 },state.motion?650:0);
}
;
// The animation clips use the original painted sprites and independent weighted joints.
let roomPoseIndex=0, roomPoseSince=0;
const roomPoseInfo={
 read:['陪它读书','滚滚捧着《神州食谱》，读着读着点了点头。','read0'],
 eat:['陪它啃竹子','它捧起嫩竹，耳朵跟着咀嚼轻轻一抖。','pose-eat'],
 diary:['看它写手账','它晃着小短腿，把今天的小事写进手账。','pose-diary'],
 brush:['看它挥毫','它蘸了徽墨，在宣纸上添了一枝竹。','pose-brush'],
 tea:['陪它品茗','它捧起青花茶盏，小口品茶。','tea0']
};
function motionAllowed(){return state.motion && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches}
function availableRoomPoses(){
 const gifts=state.travelSouvenirs||[], poses=['read','eat','diary'];
 if(gifts.some(g=>Number(g.id)===5007||/徽墨|歙砚/.test(g.name)))poses.push('brush');
 if(gifts.some(g=>Number(g.id)===5008||/青花.*(茶盏|瓷杯)/.test(g.name)))poses.push('tea');
 return poses;
}
function roomPose(){const poses=availableRoomPoses();return poses[roomPoseIndex%poses.length]}
function scenePandaAsset(){
 if(state.mode==='rest')return 'panda-sleep';
 if(scene==='room'&&state.mode==='home')return motionAllowed()?'motion-'+roomPose():roomPoseInfo[roomPose()][2];
 return (scene==='yard'?'tea':'read')+pandaFrame;
}
function nextRoomPose(announce){
 roomPoseIndex++;roomPoseSince=Date.now();render();
 if(announce){const pose=roomPose();globalThis.GameSfx?.play('fx-'+(pose==='brush'?'diary':pose));toast(roomPoseInfo[pose][1])}
}
function companionArt(id){
 return motionAllowed()?'motion-'+id:'friend-'+id;
}
function playFoodMotion(id,result){
 globalThis.GameSfx?.play('fx-feed');
 if(!motionAllowed())return;
 const target=document.querySelector('.friend-feed-target'), portrait=target?.querySelector('img');
 if(!portrait)return;
 const strong=result.taste==='超爱',middle=result.taste==='喜欢';
 target.dataset.taste=strong?'love':middle?'like':'plain';
 target.dataset.animal=id;
 const favoritePose=strong&&(id!=='fangfang'||/肉干/.test(result.food.name));
 portrait.src=assetUrl(favoritePose?'motion-'+id+'-react':companionArt(id));
 const dish=document.createElement('img');dish.className='held-food';dish.alt='';dish.src=assetUrl(result.food.img);target.appendChild(dish);
 if(id==='fangfang'&&strong&&/肉干/.test(result.food.name)){
  const petals=document.createElement('i');petals.className='fox-blossoms';petals.textContent='✿　✧　❀';target.appendChild(petals);
 }
 const clip=portrait.animate(foodKeys(id,strong,middle),{duration:1350,easing:'ease-in-out'});
 clip.onfinish=()=>{if(!portrait.isConnected)return;portrait.src=assetUrl(companionArt(id));dish.remove();target.querySelector('.fox-blossoms')?.remove();delete target.dataset.taste};
}
function foodKeys(id,strong,middle){
 const rest={transform:'none'};
 if(!strong&&!middle)return [rest,{transform:'translateY(2%) rotate(2deg)'},rest];
 if(id==='aguo'||id==='jinjin'){
  const flip=id==='jinjin'?-1:1;
  return [rest,{transform:'translateY(-5%) rotate('+(-12*flip)+'deg)'},{transform:'translateY(-15%) rotate('+((strong?330:16)*flip)+'deg)'},{transform:'rotate('+((strong?360:0)*flip)+'deg)'}];
 }
 if(id==='baiyu')return [rest,{transform:'translateY(-8%) rotate(-6deg)'},{transform:'translateY(-3%) rotate(5deg)'},rest];
 return [rest,{transform:'translateY(-2%) scale(1.035)'},rest];
}
globalThis.playPandaDeparture=function(){
 const layer=$('feedback-layer');if(!layer||!motionAllowed())return;
 const art=document.createElement('img');art.className='departing-panda';art.alt='滚滚背起小竹篓，挥爪走向院门';art.src=assetUrl('motion-door');layer.appendChild(art);
 art.addEventListener('animationend',()=>art.remove(),{once:true});setTimeout(()=>art.remove(),2400);
};
;
const $=id=>document.getElementById(id);
const initial={leaves:1280,tickets:3,inventory:{rice:2,wrap:1,charm:1,umbrella:1,tent:1,kettle:1},bag:[null,null,null,null],reserve:[null,null,null,null],mode:'home',preparedAt:0,start:0,end:0,harvest:0,mail:1,album:0,souvenirs:0,draws:0,motion:true};
function newGameState(){return {...structuredClone(initial),introTrip:0,mail:0}}
let state;
try{
 const saved=JSON.parse(localStorage.getItem('bamboo-home-v1')||'null');
 state=saved?{...structuredClone(initial),...saved}:newGameState();
}catch{state=newGameState()}
let scene='yard',panel='',slot=0,draft=[],reserveDraft=[],reserveSlot=0,shopTab='food',collectionTab='postcards',pandaFrame=0,toastTimer,previousFocus;
const items={rice:{name:'桂花饭团',type:0,img:'item0',price:45,desc:'一份带着桂花香的出行便当'},wrap:{name:'竹叶糯米饭',type:0,img:'item1',price:65,desc:'用竹叶包住家里的味道'},charm:{name:'四叶平安符',type:1,img:'item4',price:160,desc:'一份陪伴旅途的小小祝福'},umbrella:{name:'竹韵油纸伞',type:2,img:'item8',price:120,desc:'晴天遮阳，雨天听雨'},tent:{name:'山野小帐篷',type:2,img:'item9',price:220,desc:'在山间留宿的安心角落'},kettle:{name:'青花水壶',type:2,img:'item10',price:90,desc:'带上温水，慢慢走'}};
// Upgrade the original two unrestricted reserve positions into four typed positions.
if(!Array.isArray(state.reserve)||state.reserve.length!==4){
 const old=Array.isArray(state.reserve)?state.reserve:[];state.reserve=[null,null,null,null];
 old.forEach(id=>{const type=items[id]?.type;if(type===undefined)return;const i=type<2?type:(state.reserve[2]?3:2);if(!state.reserve[i])state.reserve[i]=id});
}
const image=(name,cls='')=>`<img class="${cls}" src="${assetUrl(name)}" alt="" loading="lazy" decoding="async">`;
const save=()=>localStorage.setItem('bamboo-home-v1',JSON.stringify(state));
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2600)}
function button(text,fn,secondary=false,disabled=false){return `<button class="${secondary?'secondary':'primary'}" onclick="${fn}" ${disabled?'disabled':''}>${text}</button>`}
function hotspot(label,x,y,w,h,action,dot=false){return `<button class="hotspot" aria-label="${label}" style="left:${x}%;top:${y}%;width:${w}%;height:${h}%" onclick="${action}"><span>${label}</span>${dot?'<i class="dot"></i>':''}</button>`}
function prop(name,x,y,w,h,extra=''){return `<img class="prop ${extra}" src="${assetUrl(name)}" alt="" loading="lazy" decoding="async" style="left:${x}%;top:${y}%;width:${w}%;height:${h}%">`}
function weatherInfo(now=Date.now()){return GameWeather.get(now)}
function weatherIcon(w){return `<img class="weather-symbol" src="${assetUrl(GameWeather.iconFor(w))}" alt="${w.label}${w.night?'夜间':'白昼'}" width="28" height="28" onerror="this.onerror=null;this.src=assetUrl('header-weather-0')">`}
function term(now=Date.now()){return GameWeather.term(now)}
function syncSceneBackground(w){
 const background=$('background'),prefix=scene==='room'?'room':'yard',phase=w.night?'night':'day';
 const source=assetUrl(`${prefix}-${phase}-v2`);
 // Select the correct phase directly; scene navigation must never reveal a day fallback.
 if(background.getAttribute('src')!==source)background.src=source;
}
function syncSceneWeather(w){
 const layer=$('scene-weather');
 const key=[scene,w.type,w.wind,w.night].join('/');
 if(layer.dataset.key===key)return;
 layer.dataset.key=key;
 layer.dataset.type=w.type;
 layer.dataset.wind=w.wind;
 const counts={lightRain:24,heavyRain:58,thunder:52,lightSnow:18,heavySnow:42};
 const count=Math.ceil((counts[w.type]||0)*(scene==='room'?.28:1));
 const snow=w.type.endsWith('Snow');
 const particles=[];
 for(let i=0;i<count;i++){
  const depth=((i*17)%31)/30;
  const duration=snow?4+depth*3:.68+depth*.48;
  const phase=((i*43+11)%101)/101;
  particles.push(`<i style="left:${((i*61+17)%113)-6}%;--rest-y:${(phase*100).toFixed(2)}%;opacity:${(.4+depth*.5).toFixed(2)};--size:${(1.4+depth*2.3).toFixed(2)}px;animation-duration:${duration.toFixed(2)}s;animation-delay:-${(phase*duration).toFixed(2)}s"></i>`);
 }
 layer.innerHTML=particles.join('');
}
function syncWeatherUI(now=Date.now()){
 const w=weatherInfo(now);syncSceneBackground(w);syncSceneWeather(w);$('game').classList.toggle('night',w.night);$('game').dataset.phase=w.night?'night':'day';
 const weatherMarkup=weatherIcon(w)+`<span class="weather-copy"><b>${term(now)}</b><small>${w.label} · ${w.night?'夜':'昼'}</small></span>`;if($('weather').innerHTML!==weatherMarkup)$('weather').innerHTML=weatherMarkup;
 $('weather').setAttribute('aria-label',`${term(now)}，${w.label}，${w.night?'夜间':'白昼'}，${w.windLabel}`);
 globalThis.GameSfx?.syncMusic();
 if(panel==='weather')$('panel-body').innerHTML=weatherDetail(now);
 return w;
}
function weatherDetail(now=Date.now()){
 const w=weatherInfo(now);
 return `<div class="weather-detail-hero">${weatherIcon(w)}<div><h4>${term(now)} · ${w.label}</h4><p>${w.night?'夜晚':'白昼'} · ${w.seasonLabel}</p></div></div><div class="card weather-facts"><div><span>当前风力</span><b>${w.windLabel}</b></div><div><span>本轮天气持续至</span><b>${w.until}</b></div><div><span>游戏时间（北京时间）</span><b>${w.clock}</b></div><div><span>${w.night?'下次天亮':'下次入夜'}</span><b>${w.nextPhaseLabel}</b></div></div><p class="muted">竹林小院与温馨竹屋共享游戏内天气，每3小时更新。同一时段刷新或切换场景，天气保持一致。</p><p class="muted">天气会随季节逐步变化。小院里能看见天色、雨雪和雾气，竹屋里也能透过圆窗看天气。天气不影响出发、旅行倒计时和竹笋收益。</p>`;
}
function ambientTeaSteam(left,top){return state.mode==='home'||state.mode==='prepare'?`<span class="steam" style="left:${left}%;top:${top}%">〰</span>`:''}
function render(){updateTime();if(scene!=='yard'||state.mode!=='home'){clearTimeout(teaTimer);drinkingUntil=0;const feedback=$('feedback-layer');if(feedback)feedback.querySelectorAll('.tea-feedback').forEach(n=>n.remove());}$('balance').textContent=state.leaves.toLocaleString();$('rare-balance').textContent=(state.inventory.charm||0).toLocaleString();$('game').dataset.mode=state.mode;$('game').className=(scene==='room'?'room ':'')+(state.mode==='travel'?'travelling ':'')+(!state.motion?'reduce-motion':'');syncWeatherUI();$('scene-title').textContent=scene==='yard'?'竹林小院':'温馨竹屋';$('background').alt=scene==='yard'?'竹林、溪流、石桌和竹笋田':'竹床、矮桌与收藏柜的温馨竹屋';$('panda').hidden=state.mode==='travel'||(state.mode==='rest'&&scene==='yard');$('panda').className='panda'+(state.mode==='rest'&&scene==='room'?' sleeping':'');$('panda').src=assetUrl(scenePandaAsset());$('panda').alt=state.mode==='rest'?'在竹床上休息的熊猫':scene==='yard'?'坐在石凳上喝茶的熊猫':(state.mode==='home'?roomPoseInfo[roomPose()][1]:'正在看地图的熊猫');$('status').textContent={home:'它在家里，享受慢时光',rest:'它在竹床上睡得正香 · 查看休息',prepare:'行囊已备好 · 正在看地图',travel:'正在旅行 · 点击查看旅程'}[state.mode];
$('environment').innerHTML=scene==='yard'?prop('plant0',-6,0,38,25,'branch')+prop('plant1',70,0,37,22,'branch right')+ambientTeaSteam(43.5,55.3)+`<i class="ripple"></i>`:prop('prop4',83,9,11,20,'lantern')+prop('prop5',79,11,19,20,'lamp-glow');
if(scene==='yard'){$('objects').innerHTML=prop(state.mail?'prop1':'prop0',68,52,28,28)+fieldMarkup()+companionSceneMarkup()+`<i class="cup-contact-shadow" aria-hidden="true"></i>`+prop('prop6',40,54,7,5,'tea-cup');$('hotspots').innerHTML=hotspot('去竹屋 →',71,25,27,20,"changeScene('room')")+harvestHotspot()+hotspot(state.mail?'有新来信':'信箱',73,58,25,16,"openPanel('mail')",state.mail>0)+(state.mode==='travel'?'':hotspot(state.mode==='rest'?'正在竹屋安睡':(isDrinking()?'喝茶中':'茶歇'),7,52,37,13,'pandaClick()'))+hotspot('伙伴手册',1,30,23,9,"openFriendView('book')");$('hint').textContent=state.mode==='travel'?'石板路上的脚印，藏着远方的消息':state.mode==='rest'?'它正在竹屋休息 · 院子里的春笋慢慢长大':'划动笋田收春笋 · 轻触熊猫陪它喝茶'}else{$('objects').innerHTML=prop('prop8',72,66,17,12)+reserveTableMarkup()+journalShelfMarkup();$('hotspots').innerHTML=restHotspots()+hotspot('桌面备用',64,62,29,17,"openPanel('reserve')")+hotspot('纪念品',70,27,28,30,"openPanel('souvenirs')")+(state.mode==='rest'?'':hotspot(state.mode==='travel'?'它出门啦':state.mode==='prepare'?'准备出发':roomPoseInfo[roomPose()][0],9,69,43,16,'pandaClick()'));$('hint').textContent=state.mode==='travel'?'替它留一盏暖灯，等下一封来信':state.mode==='rest'?'让它安心睡会儿 · 休息期间也能整理行囊':'带一份便当就能出发 · 护身符与道具可选'}
renderAwayYard();
let nav=scene==='yard'?[['icon6','行囊',"openPanel('bag')"],['icon2','商铺',"openPanel('shop')"],['icon5','摇签',"openPanel('lottery')"],['icon3','手账',"openPanel('album')"]]:[['icon0','小院',"changeScene('yard')"],['icon6','整理行囊',"openPanel('bag')"],['icon2','杂货铺',"openPanel('shop')"],['icon3','手账',"openPanel('album')"]];$('navigation').innerHTML=nav.map(([img,text,fn])=>`<button onclick="${fn}">${image(img)}<span>${text}</span></button>`).join('');$('status').title=$('status').textContent;syncRestScene();}
function changeScene(next){warmSceneAssets(next);if(next==='yard'&&state.mode==='prepare'){toast('它正在确认路线，稍等片刻再去小院吧');return}globalThis.GameSfx?.stopProps();scene=next;closePanel();render();globalThis.GameSfx?.syncMusic()}
function harvest(){return collectShoots()}
function pandaClick(){if(state.mode==='travel'){openPanel('journey');return}if(state.mode==='rest'){sleepFeedback();return}if(state.mode==='prepare'){toast('它把路线看了又看，马上就要出发啦。');return}if(scene==='yard'){startTea();return}nextRoomPose(true)}
function rest(){beginRest()}
function statusClick(){if(state.mode==='travel')openPanel('journey');else if(state.mode==='prepare')openPanel('departure');else if(state.mode==='rest'){if(scene!=='room')changeScene('room');openPanel('sleep')}else pandaClick()}

function closePanel(force=false){cancelEnvelope();if(panel==='album'||panel==='souvenirs'){if(!force&&journalView!=='list'){journalGoBack();return}releaseJournalExport();}if(!force&&panel==='lottery'&&lotteryView&&lotteryView!=='drawing'){closeLotteryLayer();return}if(!force&&panel==='shop'&&(shopProduct||shopReceipt)){closeShopDetail();return} globalThis.GameSfx?.panelSound(panel);globalThis.GameSfx?.stopProps();$('modal').hidden=true;panel='';globalThis.GameSfx?.syncMusic();if(previousFocus)previousFocus.focus()}
function openPanel(type){globalThis.GameSfx?.stopProps();if(panel!==type)globalThis.GameSfx?.panelSound(type);previousFocus=document.activeElement;panel=type;if(type==='letter')prepareEnvelope('incoming');else cancelEnvelope();if(type==='album'||type==='souvenirs')prepareJournal(type);warmPanelAssets(type);if(type==='lottery')prepareLotteryPanel();$('modal').hidden=false;if(type==='friend')ensureFriends();const titles={bag:'行囊整备',shop:'膳食杂货铺',shopinventory:'物品库存',mail:'院外来信',letter:'远方寄来的问候',album:'滚滚手账',souvenirs:'滚滚手账',reserve:'行囊整备',lottery:'竹签摇奖',settings:'小院设置',weather:'竹林里的天气',journey:'本次旅程',travelrewards:'旅途收获',iteminfo:'物品详情',friend:'伙伴来访',departure:'准备出发',return:'欢迎回家',sleep:'竹屋小憩'};$('modal-title').textContent=titles[type]||'小院生活';$('modal-kicker').textContent={bag:'装好小小的期待',mail:'见字如面',journey:'山川湖海 · 平安归来'}[type]||'一方竹院 · 一段慢时光';if(type==='shop'){shopProduct=null;shopReceipt=null;shopQty=1}if(type==='bag'){draft=[...state.bag];slot=0}if(type==='reserve'){reserveDraft=[...state.reserve];reserveSlot=0}renderPanel();$('modal').querySelector((type==='album'||type==='souvenirs')?'.journal-exit':type==='shop'?'.shop-exit':type==='lottery'?(lotteryView==='result'?'.lottery-overlay .lottery-green':'.lottery-exit'):'.sheet-head button').focus()}
function renderPanel(){let html='';$('modal').dataset.journal=panel==='album'||panel==='souvenirs';$('modal').dataset.lottery=panel==='lottery';$('modal').dataset.friend=panel==='friend';$('modal').dataset.shop=panel==='shop';$('modal').dataset.preparation=panel==='reserve'||panel==='bag';
if(panel==='bag')html=reservePanel();
if(panel==='shop')html=shopPanel();
if(panel==='shopinventory')html=shopInventoryPanel();if(panel==='iteminfo')html=itemInfoPanel();
if(panel==='mail'){html=state.mail?`<div class="card row">${image('icon11')}<div><h4>竹林深处的一封信</h4><p>小熊猫寄来了一张明信片</p><span class="badge">待拆封 · ${state.mail} 封</span></div></div>${button('拆开来信',"openPanel('letter')")}`:`<div class="empty">${image('prop0')}<p>暂时没有新来信</p><span class="muted">风会把远方的消息，慢慢送到这里。</span></div>${button('翻翻已收藏的明信片',"openPanel('album')")}`}
if(panel==='letter'){html=`<div class="postcard"><span>山间来信</span></div><p class="letter">山里的风很凉，我替你听了竹海。<br>山路有些长，但这里的竹笋很好吃。<br><br>等我回家，再慢慢讲给你听。<br>—— 你的小熊猫</p>${button('收藏明信片 · 领取纪念品','claimLetter()',false,!state.mail)}`}
if(panel==='album'||panel==='souvenirs')html=journalPanel();
if(panel==='reserve')html=reservePanel();
if(panel==='departure')html=departurePanel();
if(panel==='journey')html=journeyPanel();
if(panel==='return')html=travelReturnPanel();
if(panel==='travelrewards')html=travelRewardsPanel();
if(panel==='friend'){$('modal-title').textContent=friendView==='book'?'伙伴手册':'伙伴来访';html=friendPanel();}
if(panel==='lottery')html=lotteryPanel();
if(panel==='weather')html=weatherDetail();
if(panel==='settings'){html=`${GameSfx.settings()}<label class="toggle">环境与角色动画<input type="checkbox" ${state.motion?'checked':''} onchange="state.motion=this.checked;save();render()"></label><p>这是一份可交互的 H5 游戏原型。采笋、购买、装包、备用物品、旅行与收藏均可实际操作。</p><p class="muted">四叶金竹笋：每块笋田10%概率，连续9次未收获，第10次保底；仅成功收获计数。护身符可选，不影响普通旅行出发。</p><p class="muted">进度只保存在当前浏览器；旅行时长由便当和随行物品决定。切到后台后动画暂停，旅程继续计时。</p>${button('清除本机体验进度','confirmReset()',true)}`}
if(panel==='letter')html=envelopePanel();if(panel==='sleep')html=restPanel();$('panel-body').innerHTML=html;if(panel==='journey')updateJourneyMap();mountEnvelope();globalThis.GameSfx?.syncMusic();}
function available(id){return inventoryAllocation(state,id).free}
function availableForDraft(id){return (state.inventory[id]||0)-draft.filter(v=>v===id).length-state.reserve.filter(v=>v===id).length+(draft[slot]===id?1:0)}
function equip(id){if(availableForDraft(id)<1)return;draft[slot]=id;renderPanel()}
function saveBag(){
 if(['travel','prepare'].includes(state.mode))return;
 const counts={};for(const id of draft.filter(Boolean)){counts[id]=(counts[id]||0)+1;if(counts[id]>(state.inventory[id]||0)-state.reserve.filter(v=>v===id).length){toast('库存有变化，请重新选择行囊物品');return}}
 state.bag=[...draft];save();globalThis.GameSfx?.play('ui05');
 toast(state.mode==='rest'?'行囊已保存，让它继续安心休息':'行囊保存成功');if(state.mode==='rest'){closePanel();return}if(state.bag[0]){state.mode='prepare';state.preparedAt=Date.now();state.autoDepartAt=state.preparedAt+GameTravel.reserveDelay(state);save();render();openPanel('departure')}else closePanel();
}
function buy(id){if(!items[id]?.purchasable){toast('这件物品不能在杂货铺购买');return}showShopProduct(id)}
function claimLetter(){if(state.mail<1||!authorizeEnvelopeClaim())return;globalThis.GameSfx?.play(state.pendingLetters?.[0]?.rarity==='SSR'?'ui04':'ui06');if(state.pendingLetters?.length){const trip=state.pendingLetters.shift();state.mail--;state.album++;state.tripPostcards.push(trip);if(trip.souvenir)state.souvenirs++;save();render();openPanel('album');journalOpen(state.tripPostcards.length-1);toast('旅行明信片已收藏');return}state.mail--;state.album++;state.souvenirs++;const welcome=LetterEnvelope.welcome(state.album);welcome.postcard=envelopeSession.card.postcard||welcome.postcard;state.tripPostcards.push(welcome);state.travelSouvenirs.push({name:'川剧变脸小木偶',id:5001,catalogKey:'opera',origin:'四川 · 青城山',grade:'R'});save();render();openPanel('album');journalOpen(state.tripPostcards.length-1);toast('明信片与纪念品已收入手账')}
function collectionDetail(souvenir){$('panel-body').innerHTML=souvenir?`${image('souvenir9','journey-icon')}<p class="letter" style="text-align:center">竹林小花瓶</p><p>熊猫在山间小铺挑选的花瓶，带回了几朵路边的小花。</p>${button('返回收藏',"openPanel('souvenirs')",true)}`:`<div class="postcard"><span>山间来信</span></div><p class="letter">风吹过的时候，想起家里的茶香。<br>别担心，我有好好吃饭。</p>${button('返回相册',"openPanel('album')",true)}`}
function preparationTabs(){return `<div class="preparation-tabs" role="tablist" aria-label="行囊整备"><button role="tab" aria-selected="${panel==='bag'}" onclick="openPanel('bag')">随身小竹篓</button><button role="tab" aria-selected="${panel==='reserve'}" onclick="openPanel('reserve')">桌面备用栏</button></div>`}
function reserveAvailable(id,index=reserveSlot){return Math.max(0,(state.inventory[id]||0)-state.bag.filter(v=>v===id).length-reserveDraft.filter((v,i)=>i!==index&&v===id).length)}
function reservePanel(){
 const bag=panel==='bag',list=bag?draft:reserveDraft,selected=bag?slot:reserveSlot,labels=['便当','护身符 / 驼铃','道具','道具'],filled=list.filter(Boolean).length,locked=bag&&['travel','prepare'].includes(state.mode);
 return `${preparationTabs()}${bag&&!locked?'<p class="muted">出行只需一份便当，护身符与道具可留空。</p>':''}${bag&&state.mode==='travel'?'<div class="preparation-lock-notice" role="status"><b>旅行中 · 随身小竹篓暂不可修改</b><span>归家后即可选择便当、整理行囊。库存物品仍保留，现在可切换到桌面备用栏整理。</span></div>':''}<div class="reserve-caption"><b>${bag?'随身小竹篓':'桌面备用'} <span>（${filled}/4）</span></b><small>${bag?(state.mode==='travel'?'归家后再整理行囊':'带着心意去远方'):'留在家里的小心意'}</small></div><div class="reserve-slots">${list.map((id,i)=>`<button class="reserve-slot ${selected===i?'selected':''}" aria-label="${bag?'随身':'备用'}${labels[i]}槽${i+1}${id?'：'+items[id].name:'，空位'}" aria-pressed="${selected===i}" onclick="selectPreparationSlot(${i})"><div class="reserve-slot-art">${id?image(items[id].img):'<strong>＋</strong>'}</div><b>${id?items[id].name:(bag&&i>0?'可留空':'待放入')}</b><span>${labels[i]}${bag?(i===0?' · 必带':' · 可选'):''}</span></button>`).join('')}</div><div class="reserve-selection"><span>正在整理：${labels[selected]}${selected>1?selected-1:''}</span><button onclick="clearPreparationSlot()" ${list[selected]&&!locked?'':'disabled'}>移回库存</button></div><div class="reserve-divider"><b>物品库存</b><span>角标为总数 · 下方显示可用与占用</span></div><div class="reserve-inventory">${Object.entries(items).filter(([id,it])=>it.type<3&&inventoryAllocation(state,id).total>0).map(([id,it])=>{const stock=inventoryAllocation(state,id,bag?list:state.bag,bag?state.reserve:list),count=stock.free,matches=it.type===(selected<2?selected:2)||(id==='camelBells'&&selected===1);return `<button class="reserve-item ${matches?'compatible':''} ${stock.total>0&&count<1?'stock-assigned':''}" onclick="preparationItemClick('${id}')" aria-label="${it.name}，总数${stock.total}件，可用${count}件，随身${stock.carried}件，备用${stock.stored}件${matches?'':'，点选切换对应槽位'}" ${stock.total<1||locked?'disabled':''}>${image(it.img)}<b>${it.name}</b><span class="reserve-count" title="拥有总数（含已装入物品）">${stock.total}</span><small>${['便当','护身符','道具'][it.type]}${it.durability>1&&Number.isFinite(it.durability)?' · '+itemDurability(id)+'次':it.consumable?' · 一次性':''}</small><small class="stock-availability">可用 ${count}${stock.carried?' · 随身 '+stock.carried:''}${stock.stored?' · 备用 '+stock.stored:''}</small></button>`}).join('')}</div><div class="reserve-save">${button(bag?(state.mode==='travel'?'旅行中 · 归家后可整理':'保存行囊'):'保存备用',bag?'saveBag()':'saveReserve()',false,locked)}<p>${bag?(locked?(state.mode==='travel'?'旅行期间随身行囊不可修改，归家后恢复整理':'出发准备中，请先取消出发再调整行囊'):'带一份便当就能出发，护身符与道具均可留空'):'随身没有便当时，会自动带上这份备用出游'}</p><small>${bag?'随身物品带去旅行，桌面备用留在家中。':(state.reserveAt?'预计 '+new Date(state.reserveAt).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit'})+' 后可出发（北京时间），移走备用便当即可取消。':'休息时会等它醒来。')}</small></div>`;
}
function preparationItemClick(id){
 if(!items[id]||!['bag','reserve'].includes(panel))return;
 if(panel==='bag'&&['travel','prepare'].includes(state.mode))return;
 const bag=panel==='bag',list=bag?draft:reserveDraft,stock=inventoryAllocation(state,id,bag?list:state.bag,bag?state.reserve:list);
 if(stock.total<1){toast('暂未拥有这件物品');return}
 if(stock.free>0){equipPreparation(id);return}
 const index=list.indexOf(id);
 if(index>=0){if(bag)slot=index;else reserveSlot=index;renderPanel();toast('已装入'+(bag?'随身小竹篓':'桌面备用栏')+'，可在上方选中槽位移回库存');return}
 toast(items[id].name+'已放在'+(bag?'桌面备用栏':'随身小竹篓')+'，请先在对应栏移回库存并保存，再装入这里');
}
function selectPreparationSlot(i){if(panel==='bag')slot=i;else reserveSlot=i;renderPanel()}
function clearPreparationSlot(){if(panel==='bag'){if(['travel','prepare'].includes(state.mode))return;draft[slot]=null;renderPanel()}else clearReserveSlot()}
function equipPreparation(id){
 if(panel!=='bag'){equipReserve(id);return}
 if(['travel','prepare'].includes(state.mode))return;
 const type=items[id].type;if(!(id==='camelBells'&&slot===1)&&type!==(slot<2?slot:2))slot=type<2?type:([2,3].find(i=>!draft[i])??2);
 equip(id);
}
function equipReserve(id){
 const type=items[id].type,currentType=reserveSlot<2?reserveSlot:2;
 if(!(id==='camelBells'&&reserveSlot===1)&&type!==currentType){reserveSlot=type<2?type:([2,3].find(i=>!reserveDraft[i])??2)}
 if(reserveAvailable(id)<1){toast('这件物品已放在行囊或备用栏里');renderPanel();return}
 reserveDraft[reserveSlot]=id;renderPanel();
}
function clearReserveSlot(){reserveDraft[reserveSlot]=null;renderPanel()}
function saveReserve(){
 const counts={};for(const id of reserveDraft){if(!id)continue;counts[id]=(counts[id]||0)+1;if(counts[id]>(state.inventory[id]||0)-state.bag.filter(v=>v===id).length){toast('库存有变化，请重新选择备用物品');return}}
 state.reserve=[...reserveDraft];state.reserveAt=state.reserve[0]?Math.max(Date.now(),state.mode==='travel'?state.end:0)+GameTravel.reserveDelay(state):0;save();render();closePanel();toast('✓ 备用物品已保存！');
}
function reserveTableMarkup(){return `<div class="table-reserve-items" aria-hidden="true">${state.reserve.filter(Boolean).map(id=>image(items[id].img)).join('')}</div>`}
function cancelPrepare(){state.autoDepartAt=0;state.mode='home';save();closePanel();render()}
function depart(){
 if(!['home','prepare'].includes(state.mode))return;
 let trip;try{trip=GameTravel.begin(state)}catch(e){toast(e.message);return}
 GameFriends.tick(state);save();closePanel(true);scene='yard';render();
 globalThis.playPandaDeparture?.();toast('出发啦！预计 '+(trip.totalMs<3600000?Math.ceil(trip.totalMs/60000)+' 分钟':(trip.totalMs/3600000).toFixed(1)+' 小时')+'后归来');

}
function timeText(ms){const sec=Math.max(0,Math.ceil(ms/1000)),days=Math.floor(sec/86400),hours=Math.floor(sec%86400/3600),minutes=Math.floor(sec%3600/60);return (days?days+'天':'')+(hours?hours+'小时':'')+minutes+'分'+(!days&&!hours?String(sec%60).padStart(2,'0')+'秒':'')}
function updateTime(){
 const now=Date.now();
 let returned=GameTravel.settle(state,now),started=false;
 if(state.mode==='prepare'&&state.autoDepartAt&&state.autoDepartAt<=now){
  try{
   GameTravel.begin(state,'bag',state.autoDepartAt);GameFriends.tick(state);started=true;
   returned=GameTravel.settle(state,now)||returned;
  }catch(e){state.autoDepartAt=0;state.mode='home';save();toast(e.message)}
 }
 if(state.mode==='home'&&state.reserveAt&&state.reserveAt<=now&&!state.bag[0]&&state.reserve[0]){
  try{
   GameTravel.begin(state,'reserve',state.reserveAt);
   GameFriends.tick(state);started=true;
   returned=GameTravel.settle(state,now)||returned;
  }catch(e){state.reserveAt=0;save();toast(e.message)}
 }
 if(!returned&&!started)return;
 save();
 setTimeout(()=>{
  if(started&&state.mode==='travel'){closePanel(true);scene='yard';render();globalThis.playPandaDeparture?.();toast(state.trip.loadoutSource==='reserve'?'它带着桌面备用便当出门啦':'它收好行囊出门啦')}
  else if(state.mode==='home'){render();openPanel('return')}
 },0);
}



function confirmReset(){$('panel-body').innerHTML='<p>将清除当前浏览器的竹笋、旅行和收藏进度，重新开始体验。</p>'+button('确认重新开始','resetGame()')+button('保留进度',"openPanel('settings')",true)}
function resetGame(){cancelRestTransition();state=newGameState();GameTravel.initialize(state);save();closePanel(true);scene='yard';render();toast('新的小院生活开始啦')}
$('modal').addEventListener('click',e=>{if(e.target===$('modal'))closePanel()});document.addEventListener('keydown',e=>{if(e.key==='Escape')closePanel();if(e.key==='Tab'&&!$('modal').hidden){const focusRoot=panel==='lottery'?$('modal').querySelector('.lottery-sheet')||$('modal'):$('modal'),all=focusRoot.querySelectorAll('button:not(:disabled),input');if(e.shiftKey&&document.activeElement===all[0]){e.preventDefault();all[all.length-1].focus()}else if(!e.shiftKey&&document.activeElement===all[all.length-1]){e.preventDefault();all[0].focus()}}});document.addEventListener('visibilitychange',handleVisibilityChange);setInterval(()=>{updateTime();if(panel==='journey'){updateJourneyMap();$('journey-elapsed').textContent=timeText(Date.now()-state.start);$('journey-left').textContent=timeText(state.end-Date.now())}},1000);setInterval(()=>{if(!document.hidden&&state.motion&&state.mode==='home'){if(isDrinking())return;if(scene==='room'){if(!roomPoseSince)roomPoseSince=Date.now();if(!panel&&motionAllowed()&&Date.now()-roomPoseSince>20000)nextRoomPose(false);return}pandaFrame=pandaFrame===0?1:0;$('panda').src=assetUrl((scene==='yard'?'tea':'read')+pandaFrame)}},4500);

let lastWeatherKey='';
setInterval(()=>{if(document.hidden)return;const w=weatherInfo(),key=w.period+':'+w.night+':'+w.clock+':'+term();if(key!==lastWeatherKey){lastWeatherKey=key;syncWeatherUI()}},1000);

// Focus/visibility may change repeatedly inside embedded browsers. Keep scene nodes intact.
function handleVisibilityChange(){document.body.classList.toggle('paused',document.hidden);if(document.hidden)return;updateTime();syncWeatherUI();syncRestScene()}
;
// Item_Config from the user's current list. Stable keys preserve existing inventory saves.
const ITEM_CONFIG_VERSION=2;
const FoodConfig=[
 ['honey',1001,'蜂蜜窝窝头',10,[.5,2],{'周边':.5},0,'仅触发短途周边游','shop-honey'],
 ['bambooRoll',1002,'鲜嫩竹笋卷',20,[1.5,4],{'西南':.2},.02,'回家后心情值 +5','shop-bamboo-roll'],
 ['lotus',1003,'桂花糖藕片',40,[3,6],{'华东':.35},.04,'水乡景点权重提升，回家耗时缩短10%','shop-lotus'],
 ['wrap',1004,'荷叶糯米鸡',50,[4,8],{'华南':.35},.05,'必定带回至少2份地方特产','shop-wrap'],
 ['bun',1005,'秘制辣味笋包',80,[6,12],{'西北':.4,'华北':.4},.08,'避开寒凉高海拔，提升雪景明信片概率','shop-bun'],
 ['mung',1006,'冰镇绿豆糕',100,[3,6],{},.10,'旅行总耗时缩短20%，动物旅伴同框率+15%','shop-mung'],
 ['rice',1007,'泉水竹筒饭',120,[8,16],{'西南':.45},.12,'山岳、森林景点权重翻倍','shop-rice'],
 ['butter',1008,'酥油青稞饼',160,[12,24],{'西北':.5,'西南':.5},.15,'极高概率前往高海拔远途景点','shop-butter'],
 ['feast',1009,'八宝迎春攒盒',220,[18,36],{'华北':.45,'中原':.45},.20,'名胜古迹权重提升，提高稀有明信片机会','shop-feast'],
 ['imperial',1010,'御膳九格便当',300,[24,48],{},.30,'必定触发远途旅行，非遗纪念品掉率翻倍','shop-imperial']
];
const GearConfig=[
 ['charm',2001,'四叶金竹笋',null,1,[],.25,'可选的一次性护身符，特产掉落数量上限+1；笋田每块10%概率，连续9次未收获后第10次保底','golden-shoot-v2','庭院采摘 / 抽奖',1],
 ['redknot',2002,'平安中国结',3000,Infinity,[],.10,'永久幸运加成，降低空手而归概率至0%','shop-redknot','杂货铺',1],
 ['umbrella',2003,'手绘油纸伞',450,10,['水乡','雨景'],.12,'解锁江南烟雨及湖泊类特殊明信片','shop-umbrella','杂货铺',2],
 ['tent',2004,'竹编小帐篷',500,10,['草原','荒漠'],.12,'解锁野外露营、篝火与星空类明信片','shop-tent','杂货铺',2],
 ['kettle',2005,'青花瓷水壶',600,10,['荒漠','古迹'],.15,'荒漠戈壁必备；未携带时荒漠权重降低80%','shop-kettle','杂货铺',2],
 ['lantern',2006,'防风小马灯',800,15,['奇观','夜景'],.18,'解锁溶洞、夜游古城及极光星空类明信片','shop-lantern','杂货铺',2],
 ['sleepingBag',2007,'锦缎睡袋',1200,15,['雪山','高原'],.20,'极寒雪山景点必备，提升旅途舒适度','shop-sleeping-bag','杂货铺',2],
 ['walkingStick',2008,'紫竹登山杖',1500,20,['山岳','险峰'],.22,'五岳与险峰景点权重+50%，减少体力消耗','shop-walking-stick','杂货铺',2],
 ['boatTicket',2009,'江南乌篷船票',null,1,['华东','水乡'],.35,'90%概率锁定华东 / 华南大区','shop-boat-ticket','摇奖机',2],
 ['camelBells',2010,'西域丝路驼铃',null,1,['西北','荒漠'],.35,'90%概率锁定西北 / 西南大区','shop-camel-bells','摇奖机',2]
];
items.opera={name:'川剧小摆件',img:'shop-opera',type:3,purchasable:false};items.vase={name:'青花花瓶',img:'shop-vase',type:3,purchasable:false};
// Remove unlisted shop entries; keep already-owned decorations visible in inventory only.
for(const key of Object.keys(items))if(!['opera','vase'].includes(key))delete items[key];
for(const [key,id,name,price,hours,directions,rarity,desc,img] of FoodConfig)items[key]={id,name,price,hours,directions,rarity,desc,img,type:0,purchasable:true,tag:`${hours[0]}–${hours[1]}小时`,consumable:true};
for(const [key,id,name,price,durability,tags,rarity,desc,img,source,type] of GearConfig)items[key]={id,name,price,durability,tags,rarity,desc,img,source,type,purchasable:price!==null,consumable:durability===1,unique:durability>1,tag:durability===Infinity?'永久护身符':durability===1?'一次性物品':`耐久 ${durability} 次`};
function itemDurability(key){const it=items[key];return !it||it.durability===Infinity?Infinity:state.durability?.[key]??it.durability}
function itemRulesMarkup(key){const it=items[key];return `<div class="item-rule-facts"><span>物品 ${it.id}</span><span>稀有度 +${Math.round(it.rarity*100)}%</span>${it.hours?`<span>饱腹 ${it.hours[0]}–${it.hours[1]} 小时</span><span>${Object.entries(it.directions).map(([k,v])=>k+' +'+Math.round(v*100)+'%').join(' / ')||'全方向均等'}</span>`:`<span>耐久：${it.durability===Infinity?'永久':(state.inventory[key]||0)>0?itemDurability(key)+' / '+it.durability:it.durability+' 次'}</span><span>${it.tags.join(' / ')||'地形无限制'}</span>`}</div>`}
// Durable copies keep their own wear. The first copy is the next one carried.
function syncGearCopies(s,key){
 const it=items[key];if(!it||!Number.isFinite(it.durability)||it.durability<=1)return [];
 s.gearCopies??={};s.durability??={};const count=Math.max(0,s.inventory[key]||0);
 let list=s.gearCopies[key];if(!Array.isArray(list))list=[];
 list=list.slice(0,count);
 while(list.length<count){const i=list.length;list.push({id:`legacy-${key}-${i}`,durability:i===0?Math.max(1,Math.min(it.durability,s.durability[key]??it.durability)):it.durability})}
 s.gearCopies[key]=list;if(list.length)s.durability[key]=list[0].durability;return list;
}
function addInventoryReward(s,key,source){
 const it=items[key],copies=syncGearCopies(s,key);s.inventory[key]=(s.inventory[key]||0)+1;
 if(Number.isFinite(it?.durability)&&it.durability>1){copies.push({id:source,durability:it.durability});s.gearCopies[key]=copies;s.durability[key]=copies[0].durability}
}
function consumeGearCopy(s,key,source='bag'){
 const copies=syncGearCopies(s,key);if(!copies.length)return;
 copies[0].durability--;
 if(copies[0].durability<=0){copies.shift();s.inventory[key]=Math.max(0,(s.inventory[key]||0)-1);s[source]=s[source].map(k=>k===key?null:k)}
 s.durability[key]=copies[0]?.durability??0;
}
function gearCopiesMarkup(key){const it=items[key];if(!Number.isFinite(it?.durability)||it.durability<=1||(state.inventory[key]||0)<1)return '';const copies=syncGearCopies(state,key);return `<div class="gear-copy-list"><h4>每件物品的耐久</h4>${copies.map((v,i)=>`<p><span>第${i+1}件${i===0?' · 下次优先携带':''}</span><b>${v.durability} / ${it.durability}</b></p>`).join('')}<small>重复获得的装备各自保存耐久，原有装备不会被覆盖。</small></div>`}
// Ownership includes items assigned to either preparation area; assignment is not consumption.
function inventoryAllocation(s,key,bag=s.bag||[],reserve=s.reserve||[]){
 const total=Math.max(0,Number(s.inventory?.[key])||0),carried=bag.filter(v=>v===key).length,stored=reserve.filter(v=>v===key).length;
 return {total,carried,stored,free:Math.max(0,total-carried-stored)};
}
function inventoryAllocationMarkup(key){const stock=inventoryAllocation(state,key);return `<p class="inventory-allocation">拥有总数 <b>${stock.total}</b> · 可用 ${stock.free}<br>随身小竹篓 ${stock.carried} · 桌面备用栏 ${stock.stored}<small>装入行囊或备用栏仅占用物品；出发时才消耗一次性物品。</small></p>`}
;
const TravelCollectionCatalog={"destinations":[{"id":3001,"name":"成都青城山","region":"西南","distance_tier":1,"terrain_tag":"山岳","recommended_gear_ids":[],"specialty_id":4001,"souvenir_id":5001,"asset":"travel-card-3001","tags":["山岳","森林"],"near":true,"remote":false,"heritage":false},{"id":3002,"name":"乐山大佛","region":"西南","distance_tier":1,"terrain_tag":"古迹","recommended_gear_ids":[],"specialty_id":4001,"souvenir_id":5001,"asset":"travel-card-3002","tags":["古迹"],"near":true,"remote":false,"heritage":true},{"id":3003,"name":"九寨沟五花海","region":"西南","distance_tier":2,"terrain_tag":"奇观","recommended_gear_ids":[2008],"specialty_id":4002,"souvenir_id":5002,"asset":"travel-card-3003","tags":["奇观"],"near":false,"remote":false,"heritage":false},{"id":3004,"name":"云南大理洱海","region":"西南","distance_tier":2,"terrain_tag":"水乡","recommended_gear_ids":[2003],"specialty_id":4003,"souvenir_id":5003,"asset":"travel-card-3004","tags":["水乡"],"near":false,"remote":false,"heritage":false},{"id":3005,"name":"丽江玉龙雪山","region":"西南","distance_tier":3,"terrain_tag":"雪山","recommended_gear_ids":[2007,2008],"specialty_id":4003,"souvenir_id":5003,"asset":"travel-card-3005","tags":["雪山"],"near":false,"remote":true,"heritage":false,"require":"sleepingBag"},{"id":3006,"name":"拉萨布达拉宫","region":"西南","distance_tier":3,"terrain_tag":"高原","recommended_gear_ids":[2007],"specialty_id":4004,"souvenir_id":5004,"asset":"travel-card-3006","tags":["高原"],"near":false,"remote":true,"heritage":false},{"id":3007,"name":"杭州西湖断桥","region":"华东","distance_tier":1,"terrain_tag":"水乡","recommended_gear_ids":[2003],"specialty_id":4005,"souvenir_id":5005,"asset":"travel-card-3007","tags":["水乡"],"near":true,"remote":false,"heritage":false},{"id":3008,"name":"苏州拙政园","region":"华东","distance_tier":1,"terrain_tag":"古迹","recommended_gear_ids":[2003],"specialty_id":4006,"souvenir_id":5006,"asset":"travel-card-3008","tags":["古迹"],"near":true,"remote":false,"heritage":true},{"id":3009,"name":"嘉兴乌镇水乡","region":"华东","distance_tier":2,"terrain_tag":"水乡","recommended_gear_ids":[2003,2006],"specialty_id":4006,"souvenir_id":5006,"asset":"travel-card-3009","tags":["水乡"],"near":false,"remote":false,"heritage":false},{"id":3010,"name":"安徽黄山迎客松","region":"华东","distance_tier":2,"terrain_tag":"山岳","recommended_gear_ids":[2008],"specialty_id":4007,"souvenir_id":5007,"asset":"travel-card-3010","tags":["山岳"],"near":false,"remote":false,"heritage":false},{"id":3011,"name":"江西景德镇古窑","region":"华东","distance_tier":2,"terrain_tag":"古迹","recommended_gear_ids":[2005],"specialty_id":4007,"souvenir_id":5008,"asset":"travel-card-3011","tags":["古迹"],"near":false,"remote":false,"heritage":true},{"id":3012,"name":"福建武夷山九曲溪","region":"华东","distance_tier":2,"terrain_tag":"山岳","recommended_gear_ids":[2003],"specialty_id":4008,"souvenir_id":5008,"asset":"travel-card-3012","tags":["山岳"],"near":false,"remote":false,"heritage":false},{"id":3013,"name":"山东泰山玉皇顶","region":"华东","distance_tier":3,"terrain_tag":"山岳","recommended_gear_ids":[2008,2006],"specialty_id":4009,"souvenir_id":5007,"asset":"travel-card-3013","tags":["山岳"],"near":false,"remote":true,"heritage":false},{"id":3014,"name":"桂林漓江山水","region":"华南","distance_tier":2,"terrain_tag":"水乡","recommended_gear_ids":[2003],"specialty_id":4010,"souvenir_id":5009,"asset":"travel-card-3014","tags":["水乡"],"near":false,"remote":false,"heritage":false},{"id":3015,"name":"福建永定土楼","region":"华南","distance_tier":2,"terrain_tag":"古迹","recommended_gear_ids":[2006],"specialty_id":4008,"souvenir_id":5009,"asset":"travel-card-3015","tags":["古迹"],"near":false,"remote":false,"heritage":true},{"id":3016,"name":"广州陈家祠","region":"华南","distance_tier":2,"terrain_tag":"古迹","recommended_gear_ids":[],"specialty_id":4011,"souvenir_id":5010,"asset":"travel-card-3016","tags":["古迹"],"near":false,"remote":false,"heritage":true},{"id":3017,"name":"海南三亚天涯海角","region":"华南","distance_tier":3,"terrain_tag":"奇观","recommended_gear_ids":[2004],"specialty_id":4012,"souvenir_id":5010,"asset":"travel-card-3017","tags":["奇观"],"near":false,"remote":true,"heritage":false},{"id":3018,"name":"北京故宫角楼","region":"华北","distance_tier":2,"terrain_tag":"古迹","recommended_gear_ids":[2006],"specialty_id":4013,"souvenir_id":5011,"asset":"travel-card-3018","tags":["古迹"],"near":false,"remote":false,"heritage":true},{"id":3019,"name":"八达岭长城","region":"华北","distance_tier":2,"terrain_tag":"山岳","recommended_gear_ids":[2008],"specialty_id":4013,"souvenir_id":5011,"asset":"travel-card-3019","tags":["山岳"],"near":false,"remote":false,"heritage":false},{"id":3020,"name":"山西平遥古城","region":"华北","distance_tier":2,"terrain_tag":"古迹","recommended_gear_ids":[2006],"specialty_id":4014,"souvenir_id":5012,"asset":"travel-card-3020","tags":["古迹"],"near":false,"remote":false,"heritage":true},{"id":3021,"name":"呼伦贝尔大草原","region":"华北","distance_tier":3,"terrain_tag":"草原","recommended_gear_ids":[2004],"specialty_id":4015,"souvenir_id":5012,"asset":"travel-card-3021","tags":["草原"],"near":false,"remote":true,"heritage":false},{"id":3022,"name":"长白山天池","region":"华北","distance_tier":3,"terrain_tag":"雪山","recommended_gear_ids":[2007,2008],"specialty_id":4016,"souvenir_id":5011,"asset":"travel-card-3022","tags":["雪山"],"near":false,"remote":true,"heritage":false,"require":"sleepingBag"},{"id":3023,"name":"河南洛阳龙门石窟","region":"中原","distance_tier":2,"terrain_tag":"古迹","recommended_gear_ids":[2005],"specialty_id":4017,"souvenir_id":5013,"asset":"travel-card-3023","tags":["古迹"],"near":false,"remote":false,"heritage":true},{"id":3024,"name":"湖北武汉黄鹤楼","region":"中原","distance_tier":1,"terrain_tag":"古迹","recommended_gear_ids":[2003],"specialty_id":4018,"souvenir_id":5013,"asset":"travel-card-3024","tags":["古迹"],"near":true,"remote":false,"heritage":true},{"id":3025,"name":"湖南张家界武陵源","region":"中原","distance_tier":2,"terrain_tag":"奇观","recommended_gear_ids":[2008],"specialty_id":4018,"souvenir_id":5013,"asset":"travel-card-3025","tags":["奇观"],"near":false,"remote":false,"heritage":false},{"id":3026,"name":"西安秦始皇兵马俑","region":"西北","distance_tier":2,"terrain_tag":"古迹","recommended_gear_ids":[2005],"specialty_id":4019,"souvenir_id":5014,"asset":"travel-card-3026","tags":["古迹"],"near":false,"remote":false,"heritage":true},{"id":3027,"name":"甘肃敦煌月牙泉","region":"西北","distance_tier":3,"terrain_tag":"荒漠","recommended_gear_ids":[2004,2005],"specialty_id":4020,"souvenir_id":5015,"asset":"travel-card-3027","tags":["荒漠"],"near":false,"remote":true,"heritage":false},{"id":3028,"name":"青海茶卡盐湖","region":"西北","distance_tier":3,"terrain_tag":"奇观","recommended_gear_ids":[2004,2006],"specialty_id":4020,"souvenir_id":5014,"asset":"travel-card-3028","tags":["奇观"],"near":false,"remote":true,"heritage":false},{"id":3029,"name":"新疆喀纳斯湖","region":"西北","distance_tier":3,"terrain_tag":"草原","recommended_gear_ids":[2004,2007],"specialty_id":4021,"souvenir_id":5015,"asset":"travel-card-3029","tags":["草原"],"near":false,"remote":true,"heritage":false},{"id":3030,"name":"宁夏沙坡头","region":"西北","distance_tier":3,"terrain_tag":"荒漠","recommended_gear_ids":[2004,2005],"specialty_id":4021,"souvenir_id":5014,"asset":"travel-card-3030","tags":["荒漠"],"near":false,"remote":true,"heritage":false}],"souvenirs":[{"id":5001,"name":"川剧变脸小木偶","cultural_region":"四川","base_drop_probability":0.05,"category":"souvenir","unique":true,"permanent":true,"consumable":false,"display_location":"书桌右上角","interaction_description":"点击会切换红/黑/白三色脸谱","interaction_trigger":"tap_cycle_face","source_destination_ids":[3001,3002],"face_cycle":["红","黑","白"],"rarity":"R","asset":"travel-gift-5001","grade":"R","description":"点击会切换红/黑/白三色脸谱","key":"5001"},{"id":5002,"name":"藏族手工转经筒","cultural_region":"川西","base_drop_probability":0.04,"category":"souvenir","unique":true,"permanent":true,"consumable":false,"display_location":"竹窗边","interaction_description":"微风吹过时会缓慢旋转并响起清脆铃声","interaction_trigger":"wind_rotate_chime","source_destination_ids":[3003],"rarity":"R","asset":"travel-gift-5002","grade":"R","description":"微风吹过时会缓慢旋转并响起清脆铃声","key":"5002"},{"id":5003,"name":"白族扎染方巾","cultural_region":"云南","base_drop_probability":0.04,"category":"souvenir","unique":true,"permanent":true,"consumable":false,"display_location":"小茶几上","interaction_description":"提升竹屋整体温馨度","interaction_trigger":"cozy_decoration","source_destination_ids":[3004,3005],"rarity":"R","asset":"travel-gift-5003","grade":"R","description":"提升竹屋整体温馨度","key":"5003"},{"id":5005,"name":"西湖绸伞微缩摆件","cultural_region":"浙江","base_drop_probability":0.05,"category":"souvenir","unique":true,"permanent":true,"consumable":false,"display_location":"玄关伞架旁","interaction_description":"撑开状态带有淡雅水墨荷花纹","interaction_trigger":"open_umbrella_display","source_destination_ids":[3007],"rarity":"R","asset":"travel-gift-5005","grade":"R","description":"撑开状态带有淡雅水墨荷花纹","key":"5005"},{"id":5006,"name":"苏绣双面猫戏蝶团扇","cultural_region":"江苏","base_drop_probability":0.04,"category":"souvenir","unique":true,"permanent":true,"consumable":false,"display_location":"竹椅旁","interaction_description":"夏天熊猫在家打盹时会拿起来扇风","interaction_trigger":"summer_home_nap_fan","source_destination_ids":[3008,3009],"rarity":"SR","asset":"travel-gift-5006","grade":"SR","description":"夏天熊猫在家打盹时会拿起来扇风","key":"5006"},{"id":5007,"name":"徽墨歙砚文房小套装","cultural_region":"安徽/山东","base_drop_probability":0.04,"category":"souvenir","unique":true,"permanent":true,"consumable":false,"display_location":"书桌上","interaction_description":"解锁熊猫在家“挥毫练字”的新待机动作","interaction_trigger":"unlock_calligraphy_idle","source_destination_ids":[3010,3013],"rarity":"SR","asset":"travel-gift-5007","grade":"SR","description":"解锁熊猫在家“挥毫练字”的新待机动作","key":"5007"},{"id":5008,"name":"景德镇青花玲珑茶盏","cultural_region":"江西/福建","base_drop_probability":0.03,"category":"souvenir","unique":true,"permanent":true,"consumable":false,"display_location":"茶盘上","interaction_description":"解锁熊猫在家“品茗看雨”的新待机动作","interaction_trigger":"unlock_rain_tea_idle","source_destination_ids":[3011,3012],"rarity":"SR","asset":"travel-gift-5008","grade":"SR","description":"解锁熊猫在家“品茗看雨”的新待机动作","key":"5008"},{"id":5009,"name":"壮锦绣球挂饰","cultural_region":"广西/福建","base_drop_probability":0.04,"category":"souvenir","unique":true,"permanent":true,"consumable":false,"display_location":"房梁下","interaction_description":"色彩绚丽，小熊猫来访时会跳起来拍打","interaction_trigger":"red_panda_visit_bat_ball","source_destination_ids":[3014,3015],"rarity":"R","asset":"travel-gift-5009","grade":"R","description":"色彩绚丽，小熊猫来访时会跳起来拍打","key":"5009"},{"id":5010,"name":"佛山醒狮绒球头套","cultural_region":"广东/海南","base_drop_probability":0.03,"category":"souvenir","unique":true,"permanent":true,"consumable":false,"display_location":"衣帽架上","interaction_description":"熊猫偶尔会戴在头上在屋里左摇右晃","interaction_trigger":"home_lion_head_idle","source_destination_ids":[3016,3017],"rarity":"SR","asset":"travel-gift-5010","grade":"SR","description":"熊猫偶尔会戴在头上在屋里左摇右晃","key":"5010"},{"id":5011,"name":"北京兔儿爷泥塑","cultural_region":"北京/东北","base_drop_probability":0.04,"category":"souvenir","unique":true,"permanent":true,"consumable":false,"display_location":"博古架顶层","interaction_description":"中秋节气期间会发出柔和的月光特效","interaction_trigger":"mid_autumn_moonlight","source_destination_ids":[3018,3019,3022],"calendar_trigger_note":"原文为中秋节气；中秋属于节日，具体活动起止需产品确认。","rarity":"R","asset":"travel-gift-5011","grade":"R","description":"中秋节气期间会发出柔和的月光特效","key":"5011"},{"id":5013,"name":"洛阳唐三彩小骆驼","cultural_region":"河南/两湖","base_drop_probability":0.04,"category":"souvenir","unique":true,"permanent":true,"consumable":false,"display_location":"博古架二层","interaction_description":"釉色光泽细腻","interaction_trigger":"glazed_display","source_destination_ids":[3023,3024,3025],"rarity":"R","asset":"travel-gift-5013","grade":"R","description":"釉色光泽细腻","key":"5013"},{"id":5014,"name":"华县皮影戏孙悟空","cultural_region":"陕西/宁夏","base_drop_probability":0.03,"category":"souvenir","unique":true,"permanent":true,"consumable":false,"display_location":"灯笼旁","interaction_description":"夜晚开灯时墙面会投射出皮影微缩动画","interaction_trigger":"night_lantern_shadow","source_destination_ids":[3026,3028,3030],"rarity":"SR","asset":"travel-gift-5014","grade":"SR","description":"夜晚开灯时墙面会投射出皮影微缩动画","key":"5014"},{"id":5012,"name":"马头琴木雕八音盒","cultural_region":"内蒙古 · 山西","base_drop_probability":0.03,"category":"souvenir","unique":true,"permanent":true,"consumable":false,"display_location":"竹屋收藏柜","interaction_description":"轻触八音盒，听一段十秒的草原小调。","interaction_trigger":"play_music_box","source_destination_ids":[3020,3021],"rarity":"SR","asset":"travel-gift-5012","grade":"SR","description":"轻触八音盒，听一段十秒的草原小调。","key":"5012"}]};

// Loot_Config 4001–4021. The four satisfaction values follow handbook order.
const localSpecialties = [
 ['红糖糍粑',60,'friend-food-cake',30,10,10,5], ['牦牛肉干',45,'friend-food-jerky',5,10,5,35],
 ['玫瑰鲜花饼',50,'friend-food-flower',30,20,20,10], ['甜茶酥油果',35,'shop-butter',15,25,15,40],
 ['西湖龙井茶酥',55,'friend-food-grain',20,30,30,10], ['桂花糖芋苗',55,'shop-lotus',30,20,30,5],
 ['徽州毛豆腐',45,'shop-feast',5,15,25,25], ['武夷大红袍茶冻',50,'prop6',20,35,35,10],
 ['泰山核桃酥',50,'friend-food-nuts',20,30,10,20], ['桂花漓江糕',50,'friend-food-grain',30,20,20,10],
 ['广式虾饺皇',45,'shop-feast',25,15,35,25], ['椰汁清补凉',40,'shop-feast',40,40,25,15],
 ['老北京冰糖葫芦',55,'friend-food-fruit',30,20,10,10], ['平遥冠云牛肉',45,'friend-food-jerky',5,10,5,35],
 ['草原奶皮子',35,'shop-butter',25,25,15,40], ['冻梨蜜饯',40,'friend-food-fruit',35,25,15,15],
 ['洛阳牡丹银丝酥',50,'friend-food-flower',20,30,20,10], ['洪湖莲子羹',55,'shop-lotus',20,10,30,5],
 ['临潼流心柿子饼',50,'friend-food-fruit',30,30,20,10], ['民勤蜜瓜干',40,'friend-food-fruit',35,25,15,25],
 ['吐鲁番无核白葡萄干',35,'friend-food-fruit',40,40,25,25]
].map(([name,chance,img,aguo,jinjin,baiyu,fangfang],i)=>({id:4001+i,name,chance,img,taste:{aguo,jinjin,baiyu,fangfang}}));
;
// Match arrival conditions against Action_Bind_Config before drawing an action.
const PostcardRules = (() => {
 const actions = [
  ['标准游客打卡照','N'], ['揣手手看风景','N',null,null,['阴雨']],
  ['迷路看地图','N',null,['山岳','古迹']], ['席地品尝便当','R','food',null,['阴雨','飘雪']],
  ['撑伞漫步听雨','R','umbrella',['水乡','古迹'],['晴空','璀璨星空']],
  ['篝火帐篷夜宿','R','tent',['草原','荒漠'],['晴空','阴雨']],
  ['拄杖登顶喘气','R','walkingStick',['山岳','雪山']],
  ['提灯夜游探秘','SR','lantern',['古迹','奇观'],['晴空','晨雾']],
  ['裹睡袋滚雪地','SR','sleepingBag',['雪山','高原'],['晴空','阴雨']],
  ['与好友分食特产','SR','sharing']
 ];
 function random(seed) { return () => { seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296; }; }
 function eligible(t,sky) {
  const gear=t.gear||[],tags=t.destination.tags||[t.destination.terrain_tag];
  return actions.map(([name,grade,need,terrain,excluded],i)=>({name,grade,need,terrain,excluded,id:i+1})).filter(a=>
   (!a.terrain||a.terrain.some(tag=>tags.includes(tag)))&&!a.excluded?.includes(sky)&&
   (!a.need||(a.need==='food'?!!t.food:a.need==='sharing'?(t.sharingFriends===undefined||t.sharingFriends.length>0)&&['feast','imperial'].includes(t.food)&&gear.some(g=>['charm','redknot'].includes(g)):gear.includes(a.need))));
 }
 function arrivalConditions(t) {
  const dest=t.destination;if(!dest||dest.id<3001||dest.id>3030||!Number.isInteger(dest.id))return null;
  const identity=t.journalId||String(t.start||dest.id);let seed=2166136261;
  for(const ch of identity)seed=Math.imul(seed^ch.charCodeAt(0),16777619);
  const rng=random(seed),arrival=t.end||t.claimedAt||t.start||0,clock=new Date(arrival+8*3600000);
  const hour=clock.getUTCHours(),month=clock.getUTCMonth(),terrain=dest.terrain_tag,r=rng();
  const sky=({'晴':'晴空','小雨':'阴雨'})[t.weatherLabel]||
   ((['高原','雪山'].includes(terrain)&&r<.45||dest.id===3018&&[10,11,0,1].includes(month)&&r<.28)?'飘雪':terrain!=='荒漠'&&r<.19?'阴雨':hour<5||hour>=20?'璀璨星空':hour<8?'晨雾':hour>=17?'晚霞':'晴空');
  return {dest,seed,rng,month,terrain,sky};
 }
 function create(t,conditions=arrivalConditions(t)) {
  if(!conditions)return null;
  const {dest,seed,rng,month,terrain,sky}=conditions;
  const pool=eligible(t,sky),special=pool.filter(a=>a.id>=5);
  const candidates=special.length&&(rng()<.68||t.weatherLabel==='小雨')?special:pool;
  const action=candidates[Math.floor(rng()*candidates.length)];
  const friends=action.id===10&&t.sharingFriends?t.sharingFriends:['aguo','jinjin','baiyu','fangfang'];
  return {seed:seed>>>0,sky,month,action:action.id,actionName:action.name,actionGrade:action.grade,
   anchor:Math.floor(rng()*3),friend:action.id===10||t.companion?friends[Math.floor(rng()*friends.length)]:null,
   destination:dest.id,region:dest.region,terrain,lantern:(t.gear||[]).includes('lantern')};
 }
 return {create,eligible,random,arrivalConditions};
})();
// The numbered story cards have authored full-bleed fronts and fixed reverse text.
const StoryPostcards = (() => {
 const cards = [
  [3007,'断桥借伞 · 烟雨逢君','lotus',['umbrella'],['阴雨'],'白羽','江南的雨下得又细又密，伞有点小，但往旁边歪一歪，就刚好够两个人听雨啦。'],
  [3010,'迎客松下 · 云海弈棋','rice',['walkingStick'],['晴空','晨雾'],'金金','金金说赢的人可以多吃一节竹筒饭。我已经想了半个时辰，到底是保住那朵白花，还是直接吃掉便当呢？'],
  [3027,'月牙泉畔 · 星空驼铃',null,['tent','kettle','camelBells'],null,'方方','沙漠的夜晚一点也不孤单，风里全是叮叮当当的驼铃声，泉水里还住着一整个银河的星星。'],
  [3018,'故宫瑞雪 · 角楼候春','feast',['redknot'],['飘雪'],'阿果','一下雪，紫禁城就变成了童话里的地方。不过我怀疑只要我一转身，雪人鼻子上的糖葫芦就会进阿果的肚子里。'],
  [3028,'茶卡盐湖 · 天境摘星','butter',['lantern'],['晚霞','璀璨星空'],'独自旅行','分不清自己是在水面上走路，还是在云朵里散步。我低下头，差点就捞到了今晚最亮的那颗星。'],
  [3011,'景德古窑 · 青花染爪','lotus',['kettle'],null,'白羽','老匠人说青花料进窑烧过之后才会变成最漂亮的蓝色。那我鼻尖上这一滴，洗不掉的话会不会也变成蓝宝石呀？'],
  [3014,'漓江竹筏 · 渔火晚唱','wrap',['lantern','boatTicket'],null,'鸬鹚','竹筏走得很慢，慢到山峰都在排队跟我打招呼。原来什么都不想、只看云飘过去，也是很重要的一件事。'],
  [3005,'玉龙雪巅 · 日照金山','bun',['sleepingBag','walkingStick'],null,'方方、金金','等太阳出来的那几分钟耳朵冻得冰凉，但当整座雪山变成金子的时候，大家一起咬下热包子的那一刻，全天下最暖和。'],
  [3026,'秦俑军阵 · 千年对视','feast',['kettle','charm'],null,'独自旅行','我跟这位泥巴将军站着比试了半个小时看谁先眨眼，结果我的肚子先咕咕叫了一声，算我输啦。'],
  [3001,'神州团圆 · 万家灯火','imperial',['redknot'],null,'阿果、金金、白羽、方方','走过那么多山川湖海，原来最美的风景，是带着满背包的故事，和好朋友们一起吃一顿热乎乎的团圆饭。']
 ].map(([destination,name,food,gear,skies,companion,message],i)=>({id:'SSR-'+String(i+1).padStart(2,'0'),asset:'travel-card-ssr-'+String(i+1).padStart(2,'0'),destination,name,food,gear,skies,companion,message}));
 function complete(album){const owned=new Set((album||[]).map(t=>t.storyId));return cards.slice(0,9).every(c=>owned.has(c.id));}
 function match(t,sky,album){
  const card=cards.find(c=>c.destination===t.destination?.id);
  if(!card||(card.food&&card.food!==t.food)||!card.gear.every(key=>t.gear?.includes(key)))return null;
  if(card.skies&&!card.skies.includes(sky))return null;
  if(card.id==='SSR-05'){const hour=new Date(t.end+8*3600000).getUTCHours();if(hour<19||hour>=21)return null;}
  if(card.id==='SSR-10'&&!complete(album))return null;
  return card;
 }
 return {cards,complete,match};
})();

// Travel mechanics driven by Item_Config. Unspecified base drop rates are prototype defaults.
const GameTravel=(()=>{
 const HOUR=3600000;
 const destinations=TravelCollectionCatalog.destinations;
 const pick=(list,weight,rng)=>{let n=rng()*list.reduce((a,x)=>a+weight(x),0);for(const x of list){n-=weight(x);if(n<=0)return x}return list.at(-1)};
 function candidates(food,gear){return destinations.filter(d=>(!d.require||gear.includes(d.require))&&(items[food].hours[0]<18||!d.near)&&(items[food].hours[1]>=4||!d.remote)&&(food!=='honey'||d.near)&&(food!=='imperial'||d.remote)&&(food!=='bun'||!d.tags.some(t=>['高原','雪山'].includes(t))))}
 function weight(d,food,gear){const f=items[food];let w=1+(f.directions[d.region]||0);if(food==='lotus'&&d.tags.includes('水乡'))w*=1.5;if(food==='rice'&&d.tags.some(t=>['山岳','森林'].includes(t)))w*=2;if(food==='butter'&&d.remote&&d.tags.includes('高原'))w*=100;if(food==='feast'&&d.tags.includes('古迹'))w*=2;if(d.tags.includes('荒漠')&&!gear.includes('kettle'))w*=.2;if(gear.includes('walkingStick')&&d.tags.some(t=>['山岳','险峰'].includes(t)))w*=1.5;return w}
 function rarity(food,gear,rng,destination){const bonus=items[food].rarity+gear.reduce((a,key)=>a+items[key].rarity,0),eligible=gear.some(k=>items[k]?.type===2&&items[k].tags?.some(tag=>destination.tags.includes(tag))),r=eligible?Math.min(.75,.4*(1+bonus)):0;return {grade:rng()<r?'R':'N',bonus}}
 function souvenirFor(destination,gear,owned,rng,multiplier=1){const eligible=gear.some(k=>destination.recommended_gear_ids.includes(items[k]?.id));const candidate=TravelCollectionCatalog.souvenirs.find(s=>s.source_destination_ids.includes(destination.id)&&!owned.some(o=>o.id===s.id||o.name===s.name)&&(s.grade==='R'?destination.distance_tier<=2:(destination.distance_tier===2||s.id===5012&&destination.id===3021)&&eligible));return candidate&&rng()<Math.min(1,candidate.base_drop_probability*multiplier)?{...candidate,origin:destination.region+' · '+destination.name}:null}
 function upgradeTrip(t,s){if(!t||t.collectionVersion===1)return t;const match=destinations.find(d=>d.id===t.destination?.id)||destinations.find(d=>d.name.includes((t.destination?.name||'').replace(/竹海|云海|湖畔|水巷|营地/g,'')))||destinations.find(d=>d.region===t.destination?.region)||destinations[0];t.destination={...match};t.postcardTheme=match.name;t.rarity=['N','R'].includes(t.rarity)?t.rarity:'R';t.collectionVersion=1;t.journalId??='trip-'+t.start+'-'+match.id;return t}
 function plan(food,gear,now=Date.now(),rng=Math.random,album=[]){
  const f=items[food];if(!f||f.type!==0)throw new Error('请先装入有效便当');gear=[...new Set(gear.filter(k=>items[k]&&items[k].type!==0))];
  if(gear.includes('boatTicket')&&gear.includes('camelBells'))throw new Error('船票与驼铃不能同时使用，请保留一种方向凭证');
  let pool=candidates(food,gear);
  if(food==='bun'&&gear.includes('sleepingBag')&&gear.includes('walkingStick'))pool.push(destinations.find(d=>d.id===3005));
  if(food==='imperial'&&gear.includes('redknot')&&StoryPostcards.complete(album))pool.push(destinations.find(d=>d.id===3001));
  const lock=gear.includes('boatTicket')?['华东','华南']:gear.includes('camelBells')?['西北','西南']:null;
  // 1001's explicit nearby-only rule takes precedence over a region ticket.
  if(lock&&food!=='honey'){const hit=rng()<.9,target=pool.filter(d=>hit?lock.includes(d.region):!lock.includes(d.region));if(target.length)pool=target}
  const destination=pick(pool,d=>weight(d,food,gear),rng),baseHours=f.hours[0]+rng()*(f.hours[1]-f.hours[0]),totalMs=Math.round(baseHours*HOUR*(food==='mung'?.8:1)*(food==='lotus'?.97:1)),resultRarity=rarity(food,gear,rng,destination);
  const local=localSpecialties[destination.specialty_id-4001];
  const empty=!gear.includes('redknot')&&food!=='wrap'&&rng()>=local.chance/100;
  const cap=3+(gear.includes('charm')?1:0),count=empty?0:Math.max(food==='wrap'?2:1,1+Math.floor(rng()*cap));
  const companion=food==='mung'&&rng()<.15,owned=typeof state!=='undefined'?state.travelSouvenirs||[]:[],souvenir=souvenirFor(destination,gear,owned,rng,food==='imperial'?2:1);
  const postcardTheme=destination.name;
  return {version:3,collectionVersion:1,journalId:`trip-${now}-${destination.id}-${Math.floor(rng()*1e9)}`,food,gear,destination,baseHours,totalMs,start:now,end:now+totalMs,returnMs:Math.round(baseHours*HOUR*.3*(food==='mung'?.8:1)*(food==='lotus'?.9:1)),rarity:resultRarity.grade,rarityBonus:resultRarity.bonus,specialtyCount:count,specialty:local.name,specialtyId:local.id,souvenir,companion,postcardTheme,moodGain:food==='bambooRoll'?5:0,comfort:gear.includes('sleepingBag')?'温暖舒适':'平静自在',staminaUse:gear.includes('walkingStick')?.7:1,notice:lock&&food==='honey'?'短途便当优先，仅在周边旅行；方向凭证未消耗。':''};
 }
 function begin(s,source='bag',now=Date.now(),rng=Math.random){
  const load=s[source],food=load[0];
  if(!food||items[food]?.type!==0)throw new Error('先带上一份便当吧');
  const counts={};
  for(const key of [...s.bag,...s.reserve].filter(Boolean)){
   counts[key]=(counts[key]||0)+1;
   if(counts[key]>(s.inventory[key]||0))throw new Error('行囊库存不足，请重新整理');
  }
  const trip=plan(food,load.slice(1).filter(Boolean),now,rng,s.tripPostcards);
  const stage=s.introTrip;
  if(stage===0||stage===1){
   trip.totalMs=stage===0?210000:9000000;
   trip.end=now+trip.totalMs;
   trip.returnMs=Math.round(trip.totalMs*.3);
   if(stage===0||trip.gear.includes('umbrella')){
    const place=destinations.find(d=>d.id===(stage===0?3001:3007));
    trip.destination=place;trip.postcardTheme=place.name;
    trip.specialtyId=place.specialty_id;trip.specialty=localSpecialties[place.specialty_id-4001].name;
    trip.souvenir=stage===0?TravelCollectionCatalog.souvenirs.find(g=>g.id===5001):souvenirFor(place,trip.gear,s.travelSouvenirs||[],rng);
    trip.rarity='R';trip.weatherLabel=stage===0?'晴':'小雨';
    if(stage===0)trip.specialtyCount=2;
   }
   s.introTrip++;
  }
  trip.sharingFriends=Object.entries(s.companions?.records||{}).filter(([,r])=>typeof GameFriends!=='undefined'&&GameFriends.rank?.(r)>=3).map(([id])=>id);
  trip.loadoutSource=source;
  consume(s,trip,source);
  Object.assign(s,{trip,mode:'travel',start:now,end:trip.end,reserveAt:0,autoDepartAt:0});
  if(source==='bag'&&s.reserve[0])s.reserveAt=trip.end+reserveDelay(s);
  return trip;
 }
 function reserveDelay(s){return s.introTrip===0?15000:s.introTrip===1?300000:(15+Math.random()*30)*60000}
 function initialize(s){s.durability??={};s.specialties??={};s.travelSouvenirs??=[];s.tripPostcards??=[];s.pendingLetters??=[];s.mood??=50;s.stamina??=100;s.travelLog??=[];for(const [key,it] of Object.entries(items))if(it.durability>1&&Number.isFinite(it.durability)&&(s.inventory[key]||0)>0)syncGearCopies(s,key);s.itemConfigVersion=ITEM_CONFIG_VERSION;for(const t of [s.trip,...s.pendingLetters])if(t)upgradeTrip(t,s);const seen=new Set();s.travelSouvenirs=s.travelSouvenirs.filter(g=>{const def=TravelCollectionCatalog.souvenirs.find(c=>c.id===g.id||c.name===g.name);if(def){Object.assign(g,{...def,origin:g.origin});if(seen.has(def.id))return false;seen.add(def.id)}return true})}
 function consume(s,trip,source='bag'){
  const spend=key=>{s.inventory[key]=Math.max(0,(s.inventory[key]||0)-1);s[source]=s[source].map(v=>v===key?null:v)};
  spend(trip.food);for(const key of trip.gear){const it=items[key];if((key==='boatTicket'||key==='camelBells')&&trip.food==='honey')continue;if(it.consumable){spend(key)}else if(Number.isFinite(it.durability)){consumeGearCopy(s,key,source)}}
 }
 function settle(s,now=Date.now()){if(s.mode!=='travel'||now<s.end)return false;const trip=s.trip;
  s.mode='home';s.mail++;if(trip&&!trip.settled){if(trip.souvenir&&s.travelSouvenirs.some(g=>g.id&&g.id===trip.souvenir.id||g.name===trip.souvenir.name))trip.souvenir=null;const arrival=PostcardRules.arrivalConditions(trip);
  const sky=trip.postcard?.sky||arrival?.sky,story=StoryPostcards.match(trip,sky,s.tripPostcards);
  if(story){
   trip.storyId=story.id;trip.rarity='SSR';trip.postcardTheme=story.name;
   trip.weatherLabel=({'SSR-03':'璀璨星空','SSR-07':'晚霞','SSR-08':'晴空','SSR-10':'晴夜'})[story.id]||sky;
   trip.companionName=story.companion;trip.companion=story.companion!=='独自旅行';delete trip.postcard;
  }else{trip.postcard??=PostcardRules.create(trip,arrival);}
  trip.settled=true;s.lastTrip=trip;s.pendingLetters.push(trip);s.mood=Math.min(100,s.mood+trip.moodGain);s.stamina=Math.max(0,s.stamina-Math.round(20*trip.staminaUse));s.specialties[trip.specialty]=(s.specialties[trip.specialty]||0)+trip.specialtyCount;if(trip.souvenir&&!s.travelSouvenirs.some(g=>g.id&&g.id===trip.souvenir.id||g.name===trip.souvenir.name))s.travelSouvenirs.push({...trip.souvenir,origin:trip.destination.region+' · '+trip.destination.name});s.travelLog.unshift(trip);s.travelLog=s.travelLog.slice(0,30)}return true;
 }
 return {begin,reserveDelay,plan,initialize,consume,settle,candidates,weight,destinations,souvenirFor};
})();
function departurePanel(){const food=items[state.bag[0]],gear=state.bag.slice(1).filter(Boolean),bonus=(food?.rarity||0)+gear.reduce((a,k)=>a+(items[k]?.rarity||0),0);return `${image(food?.img||'icon6','journey-icon')}<h4 class="trip-heading">${food?.name||'还没装好便当'}</h4><div class="card">${food?itemRulesMarkup(state.bag[0]):'请先装入一份便当。'}<p>带一份便当即可出发，护身符与道具可选。</p>${state.introTrip===0?'<p>初次出游 · 青城山，约 3 分 30 秒归来。</p>':state.introTrip===1?'<p>第二次出游约 2 小时 30 分钟。带油纸伞可游雨中西湖。</p>':''}${state.autoDepartAt?'<p>预计北京时间 '+new Date(state.autoDepartAt).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',second:'2-digit'})+' 自行出发，也可现在出发。</p>':''}<p>随行：${gear.map(k=>items[k].name).join('、')||'轻装出行'}</p><p>稀有度合计加成 +${Math.round(bonus*100)}%</p><small>便当与一次性物品在出发时使用；耐用装备每次出行消耗1点耐久。</small></div>${button('出发，去看看远方','depart()',false,!food)}${button('再陪它待一会儿','cancelPrepare()',true)}`}
function journeyMap(trip){
 const place=trip?.destination,known=TravelCollectionCatalog.destinations.find(d=>d.id===place?.id||d.name===place?.name);
 const art=known?'travel-landmark-'+known.id:'yard-day-v2';
 return `<figure class="journey-map" aria-label="本次旅行路线示意"><img class="journey-landscape" src="${assetUrl(art)}" alt=""><figcaption><small>${journalEscape(place?.region||'远方')}</small><strong>${journalEscape(place?.name||'旅途进行中')}</strong></figcaption>
 <svg class="journey-trail" viewBox="0 0 320 62" aria-hidden="true">
 <path id="journey-outbound" d="M28 38 C72 40 82 8 126 17 S226 50 292 22"/>
 <path id="journey-homeward" d="M292 22 C254 46 212 57 164 42 S78 56 28 38"/>
 <g class="journey-stations"><circle cx="28" cy="38" r="4"/><circle cx="292" cy="22" r="4"/></g>
 <g id="journey-traveler" transform="translate(28 38)"><circle r="9"/><g fill="#fff5d8"><ellipse cy="2" rx="4.3" ry="3"/><circle cx="-4" cy="-2" r="1.6"/><circle cx="0" cy="-4" r="1.8"/><circle cx="4" cy="-2" r="1.6"/></g></g></svg>
 <div class="journey-map-key"><span>竹林小院</span><span id="journey-map-stage"></span><span>目的地</span></div></figure>`;
}
function updateJourneyMap(now=Date.now()){
 const marker=$('journey-traveler');if(!marker)return;
 const duration=Math.max(1,state.end-state.start),elapsed=Math.max(0,Math.min(duration,now-state.start));
 const outward=Math.max(1,duration-Math.min(duration-1,state.trip?.returnMs??duration*.3));
 const back=elapsed>=outward,leg=$(back?'journey-homeward':'journey-outbound');
 const fraction=back?(elapsed-outward)/Math.max(1,duration-outward):elapsed/outward;
 const point=leg.getPointAtLength(leg.getTotalLength()*fraction);
 marker.setAttribute('transform',`translate(${point.x} ${point.y})`);
 $('journey-map-stage').textContent=(back?'归途中':'去程中')+' · '+Math.floor(100*elapsed/duration)+'%';
}
function journeyPanel(){const t=state.trip;return `${journeyMap(t)}<div class="journey-stats"><div><b id="journey-elapsed">${timeText(Date.now()-state.start)}</b><span>已经出发</span></div><div><b id="journey-left">${timeText(state.end-Date.now())}</b><span>预计归来还需</span></div></div><p class="muted">${t?items[t.food].name+' · '+timeText(t.totalMs)+'旅程':'沿途收集风景与问候'}<br>预计归来：${new Date(state.end).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}（北京时间）</p>${t?.notice?`<p class="card">${t.notice}</p>`:''}${t?`<div class="card">${t.gear.map(k=>items[k].name+': '+(items[k].durability===Infinity?'永久':items[k].consumable?'本次使用':'剩余 '+itemDurability(k)+' 次')).join('<br>')||'轻装出行'}<p>稀有度加成 +${Math.round(t.rarityBonus*100)}% · ${t.comfort}</p>${t.staminaUse<1?'<p>登山杖正在减少体力消耗</p>':''}</div>`:''}${button('查看来信',"openPanel('mail')",true)}`}
function travelReturnPanel(){const t=state.lastTrip;return `${image(motionAllowed()?'motion-door':'travel-action-1','journey-icon arriving-panda')}<h4 class="trip-heading">它平安回家啦</h4>${t?`<div class="card"><h4>${t.destination.name}</h4><p>${t.rarity} · ${t.postcardTheme}${t.companion?' · 动物旅伴同框':''}</p><p>${t.specialty} ×${t.specialtyCount}</p>${t.souvenir?`<p>${t.souvenir.name} ×1</p>`:''}${t.moodGain?`<p>心情 +${t.moodGain} · 当前 ${state.mood}/100</p>`:''}</div>`:'<p>一封旅行来信，等你拆开收藏。</p>'}${button('拆开旅行来信',"openPanel('letter')")}${button('查看旅途收获',"openPanel('travelrewards')",true)}`}
function travelLetterPanel(){const t=state.pendingLetters?.[0];if(!t)return null;return `<div class="postcard"><span>${t.postcardTheme} · ${t.rarity}</span></div><p class="letter">今天抵达了${t.destination.region}的${t.destination.name}。<br>${t.companion?'路上认识了一位动物旅伴，一起留了合影。':'把沿途的风景，寄一份给你。'}<br>带回${t.specialtyCount}份${t.specialty}。<br>—— 你的小熊猫</p>${button('收藏这张旅行明信片','claimLetter()',false,!state.mail)}`}
function travelRewardsPanel(){return `<h4>地方特产</h4><div class="card">${Object.entries(state.specialties||{}).map(([k,v])=>`${k} ×${v}`).join('<br>')||'下一次旅行，带回一点地方风味。'}</div><h4>旅行纪念品</h4><div class="card">${(state.travelSouvenirs||[]).map(v=>`${v.grade} · ${v.name}`).join('<br>')||'等待下一段旅途的礼物。'}</div><p class="muted">心情 ${state.mood}/100 · 体力 ${state.stamina}/100 · 已完成 ${state.travelLog?.length||0} 段旅程</p>${button('查看旅行手账',"openPanel('album')",true)}`}
function tripCollectionPanel(souvenir){const list=souvenir?state.travelSouvenirs:state.tripPostcards;return `<div class="tabs"><button class="${!souvenir?'active':''}" onclick="openPanel('album');collectionTab='postcards';renderPanel()">明信片</button><button class="${souvenir?'active':''}" onclick="openPanel('souvenirs')">纪念品</button></div><p class="muted">旅途中收藏的风景与礼物</p><div class="trip-collection-grid">${list.map((t,i)=>`<button class="card" onclick="tripCollectionDetail(${souvenir},${i})">${image(souvenir?'souvenir9':items[t.food].img)}<b>${souvenir?t.name:t.postcardTheme}</b><small>${souvenir?t.grade:t.rarity}${!souvenir&&t.companion?' · 旅伴合影':''}</small></button>`).join('')}</div>${button('查看地方特产',"openPanel('travelrewards')",true)}`}
function tripCollectionDetail(souvenir,i){const t=(souvenir?state.travelSouvenirs:state.tripPostcards)[i];if(!t)return;$('panel-body').innerHTML=`${image(souvenir?'souvenir9':items[t.food].img,'journey-icon')}<h4 class="trip-heading">${souvenir?t.name:t.postcardTheme}</h4><p class="letter">${souvenir?t.grade+' · '+(t.heritage?'非遗纪念品':'旅行纪念品'):t.rarity+' · '+t.destination.region+' / '+t.destination.name+(t.companion?' · 动物旅伴同框':'')}</p>${button('返回收藏',souvenir?"openPanel('souvenirs')":"openPanel('album')",true)}`}
;
// Illustrated shop assets supplied with this project; inventory shares the existing save.
let shopProduct=null,shopQty=1,shopReceipt=null,shopBusy=false;
const shopCategories=[['food','便当'],['gear','出行道具'],['charm','护身符'],['pantry','待客食盒']];
const shopCatalog={pantry:['cake','flower','nuts','fruit','grain','tea','jerky','butterTea'].map(id=>'pantry:'+id),food:FoodConfig.map(v=>v[0]),gear:GearConfig.filter(v=>v[10]===2&&v[3]!==null).map(v=>v[0]),charm:GearConfig.filter(v=>v[10]===1&&v[3]!==null).map(v=>v[0])};
function openPantryShop(){shopTab='pantry';openPanel('shop')}
function shopItem(id){if(!id?.startsWith('pantry:'))return items[id];const key=id.slice(7),snack=GameFriends.snacks[key],price=GameFriends.snackPrices[key];return snack&&price?{...snack,price,purchasable:true,type:4,tag:'伙伴投喂',desc:'招待来访伙伴的'+snack.name+'，购买后存入待客食盒。仅投喂时消耗，不占用出行行囊。'}:null}
function shopOwned(id){return id.startsWith('pantry:')?(GameFriends.init(state).pantry[id.slice(7)]||0):(state.inventory[id]||0)}
function shopLeaf(){return image('shop-currency','shop-leaf')}
function shopSetCategory(category){if(!shopCatalog[category])return;shopTab=category;shopProduct=null;shopReceipt=null;renderPanel()}
function shopPanel(){
 return `<div class="shop-shell"><div class="shop-hero"><img decoding="async" class="shop-backdrop" src="${assetUrl('shop-stall')}" alt="竹木柜台与暖灯"><img decoding="async" class="shop-sign" src="${assetUrl('shop-sign')}" alt="膳食杂货铺"><img decoding="async" class="shop-clerk" src="${assetUrl(`shop-clerk${shopReceipt?4:0}`)}" alt="熊猫店员"><button class="shop-exit modal-close" onclick="closePanel(true)" aria-label="关闭杂货铺">×</button><span class="shop-greeting">${shopReceipt?'谢谢惠顾，慢慢逛呀':'给旅途，添一点好滋味'}</span></div><div class="shop-category-tabs" role="tablist" aria-label="商品分类">${shopCategories.map(([id,label])=>`<button role="tab" aria-selected="${id===shopTab}" onclick="shopSetCategory('${id}')">${label}</button>`).join('')}</div><div class="shop-wallet"><span>${shopLeaf()}<b>${state.leaves.toLocaleString()}</b> 竹笋</span><button onclick="openPanel('shopinventory')">物品库存 ›</button></div><div class="shop-product-grid">${shopCatalog[shopTab].map(id=>{const it=shopItem(id),owned=shopOwned(id);return `<article class="shop-product"><h4>${it.name}</h4>${it.unique&&owned?'<span class="shop-owned">已拥有</span>':''}<button class="shop-art-button" onclick="showShopProduct('${id}')" aria-label="查看${it.name}">${image(it.img)}</button><span class="shop-tag ${it.type===1?'charm-tag':''}">${it.tag}</span><p class="shop-price">${it.lotteryOnly?'竹签小惊喜':shopLeaf()+it.price}</p><button class="shop-card-action ${it.lotteryOnly?'gold':''}" onclick="${it.lotteryOnly?"openPanel('lottery')":`showShopProduct('${id}')`}">${it.lotteryOnly?'去摇奖':'查看'}</button></article>`}).join('')}</div><p class="shop-footnote">${shopTab==='pantry'?'购买后存入待客食盒 · 在伙伴来访中投喂':'竹笋换好物 · 购买后收进物品库存'}</p></div>${shopProduct||shopReceipt?shopPurchasePanel():''}`;
}
function showShopProduct(id){if(!shopItem(id)?.purchasable){toast('这件物品无法购买，请通过采摘或抽奖获取');return}shopProduct=id;shopReceipt=null;shopQty=1;renderPanel();$('panel-body').querySelector('.shop-detail-close').focus()}
function closeShopDetail(){shopProduct=null;shopReceipt=null;renderPanel()}
function shopChangeQty(delta){const it=shopItem(shopProduct);if(!it||it.unique||it.lotteryOnly)return;shopQty=Math.max(1,Math.min(99,shopQty+delta));renderPanel()}
function shopPurchasePanel(){
 if(shopReceipt){const r=shopReceipt,it=shopItem(r.id);return `<div class="shop-detail-shade"><section class="shop-detail-card shop-receipt" role="dialog" aria-labelledby="shop-detail-title"><button class="shop-detail-close modal-close" onclick="closeShopDetail()" aria-label="关闭购买结果">×</button><div class="shop-success-check">✓</div><h3 id="shop-detail-title">购买成功</h3>${image(it.img,'shop-detail-art')}<h4>${it.name} ×${r.qty}</h4><p class="shop-stock-message">已加入${it.type===4?'待客食盒':it.type===1?'护身符库存':'物品库存'}</p><p>库存：${r.before} → <b>${r.after}</b></p><p class="shop-spent">${shopLeaf()}竹笋 −${r.total}</p><div class="shop-result-actions"><button class="shop-confirm" onclick="${it.type===4?"openFriendView('feed')":"openPanel('shopinventory')"}">${it.type===4?'去招待伙伴':'查看物品'}</button><button class="shop-cancel" onclick="closeShopDetail()">继续逛逛</button></div></section></div>`}
 const id=shopProduct,it=shopItem(id),owned=shopOwned(id),already=!!(it.unique&&owned),total=it.price*shopQty,short=Math.max(0,total-state.leaves);
 return `<div class="shop-detail-shade"><section class="shop-detail-card" role="dialog" aria-labelledby="shop-detail-title"><button class="shop-detail-close modal-close" onclick="closeShopDetail()" aria-label="关闭商品详情">×</button><h3 id="shop-detail-title">${it.name}</h3>${image(it.img,'shop-detail-art')}<span class="shop-tag">${it.tag}</span><p class="shop-description">${it.desc}</p>${it.type===4?'<p class="muted">用于伙伴来访投喂，食物偏好与原有规则一致。</p>':itemRulesMarkup(id)}<div class="shop-detail-facts"><p><span>单价</span><b>${shopLeaf()}${it.price} 竹笋</b></p><p><span>已拥有</span><b>${owned} 件</b></p></div>${already?'<p class="shop-stock-message">已拥有 · 无需重复购买</p>':it.lotteryOnly?'<p class="shop-stock-message">这件物品可通过摇竹签获取</p>':`<div class="shop-quantity"><button aria-label="减少购买数量" onclick="shopChangeQty(-1)" ${shopQty===1||it.unique?'disabled':''}>−</button><output aria-label="购买数量">${shopQty}</output><button aria-label="增加购买数量" onclick="shopChangeQty(1)" ${shopQty===99||it.unique?'disabled':''}>＋</button></div><p class="shop-total">合计：${shopLeaf()}<b>${total}</b> 竹笋</p><p class="shop-after ${short?'insufficient':''}">${short?'还差 '+short+' 竹笋':'购买后余额：'+(state.leaves-total)+' 竹笋'}</p>`}<button class="shop-confirm" onclick="${already?"openPanel('shopinventory')":it.lotteryOnly?"openPanel('lottery')":short?'shopHarvest()':'shopConfirmPurchase()'}">${already?'查看物品':it.lotteryOnly?'去摇奖':short?'余额不足 · 去小院收笋':'确认购买'}</button></section></div>`;
}
function shopConfirmPurchase(){
 if(shopBusy||!shopProduct||shopReceipt)return;
 const id=shopProduct,it=shopItem(id);if(!it||!it.purchasable)return;
 const qty=it.unique?1:shopQty;if(!Number.isInteger(qty)||qty<1||qty>99)return;
 const before=shopOwned(id);if(it.unique&&before>0){toast('这件好物已经拥有了');return}
 const total=it.price*qty;if(state.leaves<total){toast('竹笋还不够，先去小院收一些吧');renderPanel();return}
 shopBusy=true;if(id.startsWith('pantry:')){shopReceipt=GameFriends.buySnack(state,id.slice(7),qty);if(!shopReceipt){shopBusy=false;toast('购买未完成，请检查余额和数量');return}}else{state.leaves-=total;for(let i=0;i<qty;i++)addInventoryReward(state,id,'shop-'+Date.now()+'-'+i);shopReceipt={id,qty,before,after:before+qty,total};}shopProduct=null;save();render();renderPanel();shopBusy=false;
 $('panel-body').querySelector('.shop-detail-close').focus();
}
function shopHarvest(){shopProduct=null;shopReceipt=null;closePanel(true);changeScene('yard');toast('划一划笋田，收集竹笋再来逛吧')}
function shopInventoryPanel(){const owned=Object.entries(items).filter(([id])=>(shopOwned(id))>0);return `<p class="muted">购买的好物都收在这里，行囊与桌面备用共用此库存。</p><div class="reserve-inventory">${owned.map(([id,it])=>`<button class="reserve-item" onclick="openItemInfo('${id}')" aria-label="查看库存物品${it.name}">${image(it.img)}<b>${it.name}</b><span class="reserve-count">${state.inventory[id]}</span><small>${['便当','护身符','出行道具','摆件'][it.type]}${it.durability>1&&Number.isFinite(it.durability)?' · 耐久 '+itemDurability(id):''}</small></button>`).join('')}</div>${shopPantryInventory()}${button('整理行囊',"openPanel('bag')")}${button('返回杂货铺',"openPanel('shop')",true)}`}

let inventoryInfoKey='';function openItemInfo(id){inventoryInfoKey=id;openPanel('iteminfo')}
function itemInfoPanel(){const it=items[inventoryInfoKey];return `${image(it.img,'journey-icon')}<h4 class="trip-heading">${it.name}</h4><p>${it.desc||'留在家中的收藏小物。'}</p>${it.id?itemRulesMarkup(inventoryInfoKey):''}${gearCopiesMarkup(inventoryInfoKey)}${inventoryAllocationMarkup(inventoryInfoKey)}<p class="muted">获取方式：${it.purchasable?'杂货铺购买':it.source||'已有收藏'} · 已拥有 ${state.inventory[inventoryInfoKey]||0} 件</p>${button('返回物品库存',"openPanel('shopinventory')",true)}`}

function shopPantryInventory(){const f=GameFriends.init(state),list=shopCatalog.pantry.filter(id=>(f.pantry[id.slice(7)]||0)>0);return `<h4>待客食盒</h4><p class="muted">用于伙伴投喂，独立存放。</p><div class="reserve-inventory">${list.map(id=>{const it=shopItem(id);return `<button class="reserve-item" onclick="openPantryShop();showShopProduct('${id}')">${image(it.img)}<b>${it.name}</b><span class="reserve-count">${shopOwned(id)}</span></button>`}).join('')||'<p class="muted">食盒空了，去杂货铺补充一些吧。</p>'}</div>${button('补充待客食盒',"openPantryShop()",true)}`}
;
// Visits pause while the panda travels; the handbook and earned progress remain available.
const GameFriends=(()=>{
 const profiles={
  aguo:{name:'阿果',animal:'小熊猫',trait:'贪吃亲人',likes:'甜食、水果',tags:['sweet','fruit'],reject:[],hello:'闻到甜甜的香气，我就来啦！',origin:'我沿着溪水一路走来，远远就闻到了小院的甜香。',favorite:'甜甜的点心和水果，我都想尝一口！',thanks:'超爱！甜甜的味道，像被你抱了一下。',bye:'今天吃得好开心，下次再来！'},
  jinjin:{name:'金金',animal:'金丝猴',trait:'活泼好奇',likes:'坚果、茶点',tags:['nuts','sweet'],reject:[],hello:'我刚从山那边来，那儿的松子可香了！',origin:'山那边的松林可热闹了！下次带你去看松鼠。',favorite:'我最喜欢坚果和茶点，咔嚓咔嚓，真香！',thanks:'好吃！我要把这份开心带回山里！',bye:'我去山那边转转，下次给你讲新鲜事！'},
  baiyu:{name:'白羽',animal:'朱鹮',trait:'安静优雅',likes:'谷物、清茶',tags:['grain','tea'],reject:['nuts','meat'],hello:'清茶的香气，最让人安心。',origin:'我从溪畔的浅滩来。水面映着竹影，很安静。',favorite:'一点谷物，一盏清茶，就很好。',thanks:'谢谢你的心意，和你一起坐坐很安心。',bye:'天色正好，我再去溪边走走。'},
  fangfang:{name:'方方',animal:'藏狐',trait:'外冷内热',likes:'肉干、酥油茶',tags:['meat','butterTea'],reject:['sweet','fruit'],hello:'……路过。也可以坐一会儿。',origin:'从高原来的。风有点大，这里倒是暖和。',favorite:'肉干，或者酥油茶。你记住就好。',thanks:'……挺好吃的。谢谢，我下次还来。',bye:'走了。你也记得好好吃饭。'}
 };
 const snacks={cake:{name:'红糖糍粑',img:'friend-food-cake',tags:['sweet']},flower:{name:'鲜花饼',img:'friend-food-flower',tags:['sweet']},nuts:{name:'坚果',img:'friend-food-nuts',tags:['nuts']},fruit:{name:'山间鲜果',img:'friend-food-fruit',tags:['fruit']},grain:{name:'谷物点心',img:'friend-food-grain',tags:['grain']},tea:{name:'清茶',img:'prop6',tags:['tea']},jerky:{name:'风干肉干',img:'friend-food-jerky',tags:['meat']},butterTea:{name:'酥油茶',img:'prop6',tags:['butterTea']}};
 const snackPrices={cake:15,flower:20,nuts:12,fruit:10,grain:12,tea:8,jerky:20,butterTea:16};
 const order=Object.keys(profiles),stayMs=30*60000,cooldownMs=5*60000;
 const ranks=[
  {name:'初识过客',xp:0,bamboo:0,ticket:0,perk:'在院门探头张望'},
  {name:'点头之交',xp:50,bamboo:10,ticket:2,perk:'在石桌旁喝茶、打盹'},
  {name:'投缘食客',xp:150,bamboo:20,ticket:5,perk:'来访时有30%机会帮收成熟竹笋'},
  {name:'竹林挚友',xp:350,bamboo:35,ticket:8,perk:'可在普通明信片「与好友分食特产」中同框'},
  {name:'莫逆之交',xp:650,bamboo:50,ticket:15,perk:'获赠专属纪念明信片与车票'}
 ];
 const keepsakes={aguo:['柿红时节','柿子最甜的那一半，我给你留着。'],jinjin:['松间赠果','这颗松果是我从最高的枝头摘的，送给你！'],baiyu:['溪畔共茶','我记得那盏清茶的温度，也记得等我坐下的你。'],fangfang:['雪窗暖茶','风雪天也想来坐坐。嗯，是专程来的。']};
 function rank(record){const xp=record?.titleXp??Math.floor((record?.affection||0)*650/10000);return ranks.reduce((n,r,i)=>xp>=r.xp?i:n,0)}
 function grantKeepsake(s,id,now){
  const r=s.companions.records[id];if(rank(r)!==4||r.keepsakeGranted)return;
  const journalId='friend-keepsake-'+id,title=keepsakes[id][0];
  s.tripPostcards??=[];if(!s.tripPostcards.some(t=>t.journalId===journalId)){
   s.tripPostcards.push({journalId,friendKeepsake:id,claimedAt:now,destination:{region:'竹林小院',name:title,asset:'travel-friend-'+id},rarity:'纪念',message:keepsakes[id][1],companionName:profiles[id].name});
   s.album=(s.album||0)+1;
  }
  r.keepsakeGranted=true;r.visitTicket=(r.visitTicket||0)+1;
 }
 function reserveTicket(s,id){const f=s.companions,r=f?.records[id];if(!r?.visitTicket||f.ticketGuest)return false;r.visitTicket--;f.ticketGuest=id;return true}
 function giftBamboo(record){return Math.round(30*(1+ranks[rank(record)].bamboo/100))}
 const day=now=>new Date(now+8*3600000).toISOString().slice(0,10);
 function init(s,now=Date.now()){
  if(!s.companions)s.companions={version:1,records:{},pantry:{cake:2,flower:1,nuts:3},welcomeBox:true,nextAt:0,nextIndex:0,serial:0,visit:null};
  const f=s.companions;f.records??={};f.pantry??={};f.serial??=0;f.nextIndex??=0;f.nextAt??=0;
  for(const id of order){f.records[id]??={affection:0,visits:0,lastGiftDay:'',lastVisitAt:0};const r=f.records[id];if(!f.bondVersion){r.affection=Math.max(0,Math.min(100,Number(r.affection)||0));r.bondDay=day(now);r.bondToday=Math.min(100,Math.round(r.affection))}r.bondToday??=0;r.bondDay??=day(now);r.titleXp??=Math.min(650,Math.floor(r.affection*650/10000));grantKeepsake(s,id,now)}
  f.bondVersion=2;f.titleVersion=1;
  syncTravel(s,now);
  if(s.mode!=='travel'&&!f.visit&&f.nextAt<=now)arrive(s,f.ticketGuest||order[f.nextIndex%order.length],now);
  return f;
 }
 function syncTravel(s,now=Date.now()){
  const f=s.companions;if(!f)return false;
  if(s.mode==='travel'){
   if(f.travelPause)return false;
   f.travelPause={visit:f.visit,remaining:f.visit?Math.max(0,f.visit.endsAt-now):0,delay:Math.max(0,f.nextAt-now)};f.visit=null;return true;
  }
  const paused=f.travelPause;if(!paused)return false;
  f.visit=paused.visit||null;if(f.visit)f.visit.endsAt=now+paused.remaining;else f.nextAt=now+paused.delay;
  delete f.travelPause;return true;
 }
 function arrive(s,id,now=Date.now()){
  if(s.mode==='travel')return false;
  const f=s.companions;if(!profiles[id]||f.visit)return false;
  const record=f.records[id];record.visits++;record.lastVisitAt=now;
  f.visit={id,serial:++f.serial,startedAt:now,endsAt:now+stayMs,points:0,fed:0,topics:[],giftReady:false,giftClaimed:false,expired:false};
  if(f.ticketGuest===id)delete f.ticketGuest;
  if(rank(record)>=2&&typeof takeMatureField==='function'&&s===state&&growthStage(now)===3&&Math.random()<.30){
   f.visit.helped=!!takeMatureField(now);
  }
  f.nextIndex=(order.indexOf(id)+1)%order.length;return true;
 }
 function tick(s,now=Date.now()){
  const f=s.companions;if(!f||f.bondVersion!==2||!f.titleVersion){init(s,now);return true}
  const changed=syncTravel(s,now);if(s.mode==='travel')return changed;
  if(f.visit&&now>=f.visit.endsAt&&!f.visit.expired){
   if(f.visit.giftReady&&!f.visit.giftClaimed){f.visit.expired=true;return true}
   leave(s,now);return true;
  }
  if(!f.visit&&now>=f.nextAt){arrive(s,f.ticketGuest||order[f.nextIndex%order.length],now);return true}return changed;
 }
 function itemTags(id){return ['honey','lotus','mung'].includes(id)?['sweet']:id==='butter'?['butterTea']:['wrap','bun'].includes(id)?['meat']:['rice','bambooRoll','feast','imperial'].includes(id)?['grain']:[]}
 function specialtyTags(name){if(/华北|中原/.test(name))return ['grain'];if(/西北/.test(name))return ['meat','butterTea'];if(/西南/.test(name))return ['nuts','tea'];if(/华东/.test(name))return ['sweet','tea'];if(/华南/.test(name))return ['fruit'];return ['fruit']}
 function foods(s){
  const f=s.companions;
  const out=Object.entries(snacks).map(([key,v])=>({...v,key:'pantry:'+key,count:f.pantry[key]||0,source:'待客食盒'}));
  for(const [id,it] of Object.entries(items))if(it.type===0){const reserved=[...(s.bag||[]),...(s.reserve||[])].filter(k=>k===id).length;out.push({key:'item:'+id,name:it.name,img:it.img,tags:itemTags(id),count:Math.max(0,(s.inventory[id]||0)-reserved),source:'物品库存'})}
  for(const [name,count] of Object.entries(s.specialties||{})){
   const local=typeof localSpecialties==='undefined'?null:localSpecialties.find(x=>x.name===name);
   out.push({key:'specialty:'+name,name,img:local?.img||'shop-feast',taste:local?.taste,tags:local?[]:specialtyTags(name),count,source:'旅行特产'});
  }
  return out;
 }
 function gain(s,amount,now=Date.now()){const f=s.companions,v=f.visit,r=f.records[v.id],before=Math.min(100,v.points||0);v.points=Math.min(100,before+amount);const earned=v.points-before;if(r.bondDay!==day(now)){r.bondDay=day(now);r.bondToday=0}const bondGain=Math.max(0,Math.min(earned,100-r.bondToday,10000-r.affection));r.affection+=bondGain;r.bondToday+=bondGain;if(v.points>=25&&r.lastGiftDay!==day(v.startedAt))v.giftReady=true;return {amount:earned,bondGain}}
 function bond(s,id,now=Date.now()){const r=s.companions.records[id],percent=Math.min(100,r.affection/100),today=r.bondDay===day(now)?r.bondToday:0;return {percent,text:percent.toFixed(2).replace(/\.?0+$/,''),today,remaining:Math.max(0,Math.min(100-today,10000-r.affection))/100,stage:percent>=100?'知己':percent>=60?'亲密':percent>=30?'信赖':percent>=10?'熟悉':'初识'}}

 function feed(s,key,now=Date.now()){
  if(s.mode==='travel')return {ok:false,reason:'away'};
  const f=s.companions,v=f?.visit;if(!v||v.expired||now>=v.endsAt)return {ok:false,reason:'ended'};
  if(v.fed>=3)return {ok:false,reason:'full'};
  const food=foods(s).find(x=>x.key===key);if(!food||food.count<1)return {ok:false,reason:'empty'};
  const p=profiles[v.id];if(food.tags.some(t=>p.reject.includes(t)))return {ok:false,reason:'refused',food};
  const index=key.indexOf(':'),kind=key.slice(0,index),id=key.slice(index+1);
  if(kind==='pantry')f.pantry[id]--;else if(kind==='item')s.inventory[id]--;else s.specialties[id]--;
  const amount=food.taste?.[v.id]??(food.tags.some(t=>p.tags.includes(t))?30:15),liked=amount>=25;v.fed++;const gained=gain(s,amount,now);
  const record=f.records[v.id],before=rank(record);
  const taste=amount>=30?['超爱',25]:amount>=15?['喜欢',15]:amount>=8?['一般',8]:['无感',3];
  const titleGain=kind==='specialty'?Math.min(taste[1],650-(record.titleXp||0)):0;
  record.titleXp=(record.titleXp||0)+titleGain;grantKeepsake(s,v.id,now);
  return {ok:true,liked,...gained,food,titleGain,taste:taste[0],promoted:rank(record)>before};
 }
 function talk(s,topic,now=Date.now()){
  if(s.mode==='travel')return false;
  const v=s.companions?.visit;if(!v||v.expired||now>=v.endsAt||!['origin','favorite'].includes(topic))return false;
  if(v.topics.includes(topic))return false;v.topics.push(topic);gain(s,5,now);return true;
 }
 function claim(s,now=Date.now()){
  if(s.mode==='travel')return false;
  const f=s.companions,v=f?.visit;if(!v||!v.giftReady||v.giftClaimed||f.records[v.id].lastGiftDay===day(v.startedAt))return false;
  v.giftClaimed=true;f.records[v.id].lastGiftDay=day(v.startedAt);v.bambooGift=giftBamboo(f.records[v.id]);v.ticketGift=5+(Math.random()*100<ranks[rank(f.records[v.id])].ticket?1:0);s.leaves+=v.bambooGift;s.tickets+=v.ticketGift;return true;
 }
 function leave(s,now=Date.now()){
  if(s.mode==='travel')return false;
  const f=s.companions,v=f?.visit;if(!v||v.giftReady&&!v.giftClaimed)return false;
  f.lastDeparture={id:v.id,at:now};f.visit=null;f.nextAt=now+cooldownMs;return true;
 }
 function invite(s,id,now=Date.now()){
  if(s.mode==='travel')return false;
  const f=s.companions;if(!profiles[id]||f.visit)return false;
  // The daily gift guard allows revisits without creating unlimited rewards.
  return arrive(s,id,now);
 }
 function buySnack(s,id,qty){const price=snackPrices[id];if(typeof price!=='number'||!Number.isInteger(qty)||qty<1||qty>99)return false;const total=price*qty;if(!Number.isFinite(s.leaves)||s.leaves<total)return false;const f=init(s),before=f.pantry[id]||0;s.leaves-=total;f.pantry[id]=before+qty;return {id:'pantry:'+id,qty,before,after:before+qty,total}}
 return {ranks,rank,giftBamboo,reserveTicket,profiles,snacks,snackPrices,order,init,bond,buySnack,tick,syncTravel,foods,feed,talk,claim,leave,invite,day};
})();
let friendView='welcome',friendFoodTab='pantry',friendMessage='',friendReaction='',friendLastFood='';
function ensureFriends(){if(GameFriends.tick(state))save();return state.companions}
function friendPortrait(id,cls='',live=false){const p=GameFriends.profiles[id];return `<img class="${cls}" src="${assetUrl(live?companionArt(id):`friend-${id}`)}" alt="${p.name}，${p.animal}">`}
function friendVisit(){return ensureFriends().visit}
function friendAffection(id){return ensureFriends().records[id].affection}
function companionSceneMarkup(){const v=friendVisit();return state.mode!=='travel'&&v?`<button class="yard-visitor ${GameFriends.rank(state.companions.records[v.id])?'visitor-table':'visitor-gate'} ${v.idle==='nap'?'visitor-nap':''}" onclick="openFriendView('talk')" aria-label="${GameFriends.profiles[v.id].name}来访，点击聊一聊">${friendPortrait(v.id,'',true)}<span>${GameFriends.profiles[v.id].name}${v.idle==='tea'?'喝茶中':v.idle==='nap'?'打盹中':'来啦'}<i></i></span></button>`:''}
function openFriendView(view){friendView=view;friendMessage='';friendReaction='';openPanel('friend')}
function friendPanel(){
 const f=ensureFriends(),v=f.visit;
 const tabs=`<div class="friend-tabs"><button class="${friendView!=='book'?'active':''}" onclick="openFriendView('welcome')">来访伙伴</button><button class="${friendView==='book'?'active':''}" onclick="openFriendView('book')">伙伴手册</button></div>`;
 if(friendView==='book')return tabs+friendBook();
 if(state.mode==='travel')return tabs+`<div class="friend-empty"><h4>滚滚正在旅行，伙伴暂不来访</h4><p>等它归家后，再和朋友们一起坐坐。</p><p class="muted">伙伴好感与尚未领取的回礼会保留。</p>${button('看看伙伴手册',"openFriendView('book')")}</div>`;
 if(!v){const last=f.lastDeparture,p=last&&GameFriends.profiles[last.id];return tabs+`<div class="friend-empty">${last?friendPortrait(last.id,'friend-farewell-art'):''}<h4>${p?p.name+'离开了小院':'竹门轻掩，等一位朋友'}</h4><p>${p?p.bye:'溪水潺潺，下次相见就在不远处。'}</p><p class="muted">${f.nextAt>Date.now()?'约 '+Math.max(1,Math.ceil((f.nextAt-Date.now())/60000))+' 分钟后会有伙伴路过':'伙伴正在来小院的路上'}</p>${button('看看伙伴手册',"openFriendView('book')")}</div>`}
 const p=GameFriends.profiles[v.id],aff=Math.min(100,v.points||0),bond=GameFriends.bond(state,v.id);
 if(friendView==='feed'&&v.fed>=3){friendView='talk';friendMessage='已经吃饱啦，我们聊一会儿吧。'}
 let speech=friendMessage||(v.helped?'成熟的竹笋，我已经帮你收好啦。':p.hello);
 if(v.expired)speech='该出发了，把这份小心意收下吧。';
 const tier=GameFriends.rank(f.records[v.id]),title=GameFriends.ranks[tier];
 const hero=`<div class="friend-hero ${friendReaction==='love'?'friend-loved':''}" style="--friend-scene:url('${assetUrl(`yard-${weatherInfo().night?'night':'day'}-v2`)}')"><div class="friend-nameplate"><b>${p.name}</b><small>${p.animal} · Lv.${tier+1} ${title.name}</small></div><div class="friend-speech" role="status">${speech}</div><button class="friend-feed-target" aria-label="和${p.name}聊一聊，也可拖入食物投喂" onclick="friendCharacterClick()">${friendPortrait(v.id,'',true)}${friendReaction==='love'?'<span class="friend-hearts" aria-hidden="true">♥　♥　♥</span>':''}</button><div class="friend-affection"><span>本次满意度</span><progress aria-label="${p.name}本次满意度" value="${aff}" max="100"></progress><b>${aff} / 100</b></div><div class="friend-bond-summary">长期羁绊 ${bond.text}% · ${bond.stage}<small>${bond.remaining>0?'今日还可增加 '+bond.remaining.toFixed(2).replace(/\.?0+$/,'')+'%':'今日羁绊已达上限，可继续陪伴'}</small></div></div>`;
 let body='';
 if(friendView==='feed'&&!v.expired)body=friendFoodPicker(v);
 else if(friendView==='talk'&&!v.expired)body=`<div class="friend-conversation"><h4>和${p.name}聊一聊</h4><button onclick="friendTalk('origin')"><span>你从哪里来？</span><small>${v.topics.includes('origin')?'已聊过':'本次满意度 ＋5'} ›</small></button><button onclick="friendTalk('favorite')"><span>喜欢吃什么？</span><small>${v.topics.includes('favorite')?'已聊过':'本次满意度 ＋5'} ›</small></button><button onclick="friendSetView('welcome')">下次再聊　›</button></div>`;
 else if(friendView==='gift'||v.expired)body=friendGiftCard(v);
 else body=`<div class="friend-welcome"><h4>${p.name}来串门啦！</h4><p>${p.trait} · 喜欢${p.likes}</p>${friendReaction?`<p class="friend-reaction">${friendReaction==='love'||friendReaction==='accepted'?friendMessage:friendReaction==='refused'?'这份不太合口味，食物已退回。':friendReaction==='empty'?'还没收集到这份食物。':''}</p>`:''}<p>点点伙伴聊一聊，或招待它喜欢的食物。</p></div>`;
 const gift=v.giftReady&&!v.giftClaimed?`<button class="friend-gift-prompt" onclick="friendSetView('gift')">一份回礼等你收下　›</button>`:'';
 const actions=v.expired?'':`<div class="friend-quick-actions" aria-label="伙伴互动"><button aria-pressed="${friendView==='feed'}" onclick="friendSetView('feed')" ${v.fed>=3?'disabled':''}>${v.fed>=3?'已经吃饱啦':'招待一下'}</button><button aria-pressed="${friendView==='talk'}" onclick="friendSetView('talk')">聊一聊</button></div>`;
 return tabs+hero+(tier>0&&!v.expired?'<div class="friend-table-actions"><button onclick="friendTableIdle(1)">一起喝茶</button><button onclick="friendTableIdle(0)">在桌旁打盹</button></div>':'')+actions+body+(friendView!=='gift'&&!v.expired?gift:'')+`<div class="friend-footer">${friendView!=='welcome'&&!v.expired?`<button onclick="friendSetView('welcome')">返回陪伴</button>`:''}<button onclick="friendFarewell()">${v.giftReady&&!v.giftClaimed?'收下回礼并告别':'和'+p.name+'告别'}</button></div><p class="friend-rule-note">满意度100折算羁绊1% · 每位伙伴每天最多增加1%羁绊、领取1次回礼</p>`;
}
function friendTableIdle(tea){const v=friendVisit();if(!v||v.expired||GameFriends.rank(state.companions.records[v.id])<1)return;v.idle=tea?'tea':'nap';save();closePanel(true);if(scene!=='yard')changeScene('yard');else render();toast(GameFriends.profiles[v.id].name+(tea?'在石桌旁喝茶':'在石桌旁打起了盹'))}
function useFriendTicket(id){if(GameFriends.reserveTicket(state,id)){save();renderPanel();toast('下一位来访伙伴：'+GameFriends.profiles[id].name)}}
function friendFoodPicker(v){
 const foods=GameFriends.foods(state).filter(x=>friendFoodTab==='pantry'?x.key.startsWith('pantry:'):friendFoodTab==='item'?x.key.startsWith('item:'):x.key.startsWith('specialty:'));
 return `<div class="friend-food-picker"><h4>拿一份心意，招待${GameFriends.profiles[v.id].name}</h4><p>点击食物，或拖到伙伴身边 · 本次 ${v.fed}/3</p><div class="friend-food-tabs">${[['pantry','待客食盒'],['item','库存便当'],['specialty','旅行特产']].map(([id,label])=>`<button class="${friendFoodTab===id?'active':''}" onclick="friendFoodTab='${id}';renderPanel()">${label}</button>`).join('')}</div><div class="friend-food-grid">${foods.map(food=>`<button class="friend-food ${food.count<1?'unavailable':''}" data-friend-food="${encodeURIComponent(food.key)}" aria-label="${food.name}，库存${food.count}" onclick="friendFeed('${encodeURIComponent(food.key)}')"><img src="${assetUrl(food.img)}" alt=""><b>${food.name}</b><span>× ${food.count}</span></button>`).join('')||'<p class="friend-no-food">还没有收集到旅行特产。出门旅行，带回一份地方风味吧。</p>'}</div>${friendMessage?`<div class="friend-inline-feedback" role="status">${friendReaction==='refused'?'食物已退回 · 不扣库存':friendReaction==='empty'?'库存不足 · 未扣物品':friendReaction==='love'||friendReaction==='accepted'?friendMessage:friendMessage}</div>`:''}${friendFoodTab==='pantry'?button('去杂货铺补充待客食盒',"openPantryShop()",true):''}<small class="friend-pantry-note">待客食盒可在杂货铺补充；便当仅使用未装入行囊和备用栏的库存。</small></div>`;
}
function friendGiftCard(v){return `<div class="friend-gift-card"><h4>${v.giftClaimed?'回礼已收下':GameFriends.profiles[v.id].name+'的回礼'}</h4><div class="friend-gift-items"><span><img src="${assetUrl('shop-currency')}" decoding="async" alt="竹笋">竹笋 ＋${v.bambooGift??GameFriends.giftBamboo(state.companions.records[v.id])}</span><span><img src="${assetUrl('friend-ticket')}" decoding="async" alt="竹签券">竹签券 ＋${v.ticketGift??5}</span></div><p>${v.giftClaimed?'已加入你的库存，谢谢这份陪伴。':v.giftReady?'谢谢你的招待，这份心意请收下。':'再招待一点喜欢的食物，或陪它聊聊天。'}</p>${button(v.giftClaimed?'已领取':'收下回礼','claimFriendGift()',false,!v.giftReady||v.giftClaimed)}</div>`}
function friendTitleMarkup(id,r){
 const levels=GameFriends.ranks,i=GameFriends.rank(r),a=levels[i],next=levels[i+1];
 return `<div class="friend-title"><strong>Lv.${i+1} · ${a.name}</strong><small>${r.titleXp} / ${next?.xp||650} 经验</small><progress max="${next?next.xp-a.xp:1}" value="${next?r.titleXp-a.xp:1}"></progress><small>${next?'距「'+next.name+'」还差 '+(next.xp-r.titleXp)+' 经验':'已达最高称号'}</small><details><summary>称号特权</summary><p>竹笋回礼 +${a.bamboo}% · 额外竹签券概率 +${a.ticket}%</p>${levels.slice(0,i+1).map(l=>`<p>${l.perk}</p>`).join('')}${next?`<p>下级解锁 · ${next.perk}</p>`:''}</details>${r.visitTicket?`<button onclick="useFriendTicket('${id}')" ${state.companions.ticketGuest?'disabled':''}>使用专属车票 · 预约下次来访</button>`:state.companions.ticketGuest===id?'已预约下次来访':''}</div>`;
}
function friendBook(){const f=ensureFriends();return `<div class="friend-book-grid">${GameFriends.order.map(id=>{const p=GameFriends.profiles[id],r=f.records[id],current=f.visit?.id===id,bond=GameFriends.bond(state,id);return `<article class="friend-book-card ${r.visits?'met':''}">${friendPortrait(id)}<h4>${p.name}<small>${p.animal}</small></h4>${friendTitleMarkup(id,r)}<div class="friend-book-affection">♥ <progress aria-label="${p.name}长期羁绊" max="100" value="${bond.percent}"></progress><b>${bond.text}%</b></div><p class="friend-bond-stage">${bond.stage} · 长期羁绊</p><span>喜欢${p.likes}</span><small>${r.visits?'到访 '+r.visits+' 次':'初识 · 等待第一次相逢'}</small><button ${state.mode==='travel'||f.visit&&!current?'disabled':''} onclick="${current?"friendSetView('welcome')":`inviteCompanion('${id}')`}">${state.mode==='travel'?'旅行中 · 归家后相约':current?'正在小院做客':f.visit?'下次相约':'请来坐坐'}</button></article>`}).join('')}</div><p class="friend-rule-note">本次满意度按比例累积长期羁绊 · 每位伙伴每日最多＋1%<br>喜欢的食物＋30满意度，普通食物＋15，聊天每话题＋5<br>投喂旅行特产可得称号经验：超爱＋25，喜欢＋15，一般＋8，无感＋3</p>`}
function friendSetView(view){const v=friendVisit();friendView=v?.expired?'gift':view==='feed'&&v?.fed>=3?'talk':view;friendMessage=view==='feed'&&v?.fed>=3?'已经吃饱啦，我们聊一会儿吧。':'';friendReaction='';renderPanel();$('panel-body').scrollTop=0}
function friendCharacterClick(){if(Date.now()<friendDragBlockedUntil)return;friendSetView('talk')}
function friendFeed(encoded){
 if(Date.now()<friendDragBlockedUntil)return;
 const key=decodeURIComponent(encoded),v=friendVisit();if(!v)return;if(v.fed>=3){friendSetView('talk');friendMessage='已经吃饱啦，我们聊一会儿吧。';renderPanel();return}const p=GameFriends.profiles[v.id],result=GameFriends.feed(state,key);
 friendView='feed';friendLastFood=result.food?.name||'';
 if(result.ok){friendReaction=result.liked?'love':'accepted';friendMessage=result.liked?p.thanks:'谢谢你记得招待我，一起坐坐也很好。';if(result.titleGain)friendMessage+=`（${result.taste} · 称号经验＋${result.titleGain}）`;if(v.fed>=3)friendView='talk';save();render();renderPanel();playFoodMotion(v.id,result);if(v.fed>=3)$('panel-body').scrollTop=0;toast(result.promoted?'晋升「'+GameFriends.ranks[GameFriends.rank(state.companions.records[v.id])].name+'」'+(state.companions.records[v.id].titleXp===650?' · 专属明信片和车票已收下':''):result.titleGain?result.taste+' · 称号经验 ＋'+result.titleGain:`${result.food.name} −1 · 满意度 ＋${result.amount} · ${result.bondGain?'羁绊 ＋'+(result.bondGain/100).toFixed(2)+'%':'羁绊今日已达上限'}`)}
 else{friendReaction=result.reason;friendMessage=result.reason==='empty'?'还没收集到这份食物，换一份招待吧。':result.reason==='refused'?`谢谢，我更想尝尝${p.likes}。`:result.reason==='full'?'已经吃饱啦，我们聊一会儿吧。':'今天先到这里，下次再一起吃。';renderPanel()}
}
function friendTalk(topic){const v=friendVisit();if(!v)return;friendView='talk';const gained=GameFriends.talk(state,topic);friendMessage=GameFriends.profiles[v.id][topic];friendReaction='';save();renderPanel();if(gained)toast('聊得很开心 · 满意度 '+Math.min(100,v.points)+'/100 · 羁绊 '+GameFriends.bond(state,v.id).text+'%')}
function claimFriendGift(){if(!GameFriends.claim(state))return;save();render();renderPanel();const v=state.companions.visit;toast(`回礼已收下 · 竹笋 ＋${v.bambooGift} · 竹签券 ＋${v.ticketGift}`)}
function friendFarewell(){const v=friendVisit();if(!v)return;const name=GameFriends.profiles[v.id].name;if(v.giftReady&&!v.giftClaimed)GameFriends.claim(state);if(!GameFriends.leave(state))return;friendView='welcome';friendMessage='';friendReaction='';save();render();renderPanel();toast(name+'离开了小院，下次见！')}
function inviteCompanion(id){if(!GameFriends.invite(state,id))return;friendView='welcome';friendMessage='';friendReaction='';save();render();renderPanel()}
// Capture a drag on a food card; a click remains an equivalent accessible action.
let friendDrag=null,friendDragBlockedUntil=0;
document.addEventListener('pointerdown',e=>{const card=e.target.closest?.('[data-friend-food]');if(!card||e.button!==0||panel!=='friend')return;friendDrag={id:e.pointerId,key:card.dataset.friendFood,x:e.clientX,y:e.clientY,card,moving:false};card.setPointerCapture?.(e.pointerId)});
document.addEventListener('pointermove',e=>{const d=friendDrag;if(!d||d.id!==e.pointerId)return;if(Math.hypot(e.clientX-d.x,e.clientY-d.y)<12&&!d.moving)return;d.moving=true;d.card.classList.add('dragging');if(!d.ghost){d.ghost=document.createElement('div');d.ghost.className='friend-drag-ghost';d.ghost.setAttribute('aria-hidden','true');d.ghost.innerHTML=d.card.innerHTML;document.body.appendChild(d.ghost)}d.ghost.style.left=(e.clientX-38)+'px';d.ghost.style.top=(e.clientY-48)+'px';$('panel-body').querySelector('.friend-feed-target')?.classList.add('drop-ready')});
function finishFriendDrag(e){const d=friendDrag;if(!d||d.id!==e.pointerId)return;friendDrag=null;d.card.classList.remove('dragging');d.card.style.removeProperty('--drag-x');d.card.style.removeProperty('--drag-y');$('panel-body').querySelector('.friend-feed-target')?.classList.remove('drop-ready');d.ghost?.remove();if(d.moving){if(e.type!=='pointercancel'&&document.elementFromPoint(e.clientX,e.clientY)?.closest('.friend-feed-target')){friendDragBlockedUntil=0;friendFeed(d.key)}friendDragBlockedUntil=Date.now()+600}}
document.addEventListener('pointerup',finishFriendDrag);document.addEventListener('pointercancel',finishFriendDrag);
setInterval(()=>{if(typeof state==='undefined'||document.hidden)return;if(GameFriends.tick(state)){save();render();if(panel==='friend')renderPanel()}},10000);
;
// A draw commits the cost, reward and receipt together before any animation.
const GameLottery=(()=>{
 const cost=5;
 const pool=[{key:'charm',weight:1,grade:'珍稀',kind:'一次性护身符'},{key:'boatTicket',weight:12,grade:'稀有',kind:'定向旅行'},{key:'camelBells',weight:12,grade:'稀有',kind:'定向旅行'},{key:'lantern',weight:10,grade:'稀有',kind:'耐用道具'},{key:'lotus',weight:65,grade:'常见',kind:'便当'}];
 function init(s){s.lottery??={version:1,records:[],pendingId:null};s.lottery.records??=[];return s.lottery}
 function pending(s){const l=init(s);return l.records.find(r=>r.id===l.pendingId&&!r.acknowledged)||null}
 function draw(s,now=Date.now(),rng=Math.random){
  const l=init(s),old=pending(s);if(old)return {ok:false,reason:'pending',record:old};
  if(!Number.isFinite(s.tickets)||s.tickets<cost)return {ok:false,reason:'insufficient',short:Math.max(0,cost-(s.tickets||0))};
  let n=Math.max(0,Math.min(.999999999,rng()))*100;const prize=pool.find(p=>(n-=p.weight)<0)||pool.at(-1),key=prize.key,it=items[key];
  const before=s.inventory[key]||0,oldCopies=syncGearCopies(s,key).map(x=>x.durability);
  const sequence=(s.draws||0)+1,id=`draw-${sequence}-${now}`;
  const record={id,key,sequence,createdAt:now,revealAt:now+2500,before,after:before+1,grade:prize.grade,oldCopies,fullDurability:Number.isFinite(it.durability)&&it.durability>1?it.durability:null,acknowledged:false};
  s.tickets-=cost;s.draws=sequence;addInventoryReward(s,key,id);l.records.unshift(record);l.records=l.records.slice(0,50);l.pendingId=id;return {ok:true,record};
 }
 function acknowledge(s,id){const l=init(s),r=pending(s);if(!r||r.id!==id)return false;r.acknowledged=true;l.pendingId=null;return true}
 return {cost,pool,init,pending,draw,acknowledge};
})();
let lotteryView='',lotteryDetailKey='',lotteryTimer=0,lotteryLastReceipt=null;
function prepareLotteryPanel(){
 const previous=state.lottery;GameLottery.init(state);if(!previous)save();
 const r=GameLottery.pending(state);lotteryView=r?(Date.now()<r.revealAt?'drawing':'result'):'';
 if(lotteryView==='drawing')scheduleLotteryReveal(r);
}
function lotteryImage(key,cls=''){return `<img class="${cls}" src="${assetUrl(items[key].img)}" alt="${items[key].name}">`}
function lotteryPanel(){
 const pending=GameLottery.pending(state),r=pending||lotteryLastReceipt||state.lottery.records[0],rolling=lotteryView==='drawing',short=Math.max(0,GameLottery.cost-(state.tickets||0));
 const recent=r?.acknowledged?`<div class="lottery-receipt"><b>✓ 礼物已收好</b><div>${lotteryImage(r.key)}<p>${items[r.key].name} ×1<small>库存：${r.before} → ${r.after}</small></p><button onclick="openItemInfo('${r.key}')">查看物品 ›</button></div></div>`:'';
 return `<div class="lottery-shell"><div class="lottery-topbar"><span><img src="${assetUrl('shop-currency')}" decoding="async" alt="竹笋">${state.leaves.toLocaleString()}</span><span><img src="${assetUrl('golden-shoot-v2')}" decoding="async" alt="四叶金竹笋">${state.inventory.charm||0}</span><button class="lottery-exit modal-close" onclick="closePanel(true)" aria-label="返回小院">×</button></div><h3 class="lottery-title">竹签摇奖</h3><div class="lottery-wallet"><img src="${assetUrl('friend-ticket')}" decoding="async" alt="竹签券"><span>竹签券</span><b>${state.tickets||0}</b></div><div class="lottery-stage ${rolling?'rolling':''}"><div class="lottery-aura" aria-hidden="true"></div><div class="lottery-motes" aria-hidden="true">${Array.from({length:8},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div><button class="lottery-jar-button" onclick="drawLottery()" aria-label="摇一支竹签，消耗5张竹签券" ${rolling?'disabled':''}><img class="lottery-jar" src="${assetUrl('lottery-jar')}" decoding="async" alt="熊猫竹签筒">${rolling?'<span class="lottery-flying-stick" aria-hidden="true">吉</span>':''}</button><p class="lottery-hanging-scroll">行万里路<br>总有好礼相遇</p></div><div class="lottery-preview"><div class="lottery-preview-head"><b>奖池预览</b><button onclick="showLotteryLayer('pool')" ${rolling?'disabled':''}>查看奖池 ›</button></div><div class="lottery-preview-items">${['lantern','boatTicket','lotus'].map(key=>`<button onclick="showLotteryDetail('${key}')" ${rolling?'disabled':''}>${lotteryImage(key)}<span>${items[key].name}</span></button>`).join('')}</div><small>每次消耗 5 张竹签券 · 奖励直接入库</small></div><button class="lottery-draw ${short?'no-tickets':''}" onclick="drawLottery()" ${rolling?'disabled':''}>${rolling?'摇签中…':pending?'查看本次礼物':short?'竹签券不足':'摇一次'}</button>${recent||`<p class="lottery-invitation">摇一支竹签，<br>遇见旅途的小惊喜。</p>`}<div class="lottery-bottom-links"><button onclick="showLotteryLayer('records')" ${rolling?'disabled':''}>摇奖记录</button><button onclick="closePanel(true);changeScene('yard')">返回小院</button></div></div>${['','drawing'].includes(lotteryView)?'':lotteryLayer()}`;
}
function lotterySheet(title,body,cls=''){return `<div class="lottery-overlay"><section class="lottery-sheet ${cls}" role="dialog" aria-label="${title}"><button class="lottery-sheet-close modal-close" aria-label="关闭${title}" onclick="closeLotteryLayer()">×</button><h4>${title}</h4>${body}</section></div>`}
function lotteryLayer(){
 if(lotteryView==='pool')return lotterySheet('奖池一览',`<div class="lottery-pool">${GameLottery.pool.map(p=>`<button onclick="showLotteryDetail('${p.key}')">${lotteryImage(p.key)}<b>${items[p.key].name}</b><small>${p.kind} · ${p.weight}%</small></button>`).join('')}<div class="lottery-pool-leaf" aria-hidden="true">竹影常伴<br>好礼相逢</div></div><p class="lottery-fineprint">每次独立抽取1件，当前奖池概率合计100%。</p><button class="lottery-green" onclick="closeLotteryLayer()">返回摇奖</button>`);
 if(lotteryView==='detail'){
  const it=items[lotteryDetailKey],entry=GameLottery.pool.find(p=>p.key===lotteryDetailKey);if(!it||!entry)return '';
  return lotterySheet(it.name,`${lotteryImage(lotteryDetailKey,'lottery-detail-art')}<span class="lottery-grade">${entry.grade} · ${entry.weight}%</span>${lotteryPrizeFacts(lotteryDetailKey)}<p class="lottery-description">${it.desc}</p><button class="lottery-red" onclick="showLotteryLayer('pool')">知道啦</button><p class="lottery-fineprint">奖品用途说明</p>`);
 }
 if(lotteryView==='insufficient')return lotterySheet('竹签券不足',`<div class="lottery-shortage"><img src="${assetUrl('friend-ticket')}" decoding="async" alt="竹签券"><p>还差 <b>${Math.max(0,GameLottery.cost-(state.tickets||0))}</b> 张竹签券</p></div><img class="lottery-shortage-panda" src="${assetUrl('friend-aguo')}" decoding="async" alt="等待来访的伙伴"><p class="lottery-description">招待来访伙伴，有机会收到竹签券回礼。</p><button class="lottery-green" onclick="lotteryVisitFriends()">去小院看看</button><button class="lottery-paper" onclick="closeLotteryLayer()">稍后再来</button>`);
 if(lotteryView==='records')return lotterySheet('摇奖记录',`<div class="lottery-history">${state.lottery.records.map(r=>`<article>${lotteryImage(r.key)}<div><b>${items[r.key].name} ×1</b><small>${lotteryTime(r.createdAt)}</small></div><span>已入库</span></article>`).join('')||'<div class="lottery-empty">还没有摇奖记录。<br>第一份旅途惊喜，正等你来相遇。</div>'}</div><p class="lottery-fineprint">最近50次记录 · 已入库的礼物不会重复发放</p><button class="lottery-red" onclick="closeLotteryLayer()">返回摇奖</button>`);
 if(lotteryView==='result'){
  const r=GameLottery.pending(state);if(!r)return '';const it=items[r.key],duplicate=r.before>0;
  return lotterySheet(duplicate?'又遇见一份好礼':'获得 · '+it.name,`<span class="lottery-grade ${r.key==='charm'?'gold':''}">${r.grade}</span>${lotteryImage(r.key,'lottery-result-art')}<h5>${it.name} ×1</h5>${r.fullDurability?`<p class="lottery-new-copy">新获得：耐久 <b>${r.fullDurability} / ${r.fullDurability}</b></p>${r.oldCopies.length?`<p class="lottery-original-copy">原有${it.name}：${r.oldCopies.map(v=>v+' / '+r.fullDurability).join('、')}<br><small>每件装备分别保留耐久。</small></p>`:''}`:''}<p class="lottery-stock-change">库存：${r.before} → <b>${r.after}</b></p><p class="lottery-description">已加入${it.type===1?'护身符':it.type===0?'便当':'道具'}库存</p><button class="lottery-green" onclick="acknowledgeLotteryGift()">收下礼物</button>`, 'lottery-result');
 }
 return '';
}
function lotteryPrizeFacts(key){const it=items[key];return `<div class="item-rule-facts"><span>稀有度加成 +${Math.round(it.rarity*100)}%</span>${it.hours?`<span>饱腹 ${it.hours[0]}–${it.hours[1]} 小时</span><span>${Object.keys(it.directions).join(' / ')||'全方向'}</span>`:`<span>${it.durability===1?'一次性物品':'新获得耐久：'+it.durability+' / '+it.durability}</span><span>${it.tags.join(' / ')||'地形无限制'}</span>`}</div>`}
function lotteryTime(value){return new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})}
function showLotteryLayer(view){if(lotteryView==='drawing')return;lotteryView=view;renderPanel();$('panel-body').querySelector('.lottery-sheet-close')?.focus()}
function showLotteryDetail(key){if(lotteryView==='drawing'||!GameLottery.pool.some(p=>p.key===key))return;lotteryDetailKey=key;showLotteryLayer('detail')}
function closeLotteryLayer(){lotteryView='';renderPanel();$('panel-body').querySelector('.lottery-draw')?.focus()}
function scheduleLotteryReveal(r){clearTimeout(lotteryTimer);lotteryTimer=setTimeout(()=>{if(panel!=='lottery')return;const current=GameLottery.pending(state);if(current?.id!==r.id)return;lotteryView='result';if(r.key==='charm')globalThis.GameSfx?.play('ui04');renderPanel();$('panel-body').querySelector('.lottery-green')?.focus()},Math.max(0,r.revealAt-Date.now()))}
function drawLottery(){
 if(panel!=='lottery'||(lotteryView&&lotteryView!=='result'))return;
 const pending=GameLottery.pending(state);if(pending){lotteryView='result';renderPanel();return}
 const out=GameLottery.draw(state);if(!out.ok){if(out.reason==='insufficient')showLotteryLayer('insufficient');return}
 globalThis.GameSfx?.play('ui07');
 if(!state.motion||matchMedia('(prefers-reduced-motion: reduce)').matches)out.record.revealAt=Date.now();save();lotteryLastReceipt=null;lotteryView=Date.now()<out.record.revealAt?'drawing':'result';render();renderPanel();if(lotteryView==='drawing')scheduleLotteryReveal(out.record);else if(out.record.key==='charm')globalThis.GameSfx?.play('ui04');
}
function acknowledgeLotteryGift(){const r=GameLottery.pending(state);if(!r||!GameLottery.acknowledge(state,r.id))return;lotteryLastReceipt=r;save();lotteryView='';render();renderPanel();toast(`${items[r.key].name} ×1，礼物已收好`)}
function lotteryVisitFriends(){closePanel(true);changeScene('yard');openFriendView('welcome')}
;
// Placement baselines in 1200 x 800 postcard coordinates, keyed by Destination_ID.
const PostcardRenderer=(()=>{
 const positions=[
  [315,670,446,641,265,694],[301,686,409,653,275,662],[280,683,395,657,243,670],
  [331,689,434,661,288,660],[290,675,421,665,366,697],[288,686,365,663,445,686],
  [276,678,337,657,416,688],[314,684,415,674,248,665],[303,689,384,667,266,667],
  [338,687,408,655,270,669],[323,689,396,672,280,662],[274,682,350,672,409,689],
  [266,682,342,659,403,685],[329,685,404,663,272,657],[310,683,373,661,246,663],
  [306,676,421,666,250,685],[284,688,374,663,450,678],[318,681,394,659,255,673],
  [289,686,381,678,432,664],[368,685,439,670,295,664],[324,677,420,673,252,665],
  [308,682,367,654,445,681],[286,679,357,657,425,682],[316,680,403,659,255,676],
  [297,681,369,655,430,677],[310,690,382,665,447,687],[330,679,419,664,258,657],
  [309,683,385,661,439,687],[314,683,388,659,253,669],[326,684,409,663,276,664]
 ];
 const palettes={'晴空':['#81bdda','#faf0cb'],'晚霞':['#ab818f','#ffd397'],'阴雨':['#80909d','#c2cbc4'],'飘雪':['#9eaebf','#edf3f4'],'璀璨星空':['#172d51','#687997'],'晨雾':['#aaaeb2','#f4e7ce']};
 const names={aguo:'阿果',jinjin:'金金',baiyu:'白羽',fangfang:'方方'};
 function load(key){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=assetUrl(key);});}
 function actor(x,im,px,py,h){const w=h*im.width/im.height;x.drawImage(im,px-w/2,py-h,w,h);}
 function foreground(x,p,r){
  const reeds=p.region==='西北'||['荒漠','草原','高原'].includes(p.terrain),lotus=p.terrain==='水乡'&&p.month>=4&&p.month<=8;
  const plum=!reeds&&!lotus&&(p.month===11||p.month<2);
  x.save();x.filter='blur(1.5px)';x.globalAlpha=.83;
  for(let i=0;i<12;i++){
   const bx=25+r()*125,by=745,dx=-5+r()*100,dy=by-45-r()*145;
   x.strokeStyle=reeds?'#867040':plum?'#66493e':'#526c48';x.lineWidth=plum?4:2;
   x.beginPath();x.moveTo(bx,by);x.quadraticCurveTo(bx-20,dy+28,dx,dy);x.stroke();
   x.fillStyle=reeds?'#b59a63':plum?'#d999a1':p.month>7?'#988145':'#54805c';
   for(let k=0;k<(plum?5:2);k++){
    x.beginPath();x.ellipse(dx+k*3,dy+k*3,lotus?23:plum?5:4,lotus?9:plum?4:15,-.7,0,2*Math.PI);x.fill();
   }
  }x.restore();
 }
 function light(x,p,r,px,py){
  const sky=p.sky;x.save();x.globalCompositeOperation='multiply';
  x.fillStyle=({'璀璨星空':'#68799c','阴雨':'#a2b2ba','晚霞':'#f4c6a0','晨雾':'#e4e3dc','飘雪':'#d0dce2'})[sky]||'#fff3dc';x.fillRect(0,0,1200,800);
  x.globalCompositeOperation='screen';
  if(sky==='阴雨'||sky==='飘雪'||sky==='璀璨星空'){
   const snow=sky==='飘雪',rain=sky==='阴雨';
   for(let i=0;i<(rain?150:100);i++){const a=r()*1200,b=r()*(sky==='璀璨星空'?150:790);x.fillStyle=x.strokeStyle='rgba(254,251,230,'+(.15+r()*.62)+')';x.beginPath();if(rain){x.moveTo(a,b);x.lineTo(a-4,b+15);x.stroke();}else{x.arc(a,b,1+r()*(snow?4:1.7),0,Math.PI*2);x.fill();}}
  }else{
   const g=x.createLinearGradient(120,30,850,650);g.addColorStop(0,sky==='晨雾'?'#f1e9d389':'#fff4bd55');g.addColorStop(1,'transparent');x.fillStyle=g;x.fillRect(0,0,1200,750);
  }
  if(p.action===6||p.lantern){const g=x.createRadialGradient(px+45,py-65,0,px+45,py-65,145);g.addColorStop(0,'#ffad547f');g.addColorStop(1,'transparent');x.fillStyle=g;x.fillRect(px-120,py-215,330,295);}
  x.restore();
 }
 async function compose(c){
  const p=c.postcard,[land,panda,friend]=await Promise.all([load('travel-landmark-'+p.destination),load('travel-action-'+p.action),p.friend?load('friend-'+p.friend):null]);
  const cv=document.createElement('canvas');cv.width=1200;cv.height=800;const x=cv.getContext('2d'),r=PostcardRules.random(p.seed);
  const g=x.createLinearGradient(0,0,0,630);const colors=palettes[p.sky];g.addColorStop(0,colors[0]);g.addColorStop(1,colors[1]);x.fillStyle=g;x.fillRect(0,0,1200,800);
  x.save();x.beginPath();x.rect(22,22,1156,714);x.clip();
  x.drawImage(land,0,land.height*.055,land.width,land.height*.87,22,22,1156,714);
  const coords=positions[p.destination-3001],px=coords[p.anchor*2],py=coords[p.anchor*2+1];
  if(friend)actor(x,friend,px+175,py-5,178);
  actor(x,panda,px,py,p.action===6?240:218);
  foreground(x,p,r);light(x,p,r,px,py);x.restore();
  x.fillStyle='#f8f0dc';x.fillRect(0,0,1200,22);x.fillRect(0,22,22,714);x.fillRect(1178,22,22,714);x.fillRect(0,736,1200,64);
  x.fillStyle='#97754220';for(let i=0;i<1500;i++){const a=r()*1200,b=r()*800;if(a<22||a>1178||b<22||b>736)x.fillRect(a,b,2,1);}
  x.fillStyle='#554634';x.font='26px cursive, serif';x.fillText(c.date+'  ·  滚滚手记',40,779);
  x.textAlign='right';x.font='22px serif';x.fillText(p.actionName,1154,778);
  x.save();x.translate(1057,96);x.rotate(-.11);x.fillStyle='#fff5dfdf';x.beginPath();x.ellipse(0,0,101,47,0,0,Math.PI*2);x.fill();
  x.strokeStyle=x.fillStyle='#974830';x.lineWidth=3;x.stroke();x.beginPath();x.ellipse(0,0,95,41,0,0,Math.PI*2);x.stroke();
  x.textAlign='center';x.font='bold 21px serif';x.fillText(c.name,0,-3,164);x.font='15px serif';x.fillText('山 川 邮 戳',0,24);x.restore();
  return cv;
 }
 const previews=new Map();
 function addSeal(cv){
  const x=cv.getContext('2d');x.save();x.setTransform(1,0,0,1,0,0);x.translate(614,766);x.rotate(-.09);x.strokeStyle=x.fillStyle='#ac462f';x.lineWidth=2;x.strokeRect(-36,-15,72,30);x.textAlign='center';x.font='bold 18px serif';x.fillText('山川留念',0,7,64);x.restore();
 }
 function markup(c,id=''){
  const ident=id?' id="'+id+'"':'',src=assetUrl(c.asset);
  const metadata=c.postcard?' data-composition="'+journalEscape(JSON.stringify({postcard:c.postcard,date:c.date,name:c.name}))+'" onload="PostcardRenderer.preview(this)"':'';
  return '<img'+ident+' src="'+src+'"'+metadata+' alt="'+journalEscape(c.name)+'明信片" draggable="false">';
 }
 async function preview(im){
  const key=im.dataset.composition;if(!key)return;im.removeAttribute('onload');
  try{if(!previews.has(key)){if(previews.size>=8)previews.delete(previews.keys().next().value);previews.set(key,compose(JSON.parse(key)).then(cv=>cv.toDataURL('image/jpeg',.91)));}
   im.src=await previews.get(key);
  }catch{previews.delete(key);}
 }
 async function fullArt(c){
  const im=await load(c.asset),cv=document.createElement('canvas');cv.width=1200;cv.height=800;
  cv.getContext('2d').drawImage(im,0,0,1200,800);return cv;
 }
 return {compose,fullArt,markup,preview,addSeal,names};
})();
;
// Journal ownership comes from settled trips and claimed letters, never from browsing.
const GameJournal=(()=>{
 const scenery=[{match:/西湖|江南|乌镇|漓江/,asset:'journal-westlake',caption:'水边的风很轻，替你留住一片湖光。'},{match:/敦煌|戈壁|荒漠/,asset:'journal-dunhuang',caption:'走过长长的风沙，也把远方的故事带回家。'},{match:/大理|洱海/,asset:'journal-erhai',caption:'湖畔开了小花，想和你一起慢慢看。'},{match:/古都|古城|城阙/,asset:'journal-palace',caption:'红墙映着夕阳，路过的故事都很温柔。'},{match:/黄山|雪山|高原|泰山/,asset:'journal-huangshan',caption:'云在山间走，我也在好好看风景。'}];
 const souvenirs=[{key:'opera',name:'川剧变脸小木偶',asset:'shop-opera',grade:'R',description:'一张脸谱，一段故事，把川剧的热闹带回家。',sound:true},{key:'pouch',name:'蜀绣香囊',asset:'journal-pouch',grade:'R',description:'一针一线绣下花开，把沿途的香气悄悄留下。'},{key:'cup',name:'青花瓷杯',asset:'journal-cup',grade:'R',description:'杯中盛着清茶，也盛着一段小小的旅途。'},{key:'fan',name:'竹影团扇',asset:'journal-fan',grade:'R',description:'轻轻摇一摇，仿佛又听见路旁的竹叶声。'},{key:'rabbit',name:'泥塑兔儿爷',asset:'journal-rabbit',grade:'SR',description:'一抹鲜亮的颜色，藏着手艺人的祝福。'},{key:'vase',name:'竹林小花瓶',asset:'souvenir9',grade:'R',description:'山间小铺挑选的小花瓶，装下了路边的春天。'}];
 function init(s){s.tripPostcards??=[];s.travelSouvenirs??=[];s.journal??={};const j=s.journal;j.favorites??={};j.read??={};j.stamps??={};j.display??=null;if(!Array.isArray(j.displays))j.displays=[j.display,null,null,null,null,null];j.displays=Array.from({length:6},(_,i)=>j.displays[i]||null);if(!j.migrated){for(let i=s.tripPostcards.length;i<(s.album||0);i++)s.tripPostcards.push({journalId:'legacy-card-'+i,legacy:true,destination:{name:'山间来信',region:'早前旅途',tags:[]},rarity:'N'});for(let i=s.travelSouvenirs.length;i<(s.souvenirs||0);i++)s.travelSouvenirs.push({journalId:'legacy-gift-'+i,name:'竹林小花瓶',grade:'R',catalogKey:'vase'});j.migrated=true}return j}
 function card(s,i){init(s);const t=s.tripPostcards[i];if(!t)return null;const name=t.destination?.name||t.postcardTheme||'山间来信',a=scenery.find(a=>a.match.test(name)),caption=a?.caption||'山里的风很凉，我替你听了竹海。';const story=t.storyId&&StoryPostcards.cards.find(c=>c.id===t.storyId);const postcard=!story&&(t.postcard||((t.end||t.start)&&typeof PostcardRules!=='undefined'?PostcardRules.create(t):null));return {storyId:story?.id,postcard,id:t.journalId||'card-'+(t.start??'old')+'-'+i,index:i,name:story?.name||name,grade:t.rarity||'N',asset:story?.asset||t.destination?.asset||TravelCollectionCatalog.destinations.find(d=>d.id===t.destination?.id)?.asset||a?.asset||'journal-qingcheng',caption:t.friendKeepsake?'莫逆之交 · '+t.companionName+'的专属回赠':story?story.id+' · '+name:caption,message:story?.message||t.message||caption+'\n路上遇见了许多有趣的事，也有好好吃饭。\n等我回家，再慢慢讲给你听。',location:(t.destination?.region||'远方')+' · '+name,weather:postcard?.sky||t.weatherLabel||(t.destination?.tags?.includes('雨景')?'小雨':t.destination?.tags?.includes('夜景')?'晴夜':'晴'),companion:(postcard?.friend&&PostcardRenderer.names[postcard.friend])||t.companionName||(t.companion?'旅途中结识的伙伴':'独自旅行'),date:t.end||t.claimedAt?new Date(t.end||t.claimedAt).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'}):'早前收藏'}}
 function gift(s,i){init(s);const t=s.travelSouvenirs[i];if(!t)return null;const actual=TravelCollectionCatalog.souvenirs.find(d=>d.id===t.id||d.name===t.name);if(actual)return {...actual,index:i,id:t.journalId||'gift-'+i,catalogId:actual.id,origin:t.origin||'远方旅途',count:1,sound:actual.id===5001};const origin=t.origin||s.travelLog?.find(x=>x.souvenir?.name===t.name)?.destination?.name||'早前旅途',key=t.catalogKey||(/川剧|青城/.test(t.name+origin)?'opera':/香囊|蜀绣/.test(t.name)?'pouch':/兔/.test(t.name)?'rabbit':/团扇/.test(t.name)?'fan':/瓷杯/.test(t.name)?'cup':'vase'),def=souvenirs.find(x=>x.key===key)||souvenirs.at(-1);return {...def,index:i,id:t.journalId||'gift-'+i,name:t.catalogKey?def.name:t.name,grade:t.grade||def.grade,origin,count:1}}
 function favorite(s,i){const c=card(s,i);if(!c)return false;const j=init(s);return j.favorites[c.id]=!j.favorites[c.id]}
 function stamp(s,i,now=Date.now()){const c=card(s,i);if(!c)return false;return init(s).stamps[c.id]??=now}
 function place(s,i,slot){const g=gift(s,i);if(!g)return false;const j=init(s),old=j.displays.indexOf(g.id);if(slot===undefined)slot=old>=0?old:j.displays.indexOf(null);if(!Number.isInteger(slot)||slot<0||slot>=6)return false;if(old>=0)j.displays[old]=null;j.displays[slot]=g.id;j.display=g.id;return g}
 function remove(s,i){const g=gift(s,i);if(!g)return false;const j=init(s);j.displays=j.displays.map(id=>id===g.id?null:id);if(j.display===g.id)j.display=j.displays.find(Boolean)||null;return true}
 function displayAll(s){const j=init(s);return j.displays.map((id,slot)=>{const g=id?s.travelSouvenirs.map((_,i)=>gift(s,i)).find(g=>g.id===id):null;return g?{...g,slot}:null})}

 function displayed(s){const id=init(s).display;return s.travelSouvenirs.map((_,i)=>gift(s,i)).find(g=>g.id===id)||null}
 return {init,card,gift,favorite,stamp,place,remove,displayAll,displayed,souvenirs};
})();
let journalView='list',journalKind='postcards',journalFilter='all',journalIndex=0,journalBack=false,journalExportUrl='',journalExportBlob=null,journalExportBusy=false,journalExportRun=0;
const journalEscape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const journalButton=(text,action,kind='paper')=>`<button class="journal-${kind}${text==='×'?' modal-close':''}"${text==='×'?' aria-label="关闭图片预览"':''} onclick="${action}">${text}</button>`;
function prepareJournal(type){GameJournal.init(state);save();journalView='list';journalKind=type==='souvenirs'?'souvenirs':'postcards';journalFilter='all';journalBack=false;releaseJournalExport()}
function releaseJournalExport(){journalExportRun++;journalExportBusy=false;if(journalExportUrl)URL.revokeObjectURL(journalExportUrl);journalExportUrl='';journalExportBlob=null}
function journalTab(kind){journalKind=kind;journalView='list';journalFilter='all';renderPanel()}
function journalSetFilter(filter){journalFilter=filter;renderPanel()}
function journalOpen(i){journalIndex=i;journalView='detail';journalBack=false;if(journalKind==='postcards'){const c=GameJournal.card(state,i);state.journal.read[c.id]=true;save()}renderPanel()}
function journalGoBack(){if(journalView==='envelope'){cancelEnvelope();journalView='detail'}else if(journalView==='zoom')journalView='detail';else if(journalView==='share'){releaseJournalExport();journalView='detail'}else journalView='list';renderPanel()}
function journalToggleFavorite(){const added=GameJournal.favorite(state,journalIndex);save();renderPanel();toast(added?'已收藏到手账':'已取消收藏')}
function journalFlip(){journalBack=!journalBack;renderPanel()}
function journalPlace(slot){const g=GameJournal.place(state,journalIndex,slot);if(!g){toast('柜格已满，请选择下方柜格替换摆件');return}save();closePanel(true);if(scene!=='room')changeScene('room');else render();toast('已摆放到竹屋博古架：'+g.name)}
function journalRemove(){GameJournal.remove(state,journalIndex);save();render();renderPanel();toast('已收回手账')}
const journalShelfSlots=[{x:86.8,y:47.9,label:'下层右格'},{x:66.3,y:47.5,label:'下层左格'},{x:75.7,y:47.7,label:'下层中格'},{x:66.3,y:38.3,label:'上层左格'},{x:75.7,y:38,label:'上层中格'},{x:86.8,y:37.6,label:'上层右格'}];
function journalPlacementPicker(){const list=GameJournal.displayAll(state),g=GameJournal.gift(state,journalIndex);return `<p class="journal-footnote">可同时摆放 6 件 · 点选柜格摆放或替换</p><div class="journal-shelf-picker">${journalShelfSlots.map((slot,i)=>`<button class="${list[i]?.id===g.id?'selected':''}" onclick="journalPlace(${i})"><b>${slot.label}</b><small>${journalEscape(list[i]?.name||'空位')}</small></button>`).join('')}</div>`}

// Image-space visible bounds keep padded sprites seated on the painted shelf.
const journalShelfBounds={"souvenir9":[365,256,57,0,212,256],"shop-opera":[384,384,68,67,249,250],"journal-pouch":[177,130,0,0,177,130],"journal-cup":[173,125,0,0,173,125],"journal-fan":[177,126,0,0,177,126],"journal-rabbit":[174,132,0,0,174,132],"travel-gift-5001":[384,384,20,18,345,348],"travel-gift-5002":[384,384,119,18,145,348],"travel-gift-5003":[384,384,18,52,348,279],"travel-gift-5005":[384,384,20,18,344,348],"travel-gift-5006":[384,384,22,18,340,348],"travel-gift-5007":[384,384,18,37,348,310],"travel-gift-5008":[384,384,18,53,348,278],"travel-gift-5009":[384,384,32,18,319,348],"travel-gift-5010":[384,384,18,20,348,344],"travel-gift-5011":[384,384,26,19,332,347],"travel-gift-5013":[384,384,28,18,327,348],"travel-gift-5014":[384,384,18,18,347,348]};
function heritageArt(g,bounds){
 const src=assetUrl(g.asset);
 if(g.catalogId!==5001)return `<image href="${src}" width="${bounds[4]}" height="${bounds[5]}"/>`;
 const mask=state.journal?.puppetFace||'红脸';
 return `<image href="${src}" width="384" height="384"/><image class="painted-mask" data-mask="${mask}" href="${src}" width="384" height="384" style="clip-path:ellipse(51px 46px at 202px 157px)"/>`;
}
function journalShelfMarkup(){return GameJournal.displayAll(state).map(g=>{if(!g)return '';const pos=journalShelfSlots[g.slot],[w,h,x,y,bw,bh]=journalShelfBounds[g.asset]||[384,384,0,0,384,384];return `<button class="collection-shelf" data-slot="${g.slot}" style="left:${pos.x}%;top:${pos.y}%" onclick="journalShelfTouch(${g.slot})" aria-label="${pos.label}，轻触${journalEscape(g.name)}"><svg viewBox="${x} ${y} ${bw} ${bh}" preserveAspectRatio="xMidYMax meet" aria-hidden="true">${heritageArt(g,[x,y,bw,bh,w,h])}</svg></button>`}).join('')}


function journalStoryIndex(){
 const owned=new Map();
 state.tripPostcards.forEach((trip,i)=>{if(trip.storyId)owned.set(trip.storyId,i)});
 return `<div class="story-heading"><b>山川珍藏</b><span>${owned.size} / 10</span></div><div class="story-index">${StoryPostcards.cards.map(card=>{
  const last=card.id==='SSR-10',hidden=last&&!StoryPostcards.complete(state.tripPostcards),i=owned.get(card.id);
  if(i!==undefined)return `<button class="story-owned" onclick="journalOpen(${i})">${image(card.asset)}<span><small>${card.id}</small><b>${card.name}</b></span></button>`;
  const place=TravelCollectionCatalog.destinations.find(d=>d.id===card.destination);
  const gear=[card.food,...card.gear].filter(Boolean).map(k=>items[k].name);
  const sky=card.id==='SSR-05'?'暮色交界（19:00–21:00）':card.skies?.join('或');
  return `<details><summary><small>${card.id}</small><b>${hidden?'未揭晓的团圆来信':card.name}</b></summary><p>${hidden?'收齐前九种珍藏明信片，便可解锁最后一程。':place.name+' · '+[...gear,sky].filter(Boolean).join('、')}</p></details>`;
 }).join('')}</div>`;
}
function journalPanel(){const j=GameJournal.init(state),souvenir=journalKind==='souvenirs',list=souvenir?state.travelSouvenirs:state.tripPostcards;let content='';if(journalView==='envelope')return envelopePanel();if(journalView==='zoom')return journalZoomMarkup();if(journalView==='share')return journalShareMarkup();if(journalView==='detail')content=souvenir?journalGiftDetail():journalCardDetail();else{
 const entries=list.map((_,i)=>souvenir?GameJournal.gift(state,i):GameJournal.card(state,i)).filter(c=>journalFilter!=='favorites'||j.favorites[c.id]);
 content=`<div class="journal-filter">${souvenir?`<span>已收集 <b>${list.length}</b> 件 · 旅途的礼物</span>`:`<div role="group" aria-label="明信片筛选"><button class="${journalFilter==='all'?'active':''}" onclick="journalSetFilter('all')">全部</button><button class="${journalFilter==='favorites'?'active':''}" onclick="journalSetFilter('favorites')">已收藏</button><button class="${journalFilter==='ssr'?'active':''}" onclick="journalSetFilter('ssr')">SSR</button></div><span>♥ ${Object.values(j.favorites).filter(Boolean).length} 张</span>`}</div>`;
 content+=!souvenir&&journalFilter==='ssr'?journalStoryIndex():entries.length?`<div class="journal-grid">${entries.map(c=>`<button class="journal-tile ${souvenir?'gift':''}" onclick="journalOpen(${c.index})" aria-label="查看${journalEscape(c.name)}"><span class="journal-grade ${c.grade}">${c.grade}</span>${!souvenir&&!j.read[c.id]?'<span class="journal-new">新</span>':''}${!souvenir&&j.favorites[c.id]?'<span class="journal-heart">♥</span>':''}${c.postcard?PostcardRenderer.markup(c):image(c.asset)}<b>${journalEscape(c.name)}</b>${souvenir?`<small>${j.displays.includes(c.id)?'已摆放 · ':''}已收集 ×${c.count}</small>`:''}</button>`).join('')}</div><p class="journal-footnote">✣ 向上滑动，看看更多${souvenir?'礼物':'风景'} ✣</p>`:`<div class="journal-empty">${image('journal-empty')}<h3>${journalFilter==='favorites'?'喜欢的风景，留在这里':souvenir?'旅途的礼物，还在路上':'第一张风景，还在路上'}</h3><p>${journalFilter==='favorites'?'打开明信片，轻点爱心即可收藏。':'给滚滚备好行囊，等它寄回远方的问候。'}</p>${journalFilter==='favorites'?journalButton('看看全部明信片',"journalSetFilter('all')",'red'):journalButton('去整理行囊',"closePanel(true);openPanel('bag')",'red')}${!souvenir&&state.mail&&journalFilter!=='favorites'?journalButton('拆开新来信',"openPanel('letter')") :''}${journalButton('回小院',"closePanel(true);changeScene('yard')")}</div>`}
 return `<section class="journal-shell"><div class="journal-resource-row"><span>${image('shop-currency')}<b>${Number(state.leaves).toLocaleString('zh-CN')}</b></span><span>${image('golden-shoot-v2')}<b>${state.inventory.charm||0}</b></span><span class="journal-weather">${$('weather').innerHTML}</span></div><header class="journal-heading"><div><small>山川来信 · 留住每一次相逢</small><h2>滚滚手账</h2></div>${image('journal-panda')}<button class="journal-exit modal-close" aria-label="关闭滚滚手账" onclick="closePanel(true)">×</button></header><div class="journal-tabs" role="tablist"><button role="tab" aria-selected="${!souvenir}" onclick="journalTab('postcards')">▧ 明信片</button><button role="tab" aria-selected="${souvenir}" onclick="journalTab('souvenirs')">♧ 纪念品</button></div><div class="journal-scroll">${content}</div><footer class="journal-bottom">${journalButton('⌂ 回小院',"closePanel(true);changeScene('yard')")}${journalButton('整理行囊',"closePanel(true);openPanel('bag')")}<span>✎ 手账</span></footer></section>`}
function journalCardDetail(){const c=GameJournal.card(state,journalIndex);if(!c){journalView='list';return ''}const j=state.journal,fav=!!j.favorites[c.id];return `<article class="journal-detail"><div class="journal-detail-title">${journalButton('←','journalGoBack()')}<h3>${journalEscape(c.name)}来信</h3><span class="journal-grade ${c.grade}">${c.grade}</span></div>${journalBack?`<div class="journal-letter-back"><div class="journal-postage">${c.postcard?PostcardRenderer.markup(c):image(c.asset)}<span>旅行熊猫邮局<br>${journalEscape(c.date)}</span></div><p>${journalEscape(c.message).replace(/\n/g,'<br>')}</p><p class="journal-signature">—— 滚滚 🐾</p><dl><div><dt>地点</dt><dd>${journalEscape(c.location)}</dd></div><div><dt>天气</dt><dd>${journalEscape(c.weather)}</dd></div><div><dt>旅伴</dt><dd>${journalEscape(c.companion)}</dd></div></dl></div>`:`<button class="journal-photo rarity-${c.grade}" onclick="journalOpenZoom()" aria-label="放大${journalEscape(c.name)}明信片">${c.postcard?PostcardRenderer.markup(c):image(c.asset)}${c.postcard||c.storyId?'':`<span class="journal-postmark">${journalEscape(c.name)}<br>${journalEscape(c.date)}</span>`}<span class="journal-zoom-label">⊕ 放大查看</span></button><p class="journal-caption">${journalEscape(c.postcard?c.postcard.actionGrade+' · '+c.postcard.actionName+' · '+c.weather:c.caption)}</p>`}${j.stamps[c.id]?'<span class="journal-saved-stamp">已盖章 · 收入手账</span>':''}<div class="journal-detail-actions">${journalButton(journalBack?'▧ 翻回正面':'▤ 翻面看寄语','journalFlip()')}${journalButton(fav?'♥ 已收藏':'♡ 收藏','journalToggleFavorite()')}</div><div class="journal-detail-actions">${journalButton('▣ 盖章保存','journalStartExport(true)','red')}${journalButton('↗ 分享','journalStartExport(false)','green')}</div><div class="journal-detail-actions">${journalButton('✉ 重看拆信','replayPostcardEnvelope(journalIndex)')}${state.mail>0?journalButton('继续拆信（'+state.mail+'）',"openPanel('letter')"): ''}</div><p class="journal-footnote">${journalEscape(c.date)} · 每一段风景，都有回家的方向</p></article>`}
function journalGiftDetail(){const g=GameJournal.gift(state,journalIndex);if(!g)return '';return `<article class="journal-detail journal-gift-detail"><div class="journal-detail-title">${journalButton('←','journalGoBack()')}<h3>${journalEscape(g.name)}</h3><span class="journal-grade ${g.grade}">${g.grade}</span></div><button class="gift-touch" onclick="journalInteractGift()" aria-label="轻触${journalEscape(g.name)}">${g.catalogId===5001?`<svg class="journal-gift-art" viewBox="0 0 384 384">${heritageArt(g,[0,0,384,384,384,384])}</svg>`:image(g.asset,'journal-gift-art')}</button><p id="gift-response" role="status">${({5001:'轻触木偶，开扇变脸',5002:'轻拨转经筒，听铜铃回响',5012:'轻触八音盒，听十秒草原小调'})[g.catalogId]||'轻触藏品，看看它的故事'}</p><p class="journal-origin">⌖ 来自：${journalEscape(g.origin)}</p><p class="journal-gift-description">${journalEscape(g.description)}</p><hr><p>已收集 ×${g.count}</p><div class="journal-detail-actions">${journalButton(state.journal.displays.includes(g.id)?'已摆放 · 去竹屋看看':'⌂ 摆放到竹屋','journalPlace()','red')}</div>${state.journal.displays.includes(g.id)?journalButton('收回手账','journalRemove()'):''}${journalPlacementPicker()}<p class="journal-footnote">摆放与取下不会消耗藏品，已摆放的藏品会自动保存。</p></article>`}
let journalZoom={scale:1,x:0,y:0,points:new Map(),distance:0};
function journalOpenZoom(){journalView='zoom';renderPanel();bindJournalZoom()}
function journalZoomMarkup(){const c=GameJournal.card(state,journalIndex);return `<section class="journal-zoom"><div class="journal-zoom-head"><b>${journalEscape(c.name)}</b>${journalButton('×','journalGoBack()')}</div><div id="journal-zoom-stage" aria-label="可双指缩放和拖动的明信片">${PostcardRenderer.markup(c,"journal-zoom-image")}</div><div class="journal-zoom-controls">${journalButton('−','journalScaleZoom(-.4)')}<output id="journal-zoom-level">100%</output>${journalButton('+','journalScaleZoom(.4)')}${journalButton('复位','journalResetZoom()')}</div><p>双指缩放 · 拖动查看 · 也可用滚轮或加减按钮</p></section>`}
function journalUpdateZoom(){const stage=$('journal-zoom-stage'),im=$('journal-zoom-image');if(!stage||!im)return;const z=journalZoom,rx=Math.max(0,(im.clientWidth*z.scale-stage.clientWidth)/2),ry=Math.max(0,(im.clientHeight*z.scale-stage.clientHeight)/2);z.x=Math.max(-rx,Math.min(rx,z.x));z.y=Math.max(-ry,Math.min(ry,z.y));im.style.transform=`translate(${z.x}px,${z.y}px) scale(${z.scale})`;$('journal-zoom-level').textContent=Math.round(z.scale*100)+'%'}
function journalScaleZoom(delta){journalZoom.scale=Math.max(1,Math.min(4,journalZoom.scale+delta));journalUpdateZoom()}
function journalResetZoom(){Object.assign(journalZoom,{scale:1,x:0,y:0,points:new Map(),distance:0});journalUpdateZoom()}
function bindJournalZoom(){journalResetZoom();const el=$('journal-zoom-stage'),z=journalZoom,dist=()=>{const p=[...z.points.values()];return p.length>1?Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y):0};el.onpointerdown=e=>{el.setPointerCapture(e.pointerId);z.points.set(e.pointerId,{x:e.clientX,y:e.clientY});z.distance=dist()};el.onpointermove=e=>{if(!z.points.has(e.pointerId))return;const prev=z.points.get(e.pointerId);z.points.set(e.pointerId,{x:e.clientX,y:e.clientY});if(z.points.size===1){z.x+=e.clientX-prev.x;z.y+=e.clientY-prev.y}else{const next=dist();if(z.distance)z.scale=Math.max(1,Math.min(4,z.scale*next/z.distance));z.distance=next}journalUpdateZoom()};el.onpointerup=el.onpointercancel=e=>{z.points.delete(e.pointerId);z.distance=dist()};el.onwheel=e=>{e.preventDefault();journalScaleZoom(e.deltaY<0?.15:-.15)};el.ondblclick=()=>journalScaleZoom(z.scale===1?1.5:-3)}
function journalShareMarkup(){const c=GameJournal.card(state,journalIndex);return `<section class="journal-share"><div class="journal-share-head">${journalButton('←','journalGoBack()')}<h2>分享这份风景</h2><button class="journal-exit modal-close" aria-label="关闭分享" onclick="closePanel(true)">×</button></div>${journalExportUrl?`<img class="journal-export-image" src="${journalExportUrl}" alt="${journalEscape(c.name)}分享图片，可长按保存"><p class="journal-export-status">✓ 图片已生成${state.journal.stamps[c.id]?' · 已盖章保存':''}</p><div class="journal-detail-actions">${journalButton('↓ 下载图片','journalDownload()','red')}${journalButton('↗ 分享图片','journalNativeShare()','green')}</div><p class="journal-footnote">也可长按图片保存 · 分享由你选择接收方</p>`:`<div class="journal-export-loading" role="status">${c.postcard?PostcardRenderer.markup(c):image(c.asset)}<p>${journalExportBusy?'正在装裱这份风景…':'图片生成失败，请重试'}</p>${!journalExportBusy?journalButton('重新生成','journalStartExport(false)','red'):''}</div>`}</section>`}
async function journalStartExport(stamp){const c=GameJournal.card(state,journalIndex);if(!c)return;releaseJournalExport();const run=journalExportRun;if(stamp){globalThis.GameSfx?.play('ui06');GameJournal.stamp(state,journalIndex);save()}journalView='share';journalExportBusy=true;renderPanel();try{let cv;if(c.grade==='纪念'||c.storyId||c.postcard){cv=c.grade==='纪念'||c.storyId?await PostcardRenderer.fullArt(c):await PostcardRenderer.compose(c);if(state.journal.stamps[c.id])PostcardRenderer.addSeal(cv)}else{const im=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=assetUrl(c.asset)});if(run!==journalExportRun||!(panel==='album'||panel==='souvenirs'))return;cv=document.createElement('canvas');cv.width=900;cv.height=1280;const x=cv.getContext('2d');if(!x)throw Error('canvas');x.fillStyle='#f7ecd3';x.fillRect(0,0,900,1280);x.strokeStyle='#ba9562';x.lineWidth=5;x.strokeRect(24,24,852,1232);x.strokeStyle='#dcc59d';x.lineWidth=1;x.strokeRect(34,34,832,1212);x.fillStyle='#425c3d';x.textAlign='center';x.font='bold 44px serif';x.fillText('分享这份风景',450,105);x.fillStyle='#fff9ed';x.shadowColor='#91764a55';x.shadowBlur=14;x.fillRect(70,145,760,835);x.shadowBlur=0;const scale=Math.min(700/im.width,665/im.height),w=im.width*scale,h=im.height*scale;x.drawImage(im,450-w/2,180+(665-h)/2,w,h);x.fillStyle='#493e2b';x.font='bold 42px serif';x.fillText(c.name,450,912);x.font='29px serif';const chars=[...c.caption];for(let i=0;i<chars.length;i+=20)x.fillText(chars.slice(i,i+20).join(''),450,1035+Math.floor(i/20)*45);x.font='22px serif';x.fillStyle='#7e7959';x.fillText('滚滚手账 · '+c.grade+' · '+c.date,450,1190);if(state.journal.stamps[c.id]){x.save();x.translate(748,850);x.rotate(-.15);x.strokeStyle='#b84e34';x.lineWidth=4;x.strokeRect(-50,-50,100,100);x.fillStyle='#b84e34';x.font='bold 27px serif';x.fillText('山川',0,-5);x.fillText('留念',0,30);x.restore()}}const blob=await new Promise(resolve=>cv.toBlob(resolve,'image/png'));if(!blob)throw Error('blob');if(run!==journalExportRun)return;journalExportBlob=blob;journalExportUrl=URL.createObjectURL(blob);journalExportBusy=false;if(journalView==='share')renderPanel()}catch{if(run===journalExportRun){journalExportBusy=false;renderPanel();toast('图片生成失败，请重试')}}}
function journalDownload(){if(!journalExportUrl)return;const c=GameJournal.card(state,journalIndex),a=document.createElement('a');a.href=journalExportUrl;a.download='滚滚手账-'+c.name+'.png';document.body.append(a);a.click();a.remove();toast('图片已生成，请在浏览器下载中查看')}
async function journalNativeShare(){if(!journalExportBlob)return;const c=GameJournal.card(state,journalIndex);try{const f=new File([journalExportBlob],'滚滚手账-'+c.name+'.png',{type:'image/png'});if(navigator.canShare?.({files:[f]})&&navigator.share)await navigator.share({title:'滚滚手账 · '+c.name,files:[f]});else toast('当前浏览器不支持直接分享，可下载图片或长按保存')}catch(e){if(e.name!=='AbortError')toast('分享暂时不可用，可下载图片后分享')}}

let giftTapTimer=null;
function journalShelfTouch(slot){const g=GameJournal.displayAll(state)[slot];if(!g)return;journalOpenGiftFeedback(g,document.querySelector('.collection-shelf[data-slot="'+slot+'"]'));}
function journalInteractGift(){const g=GameJournal.gift(state,journalIndex);if(!g)return;journalOpenGiftFeedback(g);}
function journalOpenGiftFeedback(g,target){const node=target||document.querySelector('.gift-touch');
 const prop={5001:'prop01',5002:'prop02',5012:'prop03'}[g.catalogId];
 if(node&&state.motion){
  node.classList.remove('gift-wiggle','wheel-turn','music-box-play');
  void node.offsetWidth;
  node.classList.add(g.catalogId===5002?'wheel-turn':g.catalogId===5012?'music-box-play':'gift-wiggle');
 }
 let message=g.description;
 if(prop)globalThis.GameSfx?.play(prop);
 if(g.catalogId===5001){
  const faces=['红脸','黑脸','白脸'],index=(faces.indexOf(state.journal.puppetFace||'红脸')+1)%3;
  state.journal.puppetFace=faces[index];save();
  if(node){node.dataset.face=faces[index];const mask=node.querySelector('.painted-mask');if(mask)mask.dataset.mask=faces[index]}
  message=['红脸 · 忠勇','黑脸 · 刚正','白脸 · 机敏'][index];
 }
 if(g.catalogId===5002)message='经筒缓缓转过一圈，铜铃余韵渐远。';
 if(g.catalogId===5012)message=globalThis.GameSfx?.enabled?.('sfx')===false?'八音盒的发条轻轻转动。':'八音盒响起一段草原小调。';
 if(g.catalogId===5007)message='挥毫练字 · 竹屋里又添了一缕墨香';if(g.catalogId===5008)message='品茗看雨 · 把日子慢慢泡进一盏茶里';const status=document.getElementById('gift-response');if(status)status.textContent=message;toast(message);if(scene==='room'&&[5006,5007,5008,5010,5014].includes(g.catalogId)){const panda=document.getElementById('panda');panda?.classList.add('souvenir-idle');clearTimeout(giftTapTimer);giftTapTimer=setTimeout(()=>panda?.classList.remove('souvenir-idle'),2800)}}
;
// Departure UI reads the existing journey and unread mail; it never creates rewards or letters.
const TravelYard=(()=>{
 const steps=[{x:55,y:47,size:20,turn:-22},{x:65,y:51,size:25,turn:8},{x:68,y:57,size:31,turn:-15},{x:68,y:68,size:38,turn:12},{x:72,y:78,size:46,turn:-12}];
 const isAway=(s,place)=>place==='yard'&&s.mode==='travel';
 const unread=s=>Math.max(0,Math.floor(Number(s.mail)||0));
 const progress=(s,now=Date.now())=>Math.max(0,Math.min(1,(now-s.start)/Math.max(1,s.end-s.start)));
 const paw=`<svg viewBox="0 0 80 86" aria-hidden="true" focusable="false"><ellipse cx="12" cy="29" rx="8" ry="12" transform="rotate(-25 12 29)"/><ellipse cx="29" cy="16" rx="8.5" ry="12.5" transform="rotate(-10 29 16)"/><ellipse cx="49" cy="16" rx="8.5" ry="12.5" transform="rotate(10 49 16)"/><ellipse cx="66" cy="29" rx="8" ry="12" transform="rotate(25 66 29)"/><path d="M14 62C14 52 23 47 28 39C33 31 46 31 51 39C57 47 67 52 67 63C67 77 55 79 41 74C29 79 14 77 14 62Z"/></svg>`;
 return {steps,isAway,unread,progress,paw};
})();
function travelFootprintsMarkup(now=Date.now()){
 if(!TravelYard.isAway(state,scene))return '';
 const p=TravelYard.progress(state,now);
 return TravelYard.steps.map((point,i)=>`<button class="away-step ${i>=5-Math.ceil(p*5)?'passed':''}" style="left:${point.x}%;top:${point.y}%;--paw-size:${point.size}px;--turn:${point.turn}deg;--pulse-delay:${i*.38}s" onclick="travelTrailClick()" aria-label="脚印${i+1}：查看旅程">${TravelYard.paw}</button>`).join('')+'<span class="away-trail-caption">点点脚印，看看旅程 <span aria-hidden="true">↗</span></span>';
}
function travelAwayMarkup(){
 if(!TravelYard.isAway(state,scene))return '';
 const count=TravelYard.unread(state);
 return `<div class="away-yard-heading"><div class="away-yard-scroll">${image('icon6')}<div><b>滚滚去远方看风景了</b><small>听溪水，等它带回新的故事</small></div></div><button class="away-mail-link" onclick="openPanel('mail')" aria-label="${count?'查看'+count+'封未读来信':'查看信箱，等待远方来信'}"><span aria-hidden="true">✉</span><b>旅途中 · ${count?'待拆 '+count+' 封来信':'等待远方来信'}</b><i aria-hidden="true">›</i></button></div>${count?'<button class="away-new-letter" onclick="openPanel(\'mail\')" aria-label="信箱有新来信"><span>新来信</span><i aria-hidden="true"></i></button>':''}`;
}
function renderAwayYard(){const away=TravelYard.isAway(state,scene);$('footprints').hidden=!away;$('footprints').innerHTML=travelFootprintsMarkup();$('away-scene-ui').innerHTML=travelAwayMarkup()}
function travelTrailClick(){updateTime();if(state.mode==='travel')openPanel('journey');else{render();if(state.lastTrip)openPanel('return')}}
;
// Opening a letter is visual only. Existing claimLetter owns the single collection transaction.
const LetterEnvelope=(()=>{
 const assets=['envelope-back','envelope-flap','envelope-front-kraft','envelope-front-bamboo','envelope-paper-seal','envelope-wax-seal'];
 function identity(s){const t=s.pendingLetters?.[0];return Number(s.mail)>0?(t?(t.journalId||[t.start,t.end,t.destination?.name].join('-')):'welcome')+':'+(s.album||0)+':'+s.mail:null}
 function welcome(number,now=Date.now()){const trip={journalId:'welcome-'+number,claimedAt:now,weatherLabel:'晴',destination:{id:3001,asset:'travel-card-3001',name:'成都青城山',region:'西南',terrain_tag:'山岳',tags:['山岳','森林']},rarity:'N',message:'山里的风很凉，我替你听了竹海。\n山路有些长，但这里的竹笋很好吃。\n等我回家，再慢慢讲给你听。'};if(typeof PostcardRules!=='undefined')trip.postcard=PostcardRules.create(trip);return trip}
 function incoming(s){if(!identity(s))return null;const t=s.pendingLetters?.[0]||welcome((s.album||0)+1);const temp={tripPostcards:[t],travelSouvenirs:[],album:1,souvenirs:0,journal:{migrated:true}};const card=GameJournal.card(temp,0);let gift=null;if(t.souvenir){temp.travelSouvenirs=[t.souvenir];gift=GameJournal.gift(temp,0)}else if(!s.pendingLetters?.length)gift={name:'川剧变脸小木偶',asset:'travel-gift-5001',grade:'R'};return {card,gift}}
 function canClaim(s,session){return !!session&&session.source==='incoming'&&session.phase==='revealed'&&!session.claimed&&session.key===identity(s)&&Number(s.mail)>0}
 return {assets,identity,incoming,canClaim,welcome};
})();
let envelopeSession=null,envelopeRun=0,envelopeTimer=null;
function cancelEnvelope(){envelopeRun++;clearTimeout(envelopeTimer);envelopeTimer=null;envelopeSession=null}
function prepareEnvelope(source='incoming',index=0){cancelEnvelope();const data=source==='incoming'?LetterEnvelope.incoming(state):{card:GameJournal.card(state,index),gift:null};if(!data?.card)return;envelopeSession={...data,source,index,key:source==='incoming'?LetterEnvelope.identity(state):data.card.id,phase:'loading',run:envelopeRun,warming:false,claimed:false}}
function envelopeIsActive(session=envelopeSession){return !!session&&session===envelopeSession&&session.run===envelopeRun&&(session.source==='incoming'?panel==='letter'&&session.key===LetterEnvelope.identity(state):(panel==='album'||panel==='souvenirs')&&journalView==='envelope')}
function envelopeMotionDisabled(){return !state.motion||(typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)}
function mountEnvelope(){const session=envelopeSession;if(!envelopeIsActive(session))return;
 if(session.phase==='loading'&&!session.warming){session.warming=true;Promise.resolve(warmAssets([...LetterEnvelope.assets,session.card.asset])).then(()=>{if(!envelopeIsActive(session)||session.phase!=='loading')return;session.phase=envelopeMotionDisabled()?'revealed':'sealed';renderPanel()}).catch(()=>{if(envelopeIsActive(session)){session.phase='revealed';renderPanel()}})}
 else if(session.phase==='opening'&&!envelopeTimer)envelopeTimer=setTimeout(()=>{envelopeTimer=null;if(envelopeIsActive(session))finishEnvelopeOpening()},2400);
}
function finishEnvelopeOpening(){if(!envelopeIsActive()||envelopeSession.phase==='revealed')return;clearTimeout(envelopeTimer);envelopeTimer=null;envelopeSession.phase='revealed';renderPanel()}
function authorizeEnvelopeClaim(){if(!LetterEnvelope.canClaim(state,envelopeSession))return false;envelopeSession.claimed=true;return true}
function replayPostcardEnvelope(index){if(!GameJournal.card(state,index))return;journalIndex=index;prepareEnvelope('journal',index);journalView='envelope';renderPanel()}
function closeEnvelopeReplay(){cancelEnvelope();journalView='detail';renderPanel()}
function envelopePanel(){const session=envelopeSession,escape=journalEscape;if(!envelopeIsActive(session))return `<div class="envelope-no-letter"><h4>${state.mail?'来信状态已更新':'来信已经收进手账'}</h4><p>每一封问候，都好好留在这里。</p>${state.mail?button('重新打开来信',"openPanel('letter')"):button('翻翻滚滚手账',"openPanel('album')")}</div>`;
 const {card:c,gift,phase,source}=session,replay=source==='journal',rare=c.grade==='SSR'||gift?.grade==='SR',closed=phase!=='revealed';
 const innerCard=`<div class="envelope-photo-border">${c.postcard?PostcardRenderer.markup(c):image(c.asset)}<span class="envelope-grade ${escape(c.grade)}">${escape(c.grade)}</span></div><h4>${escape(c.name)}来信</h4><p>${escape(c.caption)}</p><small>${escape(c.location)} · ${escape(c.date)}</small>`;
 return `<div class="envelope-experience ${replay?'replay':''}" data-envelope-phase="${phase}"><div class="envelope-heading"><small>竹林小院 · 见字如面</small><h3>${closed?'远方来信':'把风景寄给你'}</h3><p>${closed?'它把沿途的风景，悄悄装进了信封':'这一程的问候，已经平安抵达'}</p>${replay?'<button class="envelope-close modal-close" aria-label="返回明信片" onclick="closeEnvelopeReplay()">×</button>':''}</div>${closed?`<div class="envelope-stage ${phase==='opening'?'opening':phase==='sealed'?'arriving':''} ${rare?'bamboo-envelope':''}" aria-label="${rare?'青竹暗纹宣纸信封':'牛皮纸信封'}"><div class="envelope-body"><img class="envelope-layer envelope-back" src="${assetUrl('envelope-back')}" alt="牛皮纸信封背板"><div class="envelope-card-slip" aria-hidden="true">${innerCard}</div><img class="envelope-layer envelope-front" src="${assetUrl(rare?'envelope-front-bamboo':'envelope-front-kraft')}" alt="信封前袋"><img class="envelope-layer envelope-flap" src="${assetUrl('envelope-flap')}" alt="信封盖"><button class="envelope-seal" onclick="openEnvelopeSeal()" aria-label="拆开封印，查看明信片"><img src="${assetUrl(rare?'envelope-wax-seal':'envelope-paper-seal')}" alt="熊猫爪印封印"></button></div></div><div class="envelope-animation-status" role="status">${phase==='loading'?'正在接过这封问候…':phase==='sealed'?'轻触封印，拆开远方的问候':'封口轻启，风景正缓缓展开…'}</div><button class="envelope-skip" onclick="finishEnvelopeOpening()">跳过动画，直接看信</button>`:`<article class="envelope-revealed-card rarity-${c.grade}">${innerCard}</article>${gift?`<div class="envelope-gift-preview">${image(gift.asset)}<div><b>${escape(gift.name)} ×1</b><small>这次旅途的小小纪念</small></div></div>`:''}<p class="envelope-message">${escape(c.message).replace(/\n/g,'<br>')}<span>—— 滚滚</span></p><button class="envelope-collect" onclick="${replay?'closeEnvelopeReplay()':'claimLetter()'}">${replay?'返回明信片':'收进手账'}</button><small class="envelope-collection-note">${replay?'重看动画不会重复领取明信片或纪念品':'收进手账后，可翻面读寄语、收藏或分享这份风景'}</small>`}</div>`;
}

function openEnvelopeSeal(){if(!envelopeIsActive()||envelopeSession.phase!=='sealed')return;envelopeSession.phase='opening';playEnvelopePaper();renderPanel()}
function playEnvelopePaper(){globalThis.GameSfx?.play('ui02')}

;GameTravel.initialize(state);render();
