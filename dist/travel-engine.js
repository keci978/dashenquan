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
