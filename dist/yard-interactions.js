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
