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
