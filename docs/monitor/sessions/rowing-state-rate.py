import glob, gzip, json, os, collections
best_rate=("",0,0,0); best60=("",0); best10=("",0)
for path in sorted(glob.glob("docs/monitor/sessions/**/*.jsonl*", recursive=True)):
    if path.endswith(".jsonl") and os.path.exists(path+".gz"): continue
    op = gzip.open if path.endswith(".gz") else open
    ts=[]; prev=None
    with op(path,"rt") as fh:
        for line in fh:
            line=line.strip()
            if not line: continue
            try: ev=json.loads(line)
            except: continue
            if ev.get("dir")!="rx" or "hex" not in ev: continue
            if "ce060031" not in str(ev.get("char","")): continue
            b=bytes.fromhex(ev["hex"])
            if len(b)<10: continue
            v=b[9]
            if prev is not None and v!=prev: ts.append(ev["t"]/1000.0)
            prev=v
    if not ts: continue
    span_all=[]
    with op(path,"rt") as fh:
        for line in fh:
            try: ev=json.loads(line)
            except: continue
            if ev.get("dir")=="rx" and "ce060031" in str(ev.get("char","")): span_all.append(ev["t"]/1000.0)
    dur=span_all[-1]-span_all[0] if len(span_all)>1 else 0
    rate=len(ts)/(dur/60) if dur>0 else 0
    if rate>best_rate[1]: best_rate=(os.path.basename(path),rate,len(ts),dur)
    for w,best in ((60,"b60"),(10,"b10")):
        m=0
        for i,t0 in enumerate(ts):
            c=sum(1 for t in ts[i:] if t-t0<w)
            m=max(m,c)
        if w==60 and m>best60[1]: best60=(os.path.basename(path),m)
        if w==10 and m>best10[1]: best10=(os.path.basename(path),m)
print("worst changes/min:", best_rate)
print("worst in any 60s:", best60)
print("worst in any 10s:", best10)
