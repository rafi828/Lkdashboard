import re,json,pandas as pd
from sig_parse import d
SKU=re.compile(r'^0\d{5}$')
def parse(p):
    toks=d[str(p)].split();tables=[];cur=None;i=0;buf=[]
    while i<len(toks):
        t=toks[i]
        if 'מידה' in t:
            cur={'unit':'mm' if 'מ"מ' in t else 'inch','rows':[]};tables.append(cur)
            while i<len(toks) and toks[i]!='מחיר': i+=1
            i+=1;buf=[];continue
        if cur is not None:
            if SKU.match(t) and i+1<len(toks):
                if buf:
                    size=buf[0]
                    if re.fullmatch(r'\d',size) and len(buf)>1 and re.fullmatch(r'\d+/\d+["\'’]*',buf[1]): size=size+'-'+buf[1]
                    cur['rows'].append({'size':size,'sku':t,'price':toks[i+1]})
                buf=[];i+=2;continue
            buf.append(t)
            if len(buf)>12: cur=None;buf=[]
        i+=1
    return tables
def nsize(s):
    s=s.replace("''",'').replace('"','').replace('״','').replace("'",'').replace('’','').strip()
    s=s.replace('.','-') if re.match(r'^\d\.\d+/\d+$',s) else s
    return s
# page/table -> (type, drive, depth, points, label)
SPEC={
 (50,0):('combo',None,'',None,'מפתח רינג פתוח'),
 (51,0):('combo',None,'',None,'מפתח רינג פתוח'),(51,1):('combo',None,'',None,'מפתח רינג פתוח ג׳מבו'),(51,2):('combo',None,'',None,'מפתח רינג פתוח ג׳מבו'),
 (54,0):('combo_short',None,'',None,'מפתח רינג פתוח קצר'),(54,1):('combo_short',None,'',None,'מפתח רינג פתוח קצר'),
 (68,0):('ratchet_combo',None,'',None,'מפתח רינג פתוח רצ׳ט'),(69,0):('ratchet_combo',None,'',None,'מפתח רינג פתוח רצ׳ט'),
 (71,0):('ratchet_combo_short',None,'',None,'מפתח רינג פתוח רצ׳ט קצר'),(71,1):('ratchet_combo_short',None,'',None,'מפתח רינג פתוח רצ׳ט קצר'),
 (85,0):('socket','1/4','',6,''),(85,1):('socket','1/4','',6,''),
 (86,0):('socket','1/4','',12,''),(86,1):('socket','1/4','',12,''),
 (87,0):('socket','1/4','deep',6,''),(87,1):('socket','1/4','deep',6,''),(87,2):('socket','1/4','deep',12,''),
 (98,0):('socket','3/8','',6,''),(98,1):('socket','3/8','',6,''),
 (99,0):('socket','3/8','deep',6,''),(99,1):('socket','3/8','deep',6,''),
 (103,0):('socket','3/8','',12,''),(103,1):('socket','3/8','',12,''),(103,2):('socket','3/8','deep',12,''),
 (114,0):('socket','1/2','',6,''),
 (115,0):('socket','1/2','',6,''),
 (116,0):('socket','1/2','deep',6,''),(116,1):('socket','1/2','deep',6,''),
 (117,0):('socket','1/2','',12,''),(117,1):('socket','1/2','deep',12,''),
}
sig=[]
for (p,k),(typ,drv,dep,pts,lab) in SPEC.items():
    t=parse(p)[k]; rows=t['rows']
    if (p,k)==(114,0): rows=rows[:15]
    for r in rows:
        size=nsize(r['size']);note=''
        if r['sku']=='012320' and size=='10': size='20';note='בקטלוג סיגנט מופיעה מידה 10 – כנראה טעות דפוס (לפי רצף המק"ט: 20 מ"מ)'
        if r['sku']=='013112' and size=='1-1/6': size='1-1/16';note='בקטלוג סיגנט כתוב 1 1/6" – כנראה טעות דפוס (1-1/16")'
        unit=t['unit']; us='מ"מ' if unit=='mm' else '"'
        sz=f'{size} מ"מ' if unit=='mm' else f'{size}"'
        if typ=='socket':
            desc=f'בוקסה{" עמוקה" if dep else ""} {drv}" {"משושה" if pts==6 else "12 צלעות"} {sz}'
        else: desc=f'{lab} {sz}'
        sig.append(dict(type=typ,drive=drv,deep=dep,pts=pts,unit=unit,size=size,sku=r['sku'],desc=desc,page=p,price=r['price'],note=note))
S=pd.DataFrame(sig)
print(len(S), S.duplicated('sku').sum())
S.to_pickle('sig.pkl')
