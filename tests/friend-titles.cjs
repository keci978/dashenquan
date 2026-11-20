const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
const math=Object.create(Math);math.random=()=>0;
const c=vm.createContext({items:{},Math:math,document:{addEventListener(){}},setInterval(){},save(){}});
for(const name of ['item-config','collection-catalog','travel-engine','friend-interactions','yard-interactions','journal-interactions'])
 vm.runInContext(fs.readFileSync('dist/'+name+'.js','utf8'),c);
const {F,J,P}=vm.runInContext('({F:GameFriends,J:GameJournal,P:PostcardRules})',c);
const now=Date.now(),s=c.state={leaves:0,tickets:0,inventory:{},specialties:{红糖糍粑:9},tripPostcards:[]};
F.init(s,now);const r=s.companions.records.aguo;
for(const [xp,tier] of [[0,0],[49,0],[50,1],[150,2],[350,3],[650,4]])assert.equal(F.rank({titleXp:xp}),tier);
r.titleXp=625;const result=F.feed(s,'specialty:红糖糍粑',now);assert.equal(result.titleGain,25);assert(result.promoted);assert.equal(r.visitTicket,1);
assert.equal(J.card(s,0).asset,'travel-friend-aguo');assert(F.claim(s,now));assert.equal(s.tickets,6);assert.equal(s.leaves,45);assert(!F.claim(s,now));
F.init(s,now);F.feed(s,'specialty:红糖糍粑',now);assert.equal(s.tripPostcards.length,1);assert.equal(r.visitTicket,1);
assert(F.reserveTicket(s,'aguo'));assert(!F.reserveTicket(s,'aguo'));F.leave(s,now);F.tick(s,now+6*60000);
assert.equal(s.companions.visit.id,'aguo');assert(s.companions.visit.helped);assert.equal(s.leaves,65);F.tick(s,now+6*60000);assert.equal(s.leaves,65);
const trip={food:'feast',gear:['charm'],destination:{tags:['古迹']},sharingFriends:[]};
assert(!P.eligible(trip,'晴空').some(a=>a.id===10));trip.sharingFriends=['aguo'];assert(P.eligible(trip,'晴空').some(a=>a.id===10));
for(const [score,xp] of [[30,25],[15,15],[10,8],[5,3]]){
 s.specialties.测试=1;vm.runInContext('localSpecialties.push({name:"测试",taste:{aguo:'+score+'}})',c);r.titleXp=0;s.companions.visit.fed=0;
 assert.equal(F.feed(s,'specialty:测试',now+6*60000).titleGain,xp);vm.runInContext('localSpecialties.pop()',c);
}
console.log('PASS: title thresholds, four taste tiers, capped XP, gift bonuses, harvest, ACT_10 and one-time keepsake/ticket');
