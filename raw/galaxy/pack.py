import numpy as np, os
from PIL import Image
S='src'; Q=82
def save(im,name,q=Q):
    im.save(name,'WEBP',quality=q,method=6); print(name, im.size, os.path.getsize(name))
# sky: crop 16:9 to 2:1 (centre), wrap left-right by crossfading with a half-width roll
sk=Image.open(f'{S}/sky2.png').convert('RGB'); w,h=sk.size; ch=w//2; sk=sk.crop((0,(h-ch)//2,w,(h-ch)//2+ch)).resize((2048,1024),Image.LANCZOS)
a=np.asarray(sk).astype(np.float32); r=np.roll(a,1024,axis=1)
x=np.linspace(0,1,2048); wgt=np.clip(np.sin(np.pi*x)*1.6,0,1)[None,:,None]  # 1 in the middle, 0 at both edges
out=a*wgt+r*(1-wgt); sky=Image.fromarray(out.clip(0,255).astype(np.uint8))
save(sky,'sky.webp',80); save(sky.resize((1024,512),Image.LANCZOS),'sky-1024.webp',80)
# core / ring: black floor crushed so additive drawing leaves no grey square, edges masked to the quad
def additive(fn,size,out):
    im=Image.open(f'{S}/{fn}').convert('RGB').resize((size,size),Image.LANCZOS); a=np.asarray(im).astype(np.float32)
    a=np.clip((a-10)*255/245,0,255)
    yy,xx=np.mgrid[0:size,0:size]; d=np.hypot(xx-size/2+.5,yy-size/2+.5)/(size/2)
    a*=np.clip((1-d)/0.12,0,1)[...,None]
    save(Image.fromarray(a.astype(np.uint8)),out)
additive('core.png',512,'core-glow.webp'); additive('ring.png',512,'ring.webp')
# glows: Meshy's colour (the brightest part of its sprite), drawn as a clean round gaussian on black
for c in ['cyan','mint','gold','violet','red']:
    a=np.asarray(Image.open(f'{S}/glow2-{c}.png').convert('RGB')).astype(np.float32).reshape(-1,3)
    lum=a.sum(1); col=a[lum>=np.percentile(lum,99)].mean(0); g0=col.mean(); col=np.clip(g0+(col-g0)*2.4,0,None); col=col*255/col.max()
    n=256; yy,xx=np.mgrid[0:n,0:n]; d=np.hypot(xx-n/2+.5,yy-n/2+.5)/(n/2)
    f=np.exp(-(d/0.5)**2*2.0)*np.clip((1-d)/0.15,0,1)
    core=np.exp(-(d/0.08)**2)*0.22   # a whiter centre
    rgb=col[None,None,:]*f[...,None]+255*core[...,None]*f[...,None]
    save(Image.fromarray(rgb.clip(0,255).astype(np.uint8)),f'glow-{c}.webp')
# key art: crop the stray glint in the top-left corner, 1600x900 and 1200x630
k=Image.open(f'{S}/key.png').convert('RGB'); w,h=k.size; k=k.crop((40,int(40*h/w),w,h)); k=k.resize((1600,900),Image.LANCZOS)
save(k,'key-wide.webp',80)
w,h=k.size; ch=int(w*630/1200); k2=k.crop((0,(h-ch)//2,w,(h-ch)//2+ch)).resize((1200,630),Image.LANCZOS); save(k2,'key-1200x630.webp',80)
