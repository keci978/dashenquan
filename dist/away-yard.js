// Departure UI reads the existing journey and unread mail; it never creates rewards or letters.
const TravelYard=(()=>{
 const steps=[{x:55,y:47,size:20,turn:-22},{x:65,y:51,size:25,turn:8},{x:68,y:57,size:31,turn:-15},{x:68,y:68,size:38,turn:12},{x:72,y:78,size:46,turn:-12}];
 const isAway=(s,place)=>place==='yard'&&s.mode==='travel';
 const unread=s=>Math.max(0,Math.floor(Number(s.mail)||0));
 const progress=(s,now=Date.now())=>Math.max(0,Math.min(1,(now-s.start)/Math.max(1,s.end-s.start)));
 const paw=`<svg viewBox="0 0 80 86" aria-hidden="true" focusable="false"><ellipse cx="12" cy="29" rx="8" ry="12" transform="rotate(-25 12 29)"/><ellipse cx="29" cy="16" rx="8.5" ry="12.5" transform="rotate(-10 29 16)"/><ellipse cx="49" cy="16" rx="8.5" ry="12.5" transform="rotate(10 49 16)"/><ellipse cx="66" cy="29" rx="8" ry="12" transform="rotate(25 66 29)"/><path d="M14 62C14 52 23 47 28 39C33 31 46 31 51 39C57 47 67 52 67 63C67 77 55 79 41 74C29 79 14 77 14 62Z"/></svg>`;
 return {steps,isAway,unread,progress,paw};
})();
function travelFootprintsMarkup(now=Date.now()){
 if(!TravelYard.isAway(state,scene))return '';
 const p=TravelYard.progress(state,now);
 return TravelYard.steps.map((point,i)=>`<button class="away-step ${i>=5-Math.ceil(p*5)?'passed':''}" style="left:${point.x}%;top:${point.y}%;--paw-size:${point.size}px;--turn:${point.turn}deg;--pulse-delay:${i*.38}s" onclick="travelTrailClick()" aria-label="脚印${i+1}：查看旅程">${TravelYard.paw}</button>`).join('')+'<span class="away-trail-caption">点点脚印，看看旅程 <span aria-hidden="true">↗</span></span>';
}
function travelAwayMarkup(){
 if(!TravelYard.isAway(state,scene))return '';
 const count=TravelYard.unread(state);
 return `<div class="away-yard-heading"><div class="away-yard-scroll">${image('icon6')}<div><b>滚滚去远方看风景了</b><small>听溪水，等它带回新的故事</small></div></div><button class="away-mail-link" onclick="openPanel('mail')" aria-label="${count?'查看'+count+'封未读来信':'查看信箱，等待远方来信'}"><span aria-hidden="true">✉</span><b>旅途中 · ${count?'待拆 '+count+' 封来信':'等待远方来信'}</b><i aria-hidden="true">›</i></button></div>${count?'<button class="away-new-letter" onclick="openPanel(\'mail\')" aria-label="信箱有新来信"><span>新来信</span><i aria-hidden="true"></i></button>':''}`;
}
function renderAwayYard(){const away=TravelYard.isAway(state,scene);$('footprints').hidden=!away;$('footprints').innerHTML=travelFootprintsMarkup();$('away-scene-ui').innerHTML=travelAwayMarkup()}
function travelTrailClick(){updateTime();if(state.mode==='travel')openPanel('journey');else{render();if(state.lastTrip)openPanel('return')}}
