"""Keep editable originals out of the deployed bundle; emit right-sized hashed WebP."""
from pathlib import Path
from PIL import Image
import hashlib,json,re
root=Path(__file__).resolve().parents[1]
source=root/'source-assets';output=root/'dist/assets';output.mkdir(parents=True,exist_ok=True)
# Retired sheets/backgrounds stay in source control but are not shipped to browsers.
retired={'header-weather-sheet','panda-sleep-original','yard-feedback','room'}
# Keep every statically referenced asset, plus the known dynamic animation families.
application='\n'.join(p.read_text() for p in (root/'dist').glob('*.js') if not p.name.startswith('game-runtime.'))+'\n'+(root/'dist/style.css').read_text()
def needed(name):
 dynamic=(name.startswith(('motion-','travel-friend-','travel-landmark-','travel-action-','travel-card-','travel-gift-','tea','read','header-weather','weather','friend-')) or name in {'shop-clerk0','shop-clerk4'} or re.fullmatch(r'(yard|room)-(day|night)-v2',name) or re.fullmatch(r'shoot-stage-[0-2]',name))
 return dynamic or bool(re.search(r'(?<![\w-])'+re.escape(name)+r'(?![\w-])',application))
manifest={};report=[];valid=set()
try: previous={r['name']:r for r in json.loads((root/'asset-report.json').read_text())['files']}
except (OSError,KeyError): previous={}
for p in sorted(source.iterdir()):
 if p.suffix.lower() not in ('.png','.webp') or p.stem in retired or not needed(p.stem):continue
 name=p.stem;im=Image.open(p);im=im.convert('RGBA' if 'A' in im.getbands() else 'RGB')
 if name in {'yard-day-v2','yard-night-v2','room-day-v2','room-night-v2','lottery-pavilion'}:size=(800,1422);quality=76
 elif name.startswith('envelope-') and name.endswith('seal'):size=(192,192);quality=86
 elif name.startswith('envelope-'):size=(700,480);quality=83
 elif name.startswith('travel-landmark-'):size=(640,480);quality=66
 elif name.startswith(('travel-friend-','travel-card-ssr-')):size=(1200,800);quality=77
 elif name.startswith('travel-card-'):size=(1200,900);quality=81
 elif name=='journal-qingcheng':size=(800,1150);quality=82
 elif name.startswith(('header-weather','weather')):size=(128,128);quality=85
 elif name.startswith('icon'):size=(192,192);quality=85
 elif name.startswith(('travel-card-','travel-gift-','tea','read')):size=(384,384);quality=85
 elif name=='panda-sleep':size=(640,320);quality=85
 elif name=='lottery-jar':size=(512,512);quality=86
 elif name.startswith('friend-') and not name.startswith(('friend-food','friend-ticket')):size=(448,448);quality=85
 elif name.startswith(('friend-food','friend-ticket')):size=(192,192);quality=87
 elif name.startswith(('shop-stall','shop-sign')):size=(880,400);quality=85
 else:size=(384,384);quality=85
 fingerprint=hashlib.sha256(p.read_bytes()+repr((size,quality,1)).encode()).hexdigest()
 prior=previous.get(name,{})
 if prior.get('sourceHash')==fingerprint and (output/prior.get('file','missing')).is_file():
  valid.add(prior['file']);manifest[name]='assets/'+prior['file'];report.append(prior);continue
 im.thumbnail(size,Image.Resampling.LANCZOS)
 temporary=output/(name+'.build.webp');im.save(temporary,'WEBP',quality=quality,method=6,alpha_quality=95,exact=True)
 if name.startswith('motion-'): temporary.write_bytes(p.read_bytes())
 data=temporary.read_bytes();revision=hashlib.sha256(data).hexdigest()[:12];filename=f'{name}.{revision}.webp';target=output/filename
 if not target.exists():temporary.replace(target)
 else:temporary.unlink()
 valid.add(filename);manifest[name]='assets/'+filename
 report.append({'name':name,'file':filename,'sourceHash':fingerprint,'originalBytes':p.stat().st_size,'bytes':len(data),'width':im.width,'height':im.height,'alpha':im.mode=='RGBA'})
for p in output.iterdir():
 if p.suffix.lower() in ('.png','.webp') and p.name not in valid:p.unlink()
(root/'dist/asset-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+'\n')
(root/'asset-report.json').write_text(json.dumps({'originalBytes':sum(p.stat().st_size for p in source.iterdir() if p.is_file()),'deployedBytes':sum(r['bytes'] for r in report),'files':report},ensure_ascii=False,indent=2)+'\n')
print(f"Optimized {len(report)} images: {sum(r['bytes'] for r in report)/1048576:.2f} MiB deployed")
