// Shared game weather. Beijing time keeps scene changes/devices on the same clock.
const GameWeather=(()=>{
 const HOUR=3600000,SLOT=3*HOUR,OFFSET=8*HOUR,EPOCH=Math.floor(Date.UTC(2020,0,1)/SLOT);
 const names={clear:'晴',cloudy:'多云',overcast:'阴天',fog:'雾',lightRain:'小雨',heavyRain:'大雨',thunder:'雷雨',lightSnow:'小雪',heavySnow:'大雪'};
 const graph={clear:['clear','cloudy'],cloudy:['clear','cloudy','overcast','fog'],overcast:['cloudy','overcast','fog','lightRain','lightSnow'],fog:['fog','cloudy','overcast'],lightRain:['overcast','lightRain','heavyRain'],heavyRain:['lightRain','heavyRain','thunder'],thunder:['heavyRain','thunder'],lightSnow:['overcast','lightSnow','heavySnow'],heavySnow:['overcast','lightSnow','heavySnow']};
 const weights={spring:{clear:18,cloudy:32,overcast:20,fog:8,lightRain:18,heavyRain:4},summer:{clear:23,cloudy:25,overcast:12,fog:3,lightRain:15,heavyRain:14,thunder:8},autumn:{clear:36,cloudy:30,overcast:15,fog:12,lightRain:6,heavyRain:1},winter:{clear:27,cloudy:25,overcast:18,fog:10,lightRain:7,heavyRain:1,lightSnow:10,heavySnow:2}};
 const seasonNames={spring:'春季',summer:'夏季',autumn:'秋季',winter:'冬季'};
 function seasonAtLocal(localMs){const year=new Date(localMs).getUTCFullYear();const crossing=i=>31556925974.7*(year-1900)+termMinutes[i]*60000+Date.UTC(1900,0,6,2,5)+OFFSET;return localMs<crossing(2)||localMs>=crossing(20)?'winter':localMs<crossing(8)?'spring':localMs<crossing(14)?'summer':'autumn'}
 function random(slot,salt){let x=(slot^salt)>>>0;x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);return ((x^(x>>>16))>>>0)/4294967296}
 function transition(previous,slot){const season=seasonAtLocal(slot*SLOT),pool=graph[previous];let total=0;for(const id of pool)total+=weights[season][id]||0;if(!total)return 'overcast';let roll=random(slot,0x51a37)*total;for(const id of pool){roll-=weights[season][id]||0;if(roll<0)return id}return pool.find(id=>weights[season][id]>0)||'overcast'}
 // Reconstruct from a fixed epoch on first use; subsequent slots are incremental.
 // No save-game fields or refresh-time random draws are involved.
 let lastSlot=EPOCH,lastType='cloudy';
 function typeAt(slot){if(slot<lastSlot){lastSlot=Math.min(slot,EPOCH);lastType='cloudy'}while(lastSlot<slot){lastSlot++;lastType=transition(lastType,lastSlot)}return lastType}
 function clockLabel(timestamp,now){const date=new Date(timestamp+OFFSET),current=new Date(now+OFFSET);const nextDay=date.toISOString().slice(0,10)!==current.toISOString().slice(0,10);return (nextDay?'明天 ':'')+String(date.getUTCHours()).padStart(2,'0')+':'+String(date.getUTCMinutes()).padStart(2,'0')}
 function get(now=Date.now()){
  const local=now+OFFSET,day=new Date(local),hour=day.getUTCHours(),slot=Math.floor(local/SLOT),type=typeAt(slot),season=seasonAtLocal(local);
  const windRoll=random(slot,0x724ca),wind=windRoll<(season==='winter'?.4:.5)?'calm':windRoll<.9?'breeze':'windy';
  const nextUpdate=(slot+1)*SLOT-OFFSET,nextPhaseLocal=Date.UTC(day.getUTCFullYear(),day.getUTCMonth(),day.getUTCDate(),hour<6?6:hour<18?18:30);
  return {type,label:names[type],night:hour<6||hour>=18,period:slot,season,seasonLabel:seasonNames[season],wind,windLabel:{calm:'无风',breeze:'微风',windy:'有风'}[wind],nextUpdate,until:clockLabel(nextUpdate,now),nextPhase:nextPhaseLocal-OFFSET,nextPhaseLabel:clockLabel(nextPhaseLocal-OFFSET,now),clock:String(hour).padStart(2,'0')+':'+String(day.getUTCMinutes()).padStart(2,'0')};
 }
 function iconFor(w){const n=w.night;return {clear:`header-weather-${n?1:0}`,cloudy:`header-weather-${n?3:2}`,overcast:`header-weather-${n?5:4}`,fog:`header-weather-${n?11:10}`,lightRain:`header-weather-${n?7:6}`,heavyRain:'weather1',thunder:'weather2',lightSnow:'weather3',heavySnow:'weather4'}[w.type]||'header-weather-0'}
 const terms=['小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至'];
 const termMinutes=[0,21208,42467,63836,85337,107014,128867,150921,173149,195551,218072,240693,263343,285989,308563,331033,353350,375494,397447,419210,440795,462224,483532,504758];
 const termCache=new Map();
 function term(now=Date.now()){const year=new Date(now+OFFSET).getUTCFullYear();let dates=termCache.get(year);if(!dates){dates=termMinutes.map(m=>31556925974.7*(year-1900)+m*60000+Date.UTC(1900,0,6,2,5));termCache.set(year,dates)}let result='冬至';for(let i=0;i<24;i++){if(now>=dates[i])result=terms[i]}return result}
 return {get,iconFor,term,graph,transition,seasonAtLocal,SLOT,OFFSET};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GameWeather;
