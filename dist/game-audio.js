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
