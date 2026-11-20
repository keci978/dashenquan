const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const ctx=vm.createContext({items:{}});
for(const f of ['item-config','collection-catalog','travel-engine','journal-interactions'])vm.runInContext(fs.readFileSync('dist/'+f+'.js','utf8'),ctx);
const {S,G,J,P}=vm.runInContext('({S:StoryPostcards,G:GameTravel,J:GameJournal,P:PostcardRules})',ctx);
const all=S.cards.slice(0,9).map(c=>({storyId:c.id})),end=Date.UTC(2026,10,19,12);
for(const c of S.cards){
 const destination=G.destinations.find(d=>d.id===c.destination),trip={destination,gear:c.gear,food:c.food||'rice',end,collectionVersion:1};
 const sky=c.skies?.[0]||'晴空';
 assert.equal(S.match(trip,sky,all)?.id,c.id);assert.equal(S.match({...trip,gear:c.gear.slice(1)},sky,all),null);
 if(c.food)assert.equal(S.match({...trip,food:'honey'},sky,all),null);
 if(c.skies)assert.equal(S.match(trip,'其他天象',all),null);
 if(c.id==='SSR-10')assert.equal(S.match(trip,sky,all.slice(1)),null);
 if(c.id==='SSR-05')assert.equal(S.match({...trip,end:end+4*3600000},sky,all),null);
 const s={mode:'travel',trip:{...trip,postcard:{sky}},end,mail:0,travelSouvenirs:[],tripPostcards:all.slice(),travelLog:[],pendingLetters:[],specialties:{}};
 assert(G.settle(s,end));assert(!G.settle(s,end));const result=s.pendingLetters[0];
 assert.equal(result.rarity,'SSR');assert.equal(result.storyId,c.id);assert.equal(result.postcard,undefined);
 s.tripPostcards.push(result);const card=J.card(s,s.tripPostcards.length-1);assert.equal(card.asset,c.asset);assert.equal(card.message,c.message);
 assert(card.name===c.name&&!card.postcard);
}
assert(!S.complete(Array(9).fill(all[0])));
for(const id of [3005,3001]){
 const c=S.cards.find(c=>c.destination===id);let found=false;
 for(let i=1;i<1500&&!found;i++)found=G.plan(c.food,c.gear,end,P.random(i*901),all).destination.id===id;
 assert(found,'Unreachable destination '+id);
}
console.log('PASS: ten independent SSR cards, exact requirements, album unlock, reachable route exceptions, one-time settlement and matching fronts/backs');
