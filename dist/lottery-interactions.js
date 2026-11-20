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
