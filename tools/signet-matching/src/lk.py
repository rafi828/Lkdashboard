import os
import re,pandas as pd
df=pd.read_excel(os.environ['LK_FILE'])
def fr(s):
    s=s.replace('.','-') if re.match(r'^\d\.\d+/\d+$',s) else s
    return s
def parse(name,sub):
    n=str(name)
    if n.startswith('סט'): return None
    if sub=='בוקסות':
        if re.search(r'אלן|טורקס|מגנט|אימפקט|פלג',n): return None
        m=re.search(r'דרייב "(1/4|3/8|1/2|3/4|1)\b',n)
        if not m or m.group(1) not in ('1/4','3/8','1/2'): return None
        drv=m.group(1); deep='deep' if 'עמוקה' in n else ''
        pts=12 if '12PT' in n else 6
        rest=n[m.end():]
        mm=re.search(r'(\d+(?:\.\d)?)\s*מ"מ',rest)
        if mm: return dict(type='socket',drive=drv,deep=deep,pts=pts,unit='mm',size=mm.group(1),pts_explicit='12PT' in n or '6PT' in n)
        mi=re.search(r'מידה "([\d./-]+)',rest)
        if mi: return dict(type='socket',drive=drv,deep=deep,pts=pts,unit='inch',size=fr(mi.group(1)),pts_explicit='12PT' in n)
        return None
    if sub.startswith('מפתחות רינג פתוח') and 'ארוך' not in sub and 'נגד' not in sub:
        m=re.match(r'מפתח רינג פתוח (סופר קצר )?(\d+(?:\.\d)?) מ"מ$',n)
        if m: return dict(type='combo_short' if m.group(1) else 'combo',unit='mm',size=m.group(2))
        m=re.match(r'מפתח רינג פתוח אינצ\'י "([\d/-]+)$',n)
        if m: return dict(type='combo',unit='inch',size=fr(m.group(1)))
        return None
    if sub=="מפתחות רינג רצ'ט":
        m=re.match(r'מפתח (סופר קצר פתוח )?רינג רצ\'ט (\d+) מ"מ$',n)
        if m: return dict(type='ratchet_combo_short' if m.group(1) else 'ratchet_combo',unit='mm',size=m.group(2))
        m=re.match(r'מפתח רינג רצ\'ט "([\d/-]+)',n)
        if m: return dict(type='ratchet_combo',unit='inch',size=fr(m.group(1)))
    return None
recs=[]
for _,r in df.iterrows():
    sub=str(r['שם קבוצת משנה'])
    a=parse(r['שם פריט'],sub)
    if a: a.update(lk_sku=r['פריט'],lk_name=r['שם פריט'],brand=r['שם מותג לאתר'],sub=sub); recs.append(a)
L=pd.DataFrame(recs); L.to_pickle('lk.pkl')
print(len(L)); print(L.groupby(['type','unit']).size())
