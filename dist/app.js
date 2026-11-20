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
