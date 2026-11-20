from pathlib import Path
import hashlib,re,json,subprocess,sys
root=Path(__file__).resolve().parents[1]/'dist'
subprocess.run([sys.executable,str(Path(__file__).with_name('optimize-assets.py'))],check=True)
assets=json.loads((root/'asset-manifest.json').read_text())
def asset_reference(match):
 name=re.sub(r'\.[a-f0-9]{12}$','',match.group(1))
 if name not in assets:raise RuntimeError('Missing image asset: '+name)
 return assets[name]
def resolve_assets(text):return re.sub(r'assets/([a-zA-Z0-9_.-]+)\.(?:png|webp)',asset_reference,text)
parts=['game-audio.js','asset-loader.js','weather-engine.js','yard-interactions.js','rest-interactions.js','character-motion.js','app.js','item-config.js','collection-catalog.js','travel-engine.js','shop.js','friend-interactions.js','lottery-interactions.js','postcard-renderer.js','journal-interactions.js','away-yard.js','envelope-interactions.js']
source=';\n'.join((root/name).read_text() for name in parts)+'\n;GameTravel.initialize(state);render();\n'
revision=hashlib.sha256(source.encode()).hexdigest()[:12];name=f'game-runtime.{revision}.js'
for path in root.glob('game-runtime.*.js'):
 if path.name!=name:path.unlink()
(root/name).write_text(source)
css=resolve_assets((root/'style.css').read_text()).encode();cssname='style.'+hashlib.sha256(css).hexdigest()[:12]+'.css'
for path in root.glob('style.*.css'):
 if path.name!=cssname:path.unlink()
(root/cssname).write_bytes(css)
p=root/'index.html';html=p.read_text();html=re.sub(r'<link rel="stylesheet" href="[^"]+">',f'<link rel="stylesheet" href="{cssname}">',html)
html=re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',html)
html=re.sub(r'<link\b(?=[^>]*\brel="preload")(?=[^>]*\bas="image")[^>]*>','',html)
# Only the current phase of the entry scene competes for high-priority bandwidth.
bootstrap='<script id="asset-bootstrap">window.BAMBOO_ASSETS='+json.dumps(assets,separators=(',',':'))+';(()=>{const h=new Date(Date.now()+28800000).getUTCHours(),phase=h<6||h>=18?"night":"day",link=document.createElement("link");link.rel="preload";link.as="image";link.fetchPriority="high";link.href=window.BAMBOO_ASSETS["yard-"+phase+"-v2"];document.head.appendChild(link)})();</script>'
html=html.replace('</head>',bootstrap+'</head>');html=resolve_assets(html)
html=html.replace('</body>',f'<script defer src="{name}"></script></body>');p.write_text(html)
print('Versioned runtime:',name,cssname)
