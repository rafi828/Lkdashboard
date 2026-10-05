import pandas as pd
S=pd.read_pickle('sig.pkl');L=pd.read_pickle('lk.pkl')
S['drive']=S['drive'].fillna('');L['drive']=L['drive'].fillna('');L['deep']=L['deep'].fillna('')
S['pts']=S['pts'].fillna(0).astype(int);L['pts']=L['pts'].fillna(0).astype(int)
key=['type','drive','deep','pts','unit','size']
rows=[];used=set();lk_un=[]
for _,l in L.iterrows():
    m=S
    for k in key: m=m[m[k]==l[k]]
    if len(m):
        s=m.iloc[0];used.add(s.sku);notes=[]
        conf='ודאי'
        if l.type=='socket' and not l.get('pts_explicit',True) and l.pts==6:
            notes.append('6 צלעות לפי ברירת מחדל – לא מצוין בשם ל.כ')
        if l.type=='combo_short':
            conf='סביר';notes.append('ל.כ "סופר קצר" מול סיגנט "קצר" (94 מ"מ) – לוודא אורך')
        if l.type=='ratchet_combo':
            conf='סביר';notes.append('בשם ל.כ לא כתוב "פתוח" – בהנחה שזה רינג פתוח רצ׳ט')
            if l.unit=='mm' and int(l['size'])>=36: notes.append('בסיגנט מידות 36+ הן סדרה אחרת (מק"ט 0387xx)')
        if l.type=='ratchet_combo_short':
            conf='סביר';notes.append('ל.כ "סופר קצר" מול סיגנט "קצר" – לוודא אורך')
        if s.note: conf='סביר';notes.append(s.note)
        rows.append(dict(lk=l.lk_sku,lkn=l.lk_name,brand=l.brand,sku=s.sku,desc=s.desc,conf=conf,notes='; '.join(notes),page=s.page,price=s.price))
        continue
    # near match: same everything except points
    m=S
    for k in ['type','drive','deep','unit','size']: m=m[m[k]==l[k]]
    if len(m):
        s=m.iloc[0];used.add(s.sku)
        rows.append(dict(lk=l.lk_sku,lkn=l.lk_name,brand=l.brand,sku=s.sku,desc=s.desc,conf='לבדיקה',notes=f'מספר צלעות שונה: ל.כ {l.pts}, סיגנט {s.pts} – אין בסיגנט גרסה זהה',page=s.page,price=s.price))
        continue
    lk_un.append(l)
M=pd.DataFrame(rows)
LU=pd.DataFrame(lk_un); SU=S[~S.sku.isin(used)]
print(M.conf.value_counts()); print(len(LU),len(SU))


M.to_pickle('M.pkl');LU.to_pickle('LU.pkl');SU.to_pickle('SU.pkl')
