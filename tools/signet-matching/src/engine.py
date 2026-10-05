import re,json,pandas as pd
from feats import feats,norm
from cats import CATS,SIGCATS as _SC
d=json.load(open('pagetext.json'))
S=pd.read_pickle('sigall.pkl');P=pd.read_pickle('sig.pkl').set_index('sku')
SIGCATS=_SC
def heading(p):
    toks=norm(d[str(p)]).split()
    if toks and toks[0]==str(p): toks=toks[1:]
    out=[]
    for t in toks[:16]:
        if 'מידה' in t or t in ('מק"ט:','מק"ט'): break
        out.append(t)
    return ' '.join(out)
def sigcat(*texts):
    for t in texts:
        if not t: continue
        for k,lab,lr,sr in SIGCATS:
            if re.search(sr,t): return k
    return ''
DISC={'vde','deep','pt12'}
def brand(p): return 'SIGNET' if p<476 else ('KENDO' if 528<=p<=613 else 'מותג אחר (פלד)')
recs=[]
for r in S.itertuples():
    h=heading(r.page);title=norm(r.title)
    cat=sigcat(title,h,r.ctx[:80] if r.ctx else '')
    disc={f for f in feats(title+' '+h) if f.startswith('dr:') or f in DISC}
    if r.src=='טבלה':
        sz=feats('',r.unit,r.size); f=disc|sz
        desc=f'{h if title in h else title+" "+h} | מידה {r.size}{" מ״מ" if r.unit=="mm" else (" אינץ׳" if r.unit=="inch" else "")}'.replace('  ',' ')
    else:
        f=disc|feats(r.ctx); desc=f'{title} | {r.ctx[:160]}'
    if r.sku in P.index:
        q=P.loc[r.sku]; desc=q.desc
        f={('mm:' if q.unit=='mm' else 'in:')+q['size']}|({'dr:'+q.drive} if isinstance(q.drive,str) and q.drive else set())|({'deep'} if q.deep=='deep' else set())|({'pt12'} if q.pts==12 else set())
        if q.type in('ratchet_combo','ratchet_combo_short'): cat='wr_ratchet'
        elif q.type.startswith('combo'): cat='wr_combo'
        else: cat='sock'
    recs.append(dict(sku=r.sku,page=r.page,cat=cat,f=f,desc=re.sub(r'\s+',' ',desc).strip(),price=r.price,src=r.src,brand=brand(r.page),words=set(re.findall(r'[\u0590-\u05FFA-Za-z]{3,}',title+' '+h+' '+(r.ctx or '')))))
SG=pd.DataFrame(recs);SG.to_pickle('SG.pkl')
print(SG.cat.value_counts().head(40).to_dict());print('nocat',(SG.cat=='').sum())
