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
