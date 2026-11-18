# Trains the digit-cell classifier on features exported by ocr-extract.ts and writes src/ocr/arabicDigitModel.json.
#   python3 scripts/ocr-train.py /tmp/train
import json, sys, numpy as np
from sklearn.neural_network import MLPClassifier
d=sys.argv[1] if len(sys.argv)>1 else "/tmp/train"
rows=json.load(open(f"{d}/features.json"))
def collect(split):
    X=[];y=[];fam=[]
    for r in rows:
        if r["split"]!=split: continue
        for c in r["cells"]:
            if c["label"] is not None: X.append(c["f"]); y.append(c["label"]); fam.append(r["font"])
    return np.array(X,np.float32),np.array(y),np.array(fam)
Xtr,ytr,_=collect("train"); Xte,yte,fte=collect("test")
import os
if os.environ.get("ALL_FONTS")=="1":   # shipped model: also learn from the held-out families (no unseen-font measurement possible)
    Xtr=np.vstack([Xtr,Xte]); ytr=np.concatenate([ytr,yte]); print("ALL_FONTS: training on held-out families too")
print("train cells",len(ytr),"held-out-font cells",len(yte))
clf=MLPClassifier(hidden_layer_sizes=(128,64),activation="relu",alpha=1e-4,batch_size=128,max_iter=80,early_stopping=True,validation_fraction=0.1,n_iter_no_change=8,random_state=1)
clf.fit(Xtr,ytr)
print("train acc %.4f | HELD-OUT-FONT cell acc %.4f"%(clf.score(Xtr,ytr),clf.score(Xte,yte)))
for f in sorted(set(fte)): m=fte==f; print("   %-18s %.4f (%d cells)"%(f,clf.score(Xte[m],yte[m]),m.sum()))
cm=np.zeros((10,10),int)
for a,b in zip(yte,clf.predict(Xte)): cm[a][b]+=1
print("most confused:",sorted([(int(cm[i][j]),f"{i}->{j}") for i in range(10) for j in range(10) if i!=j],reverse=True)[:6])
r=lambda a:[[round(float(v),4) for v in row] for row in a]
model={"w1":r(clf.coefs_[0]),"b1":[round(float(v),4) for v in clf.intercepts_[0]],"w2":r(clf.coefs_[1]),"b2":[round(float(v),4) for v in clf.intercepts_[1]],"w3":r(clf.coefs_[2]),"b3":[round(float(v),4) for v in clf.intercepts_[2]]}
json.dump(model,open("src/ocr/arabicDigitModel.json","w"),separators=(",",":"))
import os; print("model size KB:",os.path.getsize("src/ocr/arabicDigitModel.json")//1024)
