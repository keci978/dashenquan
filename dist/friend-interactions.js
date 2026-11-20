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
