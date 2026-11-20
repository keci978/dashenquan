const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const run = (file) => vm.runInContext(fs.readFileSync('dist/'+file+'.js','utf8'), context);
const context = vm.createContext({
  items:{}, GameFriends:{tick(){}}, save(){}, setTimeout(){}, toast(){},
  state:{introTrip:0, mode:'prepare', autoDepartAt:1000, inventory:{honey:2,umbrella:1},
    bag:['honey',null,null,null], reserve:['honey',null,'umbrella',null], mail:0}
});
for (const file of ['item-config','collection-catalog','travel-engine']) run(file);
const travel=vm.runInContext('GameTravel',context);
travel.initialize(context.state);
const app=fs.readFileSync('dist/app.js','utf8');
vm.runInContext(app.slice(app.indexOf('function updateTime()'),app.indexOf('function confirmReset()')),context);
// Reopen after both trips should have finished, then reopen the same save again.
context.updateTime();
const s=context.state;
assert.equal(s.mode,'home');
assert.equal(s.mail,2);
const [first,second]=s.pendingLetters;
assert.equal(first.totalMs,210000);
assert.equal(first.destination.id,3001);
assert.equal(first.souvenir.id,5001);
assert.equal(first.rarity,'R');
assert.equal(s.specialties['红糖糍粑'],2);
assert.equal(second.start,first.end+300000);
assert.equal(second.totalMs,9000000);
assert.equal(second.destination.id,3007);
assert.equal(second.weatherLabel,'小雨');
assert.equal(second.loadoutSource,'reserve');
assert.equal(s.inventory.honey,0);
assert.equal(s.durability.umbrella,9);
const after=JSON.stringify(s);
context.state=JSON.parse(after);
context.updateTime();
assert.equal(JSON.stringify(context.state),after);
const entries=vm.runInContext('localSpecialties',context);
assert.equal(new Set(entries.map(x=>x.name)).size,21);
for(const d of travel.destinations)assert(entries.some(x=>x.id===d.specialty_id));
const old={inventory:{rice:1},bag:['rice',null,null,null],reserve:[null,null,null,null],mode:'home'};
travel.initialize(old);
assert(travel.begin(old,'bag',1000,()=>.5).totalMs>=8*3600000);
console.log('PASS: two offline departures and returns, named specialties, single-use reserve, old-save pacing and reload idempotence');
