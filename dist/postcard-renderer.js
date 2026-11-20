// Placement baselines in 1200 x 800 postcard coordinates, keyed by Destination_ID.
const PostcardRenderer=(()=>{
 const positions=[
  [315,670,446,641,265,694],[301,686,409,653,275,662],[280,683,395,657,243,670],
  [331,689,434,661,288,660],[290,675,421,665,366,697],[288,686,365,663,445,686],
  [276,678,337,657,416,688],[314,684,415,674,248,665],[303,689,384,667,266,667],
  [338,687,408,655,270,669],[323,689,396,672,280,662],[274,682,350,672,409,689],
  [266,682,342,659,403,685],[329,685,404,663,272,657],[310,683,373,661,246,663],
  [306,676,421,666,250,685],[284,688,374,663,450,678],[318,681,394,659,255,673],
  [289,686,381,678,432,664],[368,685,439,670,295,664],[324,677,420,673,252,665],
  [308,682,367,654,445,681],[286,679,357,657,425,682],[316,680,403,659,255,676],
  [297,681,369,655,430,677],[310,690,382,665,447,687],[330,679,419,664,258,657],
  [309,683,385,661,439,687],[314,683,388,659,253,669],[326,684,409,663,276,664]
 ];
 const palettes={'晴空':['#81bdda','#faf0cb'],'晚霞':['#ab818f','#ffd397'],'阴雨':['#80909d','#c2cbc4'],'飘雪':['#9eaebf','#edf3f4'],'璀璨星空':['#172d51','#687997'],'晨雾':['#aaaeb2','#f4e7ce']};
 const names={aguo:'阿果',jinjin:'金金',baiyu:'白羽',fangfang:'方方'};
 function load(key){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=assetUrl(key);});}
 function actor(x,im,px,py,h){const w=h*im.width/im.height;x.drawImage(im,px-w/2,py-h,w,h);}
 function foreground(x,p,r){
  const reeds=p.region==='西北'||['荒漠','草原','高原'].includes(p.terrain),lotus=p.terrain==='水乡'&&p.month>=4&&p.month<=8;
  const plum=!reeds&&!lotus&&(p.month===11||p.month<2);
  x.save();x.filter='blur(1.5px)';x.globalAlpha=.83;
  for(let i=0;i<12;i++){
   const bx=25+r()*125,by=745,dx=-5+r()*100,dy=by-45-r()*145;
   x.strokeStyle=reeds?'#867040':plum?'#66493e':'#526c48';x.lineWidth=plum?4:2;
   x.beginPath();x.moveTo(bx,by);x.quadraticCurveTo(bx-20,dy+28,dx,dy);x.stroke();
   x.fillStyle=reeds?'#b59a63':plum?'#d999a1':p.month>7?'#988145':'#54805c';
   for(let k=0;k<(plum?5:2);k++){
    x.beginPath();x.ellipse(dx+k*3,dy+k*3,lotus?23:plum?5:4,lotus?9:plum?4:15,-.7,0,2*Math.PI);x.fill();
   }
  }x.restore();
 }
 function light(x,p,r,px,py){
  const sky=p.sky;x.save();x.globalCompositeOperation='multiply';
  x.fillStyle=({'璀璨星空':'#68799c','阴雨':'#a2b2ba','晚霞':'#f4c6a0','晨雾':'#e4e3dc','飘雪':'#d0dce2'})[sky]||'#fff3dc';x.fillRect(0,0,1200,800);
  x.globalCompositeOperation='screen';
  if(sky==='阴雨'||sky==='飘雪'||sky==='璀璨星空'){
   const snow=sky==='飘雪',rain=sky==='阴雨';
   for(let i=0;i<(rain?150:100);i++){const a=r()*1200,b=r()*(sky==='璀璨星空'?150:790);x.fillStyle=x.strokeStyle='rgba(254,251,230,'+(.15+r()*.62)+')';x.beginPath();if(rain){x.moveTo(a,b);x.lineTo(a-4,b+15);x.stroke();}else{x.arc(a,b,1+r()*(snow?4:1.7),0,Math.PI*2);x.fill();}}
  }else{
   const g=x.createLinearGradient(120,30,850,650);g.addColorStop(0,sky==='晨雾'?'#f1e9d389':'#fff4bd55');g.addColorStop(1,'transparent');x.fillStyle=g;x.fillRect(0,0,1200,750);
  }
  if(p.action===6||p.lantern){const g=x.createRadialGradient(px+45,py-65,0,px+45,py-65,145);g.addColorStop(0,'#ffad547f');g.addColorStop(1,'transparent');x.fillStyle=g;x.fillRect(px-120,py-215,330,295);}
  x.restore();
 }
 async function compose(c){
  const p=c.postcard,[land,panda,friend]=await Promise.all([load('travel-landmark-'+p.destination),load('travel-action-'+p.action),p.friend?load('friend-'+p.friend):null]);
  const cv=document.createElement('canvas');cv.width=1200;cv.height=800;const x=cv.getContext('2d'),r=PostcardRules.random(p.seed);
  const g=x.createLinearGradient(0,0,0,630);const colors=palettes[p.sky];g.addColorStop(0,colors[0]);g.addColorStop(1,colors[1]);x.fillStyle=g;x.fillRect(0,0,1200,800);
  x.save();x.beginPath();x.rect(22,22,1156,714);x.clip();
  x.drawImage(land,0,land.height*.055,land.width,land.height*.87,22,22,1156,714);
  const coords=positions[p.destination-3001],px=coords[p.anchor*2],py=coords[p.anchor*2+1];
  if(friend)actor(x,friend,px+175,py-5,178);
  actor(x,panda,px,py,p.action===6?240:218);
  foreground(x,p,r);light(x,p,r,px,py);x.restore();
  x.fillStyle='#f8f0dc';x.fillRect(0,0,1200,22);x.fillRect(0,22,22,714);x.fillRect(1178,22,22,714);x.fillRect(0,736,1200,64);
  x.fillStyle='#97754220';for(let i=0;i<1500;i++){const a=r()*1200,b=r()*800;if(a<22||a>1178||b<22||b>736)x.fillRect(a,b,2,1);}
  x.fillStyle='#554634';x.font='26px cursive, serif';x.fillText(c.date+'  ·  滚滚手记',40,779);
  x.textAlign='right';x.font='22px serif';x.fillText(p.actionName,1154,778);
  x.save();x.translate(1057,96);x.rotate(-.11);x.fillStyle='#fff5dfdf';x.beginPath();x.ellipse(0,0,101,47,0,0,Math.PI*2);x.fill();
  x.strokeStyle=x.fillStyle='#974830';x.lineWidth=3;x.stroke();x.beginPath();x.ellipse(0,0,95,41,0,0,Math.PI*2);x.stroke();
  x.textAlign='center';x.font='bold 21px serif';x.fillText(c.name,0,-3,164);x.font='15px serif';x.fillText('山 川 邮 戳',0,24);x.restore();
  return cv;
 }
 const previews=new Map();
 function addSeal(cv){
  const x=cv.getContext('2d');x.save();x.setTransform(1,0,0,1,0,0);x.translate(614,766);x.rotate(-.09);x.strokeStyle=x.fillStyle='#ac462f';x.lineWidth=2;x.strokeRect(-36,-15,72,30);x.textAlign='center';x.font='bold 18px serif';x.fillText('山川留念',0,7,64);x.restore();
 }
 function markup(c,id=''){
  const ident=id?' id="'+id+'"':'',src=assetUrl(c.asset);
  const metadata=c.postcard?' data-composition="'+journalEscape(JSON.stringify({postcard:c.postcard,date:c.date,name:c.name}))+'" onload="PostcardRenderer.preview(this)"':'';
  return '<img'+ident+' src="'+src+'"'+metadata+' alt="'+journalEscape(c.name)+'明信片" draggable="false">';
 }
 async function preview(im){
  const key=im.dataset.composition;if(!key)return;im.removeAttribute('onload');
  try{if(!previews.has(key)){if(previews.size>=8)previews.delete(previews.keys().next().value);previews.set(key,compose(JSON.parse(key)).then(cv=>cv.toDataURL('image/jpeg',.91)));}
   im.src=await previews.get(key);
  }catch{previews.delete(key);}
 }
 async function fullArt(c){
  const im=await load(c.asset),cv=document.createElement('canvas');cv.width=1200;cv.height=800;
  cv.getContext('2d').drawImage(im,0,0,1200,800);return cv;
 }
 return {compose,fullArt,markup,preview,addSeal,names};
})();
