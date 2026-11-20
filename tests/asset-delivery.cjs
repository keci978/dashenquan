const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const manifest=JSON.parse(fs.readFileSync('dist/asset-manifest.json','utf8')),html=fs.readFileSync('dist/index.html','utf8'),report=JSON.parse(fs.readFileSync('asset-report.json','utf8'));
for(const key of ['yard-day-v2','yard-night-v2','room-day-v2','room-night-v2','tea0','panda-sleep','lottery-jar','lottery-pavilion'])assert(manifest[key],key+' missing');
const core=report.files.filter(f=>!f.name.startsWith('travel-'));assert(core.reduce((n,f)=>n+f.bytes,0)<7*1048576);const motionBytes=report.files.filter(f=>f.name.startsWith('motion-')).reduce((n,f)=>n+f.bytes,0);
assert(motionBytes<2.25*1048576,'on-demand character clips exceed their budget');
assert(report.deployedBytes-motionBytes<20*1048576);
for(const [key,url] of Object.entries(manifest)){
 assert(/^assets\/[\w-]+\.[a-f0-9]{12}\.webp$/.test(url),url);assert(fs.existsSync('dist/'+url),url);
 const bytes=fs.readFileSync('dist/'+url),hash=crypto.createHash('sha256').update(bytes).digest('hex').slice(0,12);assert(url.includes('.'+hash+'.webp'));assert(bytes.length<(key.startsWith('travel-card-')?600:300)*1024,key+' exceeds single-image budget');
}
const compiledCss=fs.readFileSync('dist/'+html.match(/stylesheet" href="([^"]+)"/)[1],'utf8');
for(const match of (html+compiledCss).matchAll(/assets\/([\w.-]+\.(?:png|webp))/g))assert(fs.existsSync('dist/assets/'+match[1]),match[1]);
assert(!/<link[^>]+rel="preload"[^>]+(?:room-|yard-)/.test(html),'No four-scene static preload');
const bootstrap=html.match(/<script id="asset-bootstrap">([\s\S]*?)<\/script>/)[1];
for(const [hour,phase] of [[5,'night'],[6,'day'],[17,'day'],[18,'night']]){
 const now=Date.UTC(2026,10,12,hour-8),links=[];class Clock extends Date{static now(){return now}}
 const context={window:{},Date:Clock,document:{createElement:()=>({}),head:{appendChild:l=>links.push(l)}}};vm.runInNewContext(bootstrap,context);assert.equal(links.length,1);assert.equal(links[0].href,manifest['yard-'+phase+'-v2']);assert.equal(links[0].fetchPriority,'high');
}
for(const name of fs.readdirSync('dist').filter(n=>n.endsWith('.js')&&!n.startsWith('game-runtime.')&&n!=='asset-loader.js')){const source=fs.readFileSync('dist/'+name,'utf8');assert(!source.includes('assets/'),name+' bypasses manifest');assert(!/\.png/.test(source.replaceAll("'滚滚手账-'+c.name+'.png'","'download-name'")),name+' still requests PNG')}
console.log(`PASS: ${Object.keys(manifest).length} hashed WebP assets; ${(report.originalBytes/1048576).toFixed(2)} → ${(report.deployedBytes/1048576).toFixed(2)} MiB; resolved image references; current day/night preload only`);
