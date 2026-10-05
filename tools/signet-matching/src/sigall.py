import json,re,pandas as pd
d=json.load(open('pagetext.json'));meta=json.load(open('meta.json'))
idx=meta['idx'];titles={int(k):v for k,v in meta['titles'].items()}
SKUS=set(idx)
def tables(p):
    toks=d[str(p)].split();out={};cur=None;i=0;buf=[];ti=-1
    while i<len(toks):
        t=toks[i]
        if 'מידה' in t and 'מידות' not in t:
            ti+=1;unit='mm' if ('מ"מ' in t or 'מ״מ' in t) else ('inch' if "אינץ" in t else '')
            hdr=' '.join(toks[max(0,i-8):i])
            cur=(ti,unit)
            j=i
            while j<len(toks) and toks[j]!='מחיר' and j-i<30: j+=1
            if j-i>=30: cur=None;i+=1;continue
            i=j+1;buf=[];continue
        if cur is not None:
            if t in SKUS and i+1<len(toks) and buf:
                size=buf[0]
                if size in ('PH','PZ','T','SL','H','TX') and len(buf)>1 and re.fullmatch(r'\d+',buf[1]): size=size+buf[1];buf=[buf[0]]+buf[2:]
                if re.fullmatch(r'\d',size) and len(buf)>1 and re.fullmatch(r'\d+/\d+["\'’]*',buf[1]): size=size+'-'+buf[1]
                out[t]=dict(size=size,unit=cur[1],tbl=cur[0],dims=' '.join(buf[1:]),price=toks[i+1])
                buf=[];i+=2;continue
            buf.append(t)
            if len(buf)>14: cur=None;buf=[]
        i+=1
    return out
NOISE={'מק"ט:','מק"ט',':מק"ט','&','₪','מחיר:',':מחיר','מחיר'}
rows=[]
bypage={}
for s,p in idx.items(): bypage.setdefault(p,[]).append(s)
for p,skus in bypage.items():
    tb=tables(p); toks=d[str(p)].split()
    pos={}
    for i,t in enumerate(toks):
        if t in skus and t not in pos: pos[t]=i
    sp=sorted(pos.values())
    for s in skus:
        r=dict(sku=s,page=p,title=titles.get(p,''))
        if s in tb:
            r.update(tb[s]);r['src']='טבלה';r['ctx']=''
        else:
            r['src']='תיאור';r['size']='';r['unit']=''
            if s in pos:
                i=pos[s];k=sp.index(i)
                a=sp[k-1]+1 if k>0 else 0;b=sp[k+1] if k+1<len(sp) else len(toks)
                pr=toks[i+1:i+4];price=next((x for x in pr if re.fullmatch(r'[\d,]+\.\d\d',x)),'')
                ctx=[x for x in toks[a:b] if x not in NOISE and x!=s and x!=price and not re.fullmatch(r'[\d,]+\.\d\d',x)]
                r['ctx']=' '.join(ctx)[:300];r['price']=price
            else: r['ctx']='';r['price']=''
        rows.append(r)
S=pd.DataFrame(rows);S.to_pickle('sigall.pkl')
print(len(S));print(S.src.value_counts());print((S.ctx=='').sum()-(S.src=='טבלה').sum())
print(S[S.src=='תיאור'].sample(5,random_state=1)[['sku','page','title','ctx']].to_string())
