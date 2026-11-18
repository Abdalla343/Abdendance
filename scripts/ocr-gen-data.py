# Synthetic Arabic-Indic digit lines: random fonts, backgrounds, rotation, blur, noise, shadows, JPEG.
import glob, json, os, random, re, sys, numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
N_TRAIN, N_TEST = int(sys.argv[1]), int(sys.argv[2])
random.seed(7); np.random.seed(7)
fonts=sorted(glob.glob("/tmp/fonts/ttf/*.ttf")); fam=lambda p: re.sub(r"-\d+\.ttf","",os.path.basename(p))
HELD={"cairo","mada","rubik","amiri","noto-kufi-arabic"}
SKIP={"vibes","handjet","jomhuria","katibeh","gulzar","marhey","playpen-sans-arabic","blaka","qahiri","aref-ruqaa"}
fonts=[f for f in fonts if fam(f) not in SKIP]
train_f=[f for f in fonts if fam(f) not in HELD]; test_f=[f for f in fonts if fam(f) in HELD]
print(len(train_f),"train font files /",len(test_f),"held-out font files",flush=True)
AR=str.maketrans("0123456789","٠١٢٣٤٥٦٧٨٩")
def render(font_path, digits):
    W,H=1000,210; size=random.randint(44,86)
    f=ImageFont.truetype(font_path,size)
    txt=digits.translate(AR); dummy=ImageDraw.Draw(Image.new("L",(1,1)))
    bb=dummy.textbbox((0,0),txt,font=f)
    tw=bb[2]-bb[0]
    if tw>W*0.95: size=int(size*W*0.9/tw); f=ImageFont.truetype(font_path,size); bb=dummy.textbbox((0,0),txt,font=f); tw=bb[2]-bb[0]
    tint=np.array([random.randint(190,248) for _ in range(3)]); tint=np.clip(tint+random.randint(-12,12),150,250)
    img=np.ones((H,W,3),np.float32)*tint
    # faint guilloche-like pattern
    if random.random()<0.6:
        amp=random.uniform(4,22); xs=np.arange(W)
        for k in range(random.randint(6,24)):
            y0=random.uniform(0,H); fr=random.uniform(0.004,0.02); ph=random.uniform(0,6.28); a=random.uniform(8,50)
            ys=(y0+a*np.sin(xs*fr+ph)).astype(int); ok=(ys>=0)&(ys<H)
            for t in range(random.choice([1,1,2])):
                yy=np.clip(ys+t,0,H-1); img[yy[ok],xs[ok]]-=amp
    txt_img=Image.new("L",(W,H),0); d=ImageDraw.Draw(txt_img)
    x=random.randint(10,max(11,W-tw-10)) - bb[0]; y=(H-(bb[3]-bb[1]))//2 + random.randint(-14,14) - bb[1]
    d.text((x,y),txt,font=f,fill=255)
    m=np.asarray(txt_img).astype(np.float32)/255
    r=random.random()
    if r<0.2: m=cv2.dilate(m,np.ones((2,2),np.uint8))
    elif r<0.3: m=cv2.erode(m,np.ones((2,2),np.uint8))
    col=np.array([random.randint(5,70) for _ in range(3)],np.float32)
    img=img*(1-m[...,None])+col*m[...,None]
    # shadow
    if random.random()<0.5:
        g=np.linspace(random.uniform(0.5,1),1,W); g=g if random.random()<0.5 else g[::-1]; img*=g[None,:,None]
    # geometry
    ang=random.uniform(-4,4); sh=random.uniform(-0.08,0.08)
    M=cv2.getRotationMatrix2D((W/2,H/2),ang,random.uniform(0.9,1.08)); M[0,1]+=sh
    img=cv2.warpAffine(img,M,(W,H),borderMode=cv2.BORDER_REPLICATE)
    # blur / noise / contrast / jpeg
    if random.random()<0.6: img=cv2.GaussianBlur(img,(0,0),random.uniform(0.4,1.8))
    img+=np.random.normal(0,random.choice([0,0,4,10,18]),img.shape)
    if random.random()<0.3: c=random.uniform(0.4,0.8); img=128+(img-128)*c+ (1-c)*random.uniform(-10,60)
    if random.random()<0.08: img=255-img  # light text on dark card
    img=np.clip(img,0,255).astype(np.uint8)
    return cv2.imencode(".jpg",img,[cv2.IMWRITE_JPEG_QUALITY,random.randint(45,92)])[1]
manifest=[]
def gen(split,n,pool):
    for i in range(n):
        d=random.choice("23")+"".join(random.choice("0123456789") for _ in range(13))
        if random.random()<0.1: d=d[:random.randint(4,10)]   # short numeric codes
        fp=random.choice(pool); fn=f"{split}_{i:05d}.jpg"
        open(f"/tmp/train/png/{fn}","wb").write(render(fp,d).tobytes())
        manifest.append({"file":fn,"digits":d,"split":split,"font":fam(fp)})
gen("train",N_TRAIN,train_f); gen("test",N_TEST,test_f)
json.dump(manifest,open("/tmp/train/manifest.json","w")); print("done",len(manifest))
