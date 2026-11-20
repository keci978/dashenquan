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
