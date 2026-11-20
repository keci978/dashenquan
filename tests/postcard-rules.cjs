const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx=vm.createContext({});
for(const file of ['travel-engine','collection-catalog'])vm.runInContext(file==='travel-engine'?fs.readFileSync('dist/'+file+'.js','utf8').split('// Travel mechanics')[0]:fs.readFileSync('dist/'+file+'.js','utf8'),ctx);
const {rules,destinations}=vm.runInContext('({rules:PostcardRules,destinations:TravelCollectionCatalog.destinations})',ctx);
const gear=['umbrella','tent','walkingStick','lantern','sleepingBag','charm'];
function ids(tag,sky,packed=gear,food='feast'){
 const destination=destinations.find(d=>d.terrain_tag===tag);
 return Array.from(rules.eligible({destination,food,gear:packed},sky),a=>a.id);
}
assert.deepEqual(ids('水乡','阴雨',[],null),[1]);
assert(ids('古迹','阴雨').includes(5));assert(!ids('荒漠','阴雨').includes(5));
assert(!ids('水乡','璀璨星空').includes(5));assert(!ids('水乡','阴雨').includes(4));
for(const [id,tag,sky] of [[6,'草原','璀璨星空'],[7,'山岳','晴空'],[8,'奇观','璀璨星空'],[9,'高原','飘雪'],[10,'古迹','晴空']]){
 assert(ids(tag,sky).includes(id));assert(!ids(tag,sky,[]).includes(id));
}
const manifest=JSON.parse(fs.readFileSync('dist/asset-manifest.json'));
for(const destination of destinations){
 const trip={destination,end:1700000000000,food:'imperial',gear,journalId:'trip-'+destination.id};
 const recipe=rules.create(trip);assert.deepEqual(recipe,rules.create(JSON.parse(JSON.stringify(trip))));
 assert(recipe.anchor>=0&&recipe.anchor<3);assert(manifest['travel-landmark-'+destination.id]);
}
for(let n=1;n<=10;n++)assert(manifest['travel-action-'+n]);
console.log('PASS: postcard action gates, 30 landmarks, 10 sprites and stable scene recipes');
