"""Bake weighted 2D joint poses into transparent WebP clips for the mobile game."""
from pathlib import Path
import math
import numpy as np
from PIL import Image, ImageDraw

src = Path(__file__).resolve().parents[1] / 'source-assets'
# Each bone has an anchor, influence radius, rotational excursion and phase offset.
body = (.50,.74,.32,2,0)
head = (.50,.42,.30,5,.12)
rigs = {
 'aguo': [body,(.29,.72,.38,15,.18),(.65,.39,.20,5,.05)],
 'jinjin': [body,(.52,.53,.28,-7,.1),(.62,.43,.19,13,.25),(.78,.78,.26,12,.35)],
 'baiyu': [(.52,.70,.25,2,0),(.53,.43,.30,10,.07),(.54,.60,.29,-7,.25)],
 'fangfang': [body,(.48,.38,.20,3,.18),(.74,.76,.25,7,.28)],
 'read': [body,head,(.26,.68,.18,-5,.25),(.71,.66,.18,5,.3)],
 'eat': [body,(.50,.44,.26,5,.1),(.30,.63,.21,-9,.22),(.68,.60,.20,9,.22),(.30,.22,.16,9,.30)],
 'diary': [body,head,(.60,.52,.24,13,.15),(.38,.80,.14,12,0),(.63,.80,.14,-12,0)],
 'brush': [body,head,(.62,.47,.28,15,.18)],
 'tea': [body,head,(.51,.59,.24,7,.2)],
 'door': [body,(.74,.46,.22,19,.1),(.30,.80,.18,9,0),(.61,.82,.16,-9,0)]
}
friends = ('aguo','jinjin','baiyu','fangfang')
def bake(key, art, reaction=False):
    frame = Image.open(art).convert('RGBA')
    frame.thumbnail((164,164),Image.Resampling.LANCZOS)
    # Preserve natural proportions while giving extremities room to swing.
    w,h=frame.size
    canvas=Image.new('RGBA',(w+20,h+20))
    canvas.paste(frame,(10,10))
    w,h=canvas.size
    x,y=np.meshgrid(np.arange(0,w+16,12),np.arange(0,h+16,12))
    bones=list(rigs[key])
    if reaction and key=='baiyu': bones += [(.42,.49,.38,22,.12),(.60,.51,.38,-22,.12)]
    if reaction and key=='fangfang': bones += [(.49,.32,.24,-8,.12)]
    frames=[]
    total=12 if reaction else 16
    for i in range(total):
        t=i/(total-1 if reaction else total)
        dx=np.zeros_like(x,dtype=float);dy=dx.copy()
        for ax,ay,r,angle,phase in bones:
            px,py=x/w-ax,y/h-ay
            weight=np.exp(-(px**2+py**2)/(r*r*.58))
            swing=math.sin(2*math.pi*(t+phase))
            if reaction: swing*=math.sin(math.pi*t)
            a=math.radians(angle*swing)
            dx+=weight*((math.cos(a)-1)*px*w+math.sin(a)*py*h)
            dy+=weight*(-math.sin(a)*px*w+(math.cos(a)-1)*py*h)
        mesh=[]
        for j in range(len(y)-1):
            for k in range(x.shape[1]-1):
                pts=[(j,k),(j+1,k),(j+1,k+1),(j,k+1)]
                mesh.append(((int(x[j,k]),int(y[j,k]),int(x[j,k+1]),int(y[j+1,k])),tuple(v for row,col in pts for v in (x[row,col]+dx[row,col],y[row,col]+dy[row,col]))))
        source=canvas
        if key in ('read','tea'):
            sequence=[0,0,0,1,2,3,4,5,4,3,2,1,0,0,0,0]
            pose=Image.open(src/f'{key}{sequence[i]}.png').convert('RGBA')
            pose=pose.resize(frame.size,Image.Resampling.LANCZOS)
            source=Image.new('RGBA',canvas.size);source.paste(pose,(10,10))
        painted=source.transform(canvas.size,Image.Transform.MESH,mesh,Image.Resampling.BICUBIC)
        if key=='eat' and .3<t<.85:
            draw=ImageDraw.Draw(painted)
            for k in range(3):
                lx=int(w*(.53+.055*k+.07*t));ly=int(h*(.36+(t-.3)*.68+.03*k))
                draw.polygon([(lx,ly),(lx+4,ly+2),(lx+2,ly+3)],fill='#99a54d')
        frames.append(painted)
    suffix='-react' if reaction else ''
    frames[0].save(src/f'motion-{key}{suffix}.webp',save_all=True,append_images=frames[1:],duration=110 if reaction else 165,loop=1 if reaction or key=="door" else 0,quality=59,method=4)
if __name__=='__main__':
    for key in rigs:
        if key in friends: art=src/f'rig-idle-{key}.webp'
        elif key in ('diary','brush','eat'): art=src/f'pose-{key}.webp'
        elif key=='door': art=src/'travel-action-1.webp'
        else: art=src/f'{key}0.png'
        bake(key,art)
        if key in friends: bake(key,src/f'rig-react-{key}.webp',True)
