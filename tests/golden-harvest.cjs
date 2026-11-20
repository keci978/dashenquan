const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('dist/yard-interactions.js','utf8');
function fixture(roll){
 let randomCalls=0,saves=0;const nodes=[],label={textContent:''};const layer={querySelectorAll:()=>[],appendChild:n=>{n.parentElement=layer;nodes.push(n)},removeAttribute(){}};
 const math=Object.create(Math);math.random=()=>{randomCalls++;return roll};
 const ctx={state:{leaves:0,inventory:{charm:2},harvest:0,motion:false},scene:'yard',Math:math,Date,save:()=>saves++,render(){},toast(){},setTimeout(){},setInterval(){},document:{addEventListener(){},createElement:()=>({style:{},setAttribute(){},remove(){}})},$:id=>id==='feedback-layer'?layer:label};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('dist/asset-loader.js','utf8'),ctx);vm.runInContext(source,ctx);return {ctx,nodes,calls:()=>randomCalls,saves:()=>saves};
}
for(const [roll,isGold] of [[0,true],[.099999,true],[.10,false],[.5,false]]){
 const f=fixture(roll),c=f.ctx;
 const markup=c.fieldMarkup();assert.equal((markup.match(/class="prop shoot golden"/g)||[]).length,isGold?1:0);
 assert.equal(markup.includes('golden-shoot-v2.webp'),isGold);
 const calls=f.calls(),snapshot=JSON.stringify(c.state.shootCycle);
 for(let n=0;n<20;n++){c.fieldMarkup();c.harvestHotspot()}
 assert.equal(f.calls(),calls);assert.equal(JSON.stringify(c.state.shootCycle),snapshot);
 // Reload preserves the exact saved result regardless of the new RNG.
 const refreshed=fixture(isGold?.99:0);refreshed.ctx.state=JSON.parse(JSON.stringify(c.state));refreshed.ctx.fieldMarkup();assert.equal(refreshed.calls(),0);
 assert.equal(c.collectShoots(),true);assert.equal(c.state.leaves,20);assert.equal(c.state.inventory.charm,isGold?3:2);
 assert.equal(f.nodes.some(n=>n.className.includes('golden-reward')),isGold);
 assert.equal(c.collectShoots(),false);assert.equal(c.state.leaves,20);assert.equal(c.state.inventory.charm,isGold?3:2);
 assert.equal(c.growthStage(),0);assert(!c.fieldMarkup().includes('shoot golden'));
 c.scene='room';assert.equal(c.collectShoots(),false);
}
// Ten percent base probability, with no harvest misses in this sampling.
const f=fixture(.5),c=f.ctx;let hits=0;for(let i=0;i<10000;i++){c.state.harvest=i+1;c.Math.random=()=> (i+.5)/10000;if(c.ensureFieldRoll().goldenIndex>=0)hits++}assert.equal(hits,1000);
// A failed click/render/reload does not advance pity; only successful harvests do.
const p=fixture(.99),g=p.ctx;let clock=100000;g.Date={now:()=>clock};
for(let n=1;n<=10;n++){
 const isGold=g.ensureFieldRoll().goldenIndex>=0;assert.equal(isGold,n===10);
 const misses=g.state.goldenHarvestMisses;for(let k=0;k<5;k++)g.fieldMarkup();assert.equal(g.state.goldenHarvestMisses,misses);
 assert(g.collectShoots());assert.equal(g.state.goldenHarvestMisses,n===10?0:n);
 const saved=JSON.parse(JSON.stringify(g.state));assert(!g.collectShoots());assert.deepEqual(JSON.parse(JSON.stringify(g.state)),saved);
 const reload=fixture(.0);reload.ctx.state=saved;reload.ctx.ensureFieldRoll();assert.equal(reload.calls(),0);assert.equal(reload.ctx.state.goldenHarvestMisses,g.state.goldenHarvestMisses);
 clock+=60000;
}
assert.equal(g.state.inventory.charm,3);assert.equal(g.state.leaves,200);
// Old saved fields keep their appearance and result when upgrading, even at pity.
const old=fixture(.99);old.ctx.state.shootCycle={cycle:0,goldenIndex:-1};old.ctx.state.goldenHarvestMisses=9;assert.equal(old.ctx.ensureFieldRoll().goldenIndex,-1);assert.equal(old.calls(),0);
console.log('PASS: 10% per field, tenth-harvest pity, persisted counter, migration, reload stability, one gold maximum and duplicate harvest protection');
