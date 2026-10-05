import os
import re,pandas as pd
from feats import feats,norm
from cats import CATS
SG=pd.read_pickle('SG.pkl')
df=pd.read_excel(os.environ['LK_FILE'])
SIZEP=('mm:','in:','T:','E:','PH:','PZ:','H:','n:','sz:','SL:')
def sizes(f): return {x for x in f if x.startswith(SIZEP)}
def lkcat(n):
    for k,lab,lr,sr in CATS:
        if re.search(lr,n): return k
    return ''
LAB={c[0]:c[1] for c in CATS}
bycat={k:g for k,g in SG.groupby('cat')}
def conflict(lf,sf):
    out=[]
    ld={x for x in lf if x.startswith('dr:')};sd={x for x in sf if x.startswith('dr:')}
    if ld and sd and not (ld&sd): out.append('dr')
    for k in ('deep','vde'):
        if (k in lf)!=(k in sf): out.append(k)
    if ('pt12' in lf)!=('pt12' in sf): out.append('pt12')
    return out
TYPEG={'sd':['פיליפס|PH','שטוח|SL','פוזי|PZ','טורקס|TORX'],'sd_set':['פיליפס|PH','שטוח|SL','פוזי|PZ','טורקס|TORX'],
 'bit':['פיליפס|PH','שטוח|SL','פוזי|PZ','טורקס|TORX|\\bT\\d','אלן|HEX|\\bH\\d'],
 'wr_ratchet':['פלקס|פרקי','כפול|דו צדדי'],'hex':['ידית T|T ידית','כדורי'],
 'drill':['מתכת|HSS|H\\.S\\.S|קובלט','בטון|SDS|וידיה','עץ','כוס','זכוכית|קרמיקה|אריחים']}
SURE={'sock','sock_imp','sock_bit','sock_spark','wr_combo','wr_ratchet','wr_ring','wr_open','hex','bit','drill'}
def typecheck(cat,ln,st):
    g=TYPEG.get(cat)
    if not g: return 'ok'
    lt=[p for p in g if re.search(p,ln)]
    if not lt: return 'ok'
    if any(re.search(p,st) for p in lt): return 'ok'
    if any(re.search(p,st) for p in g): return 'bad'
    return 'unk'
res=[]
for r in df.itertuples():
    name=norm(r._2); dep=r._4
    cat=lkcat(name)
    if any(x in str(dep) for x in ('רתכות','שרשראות','הרמה','שינוע','הידראולי','4x4','נגררים')) and cat not in ('glove','glasses','resp','helmet','clamp','cloth','brush','light','funnel','booster','garden','tie','knife','sciss','file'): cat='' 
    base=dict(lk=r.פריט,lkn=r._2,dep=dep,grp=r._6,sub=r._8,lkbrand=r._10,cat=LAB.get(cat,''))
    if not cat:
        res.append({**base,'status':'nocat','note':'לא זוהה סוג מוצר מתאים בקטלוג סיגנט'});continue
    if cat not in bycat:
        res.append({**base,'status':'nocat','note':f'אין בקטלוג סיגנט/פלד קטגוריה "{LAB[cat]}"'});continue
    lf=feats(name);ls=sizes(lf);C=bycat[cat]
    words=set(re.findall(r'[\u0590-\u05FFA-Za-z]{3,}',name))
    best=[]
    for s in C.itertuples():
        ss=sizes(s.f);inter=ls&ss
        cf=conflict(lf,s.f)
        wo=len(words&s.words)
        tc=typecheck(cat,name,s.desc)
        if tc=='bad': continue
        if ls and inter==ls:
            if not cf: lvl=3
            elif cf==['pt12']: lvl=1.5
            elif cf==['deep'] and 'deep' not in lf and s.src=='תיאור': lvl=2
            else: continue
        elif ls and inter:
            lvl=1 if not set(cf)-{'pt12'} else 0
            if not lvl: continue
        elif not ls:
            lvl=0.5 if wo>=3 else 0
            if not lvl: continue
        else: continue
        lb=1 if ({x for x in lf if x.startswith('len:')}&s.f) else 0
        best.append((lvl,len(inter),lb,wo,-len(ss-ls),s,tc))
    if not best:
        sz=sorted({x.split(':',1)[1] for f in C.f for x in sizes(f) if x[:3] in('mm:','in:')})
        res.append({**base,'status':'nomatch','note':f'קיימת קטגוריה מקבילה ({LAB[cat]}) אך לא נמצאה מידה/דגם תואם'+(f'. מידות בסיגנט: {", ".join(sz[:40])}' if sz else '')});continue
    best.sort(key=lambda x:x[:5],reverse=True)
    top=best[0];s=top[5];eq=[b for b in best if b[:5]==top[:5]]
    notes=[]
    if top[0]==3:
        multi=len(sizes(s.f))>4
        conf='ודאי' if (s.src=='טבלה' and len(eq)==1 and cat in SURE and top[6]=='ok') else ('לבדיקה' if multi else 'סביר')
        if top[6]=='unk': notes.append('סוג (ראש/חומר) לא מצוין בסיגנט – לוודא')
        elif conf=='סביר' and s.src=='טבלה' and len(eq)==1 and cat not in SURE: notes.append('התאמה לפי מידה וקטגוריה – לוודא דגם')
        if multi: notes.append('בעמוד סיגנט מופיעות מידות רבות (כנראה סט או כמה פריטים יחד)')
        if s.src!='טבלה':
            notes.append('התאמה לפי טקסט חופשי בעמוד – לוודא מול התמונה')
            if top[3]<2: conf='לבדיקה'
        if len(eq)>1: notes.append('כמה פריטים תואמים באותה מידה')
    elif top[0]==2: conf='סביר';notes.append('לא צוין עומק בסיגנט')
    elif top[0]==1.5: conf='לבדיקה';notes.append('מספר צלעות שונה')
    elif top[0]==1: conf='לבדיקה';notes.append('התאמה חלקית במידות: '+', '.join(sorted(ls-(ls&sizes(s.f))))+' לא נמצא')
    else: conf='לבדיקה';notes.append('אין מידה בשם ל.כ – התאמה לפי סוג ומילים בלבד')
    alts=[b[5].sku for b in best[1:4] if b[0]>=top[0]-0.5]
    if alts: notes.append('חלופות: '+', '.join(alts))
    res.append({**base,'status':'match','sku':s.sku,'desc':s.desc,'conf':conf,'note':'; '.join(notes),'page':s.page,'price':s.price,'brand':s.brand,'src':s.src})
R=pd.DataFrame(res);R.to_pickle('R.pkl')
print(R.status.value_counts());print(R[R.status=='match'].conf.value_counts())
