import re
def norm(t):
    t=str(t).replace('״','"').replace('׳',"'").replace('’',"'").replace("''",'"').replace('”','"').replace('“','"')
    return t
FR=r'\d+(?:[-.]\d+)?/\d+|\d+'
def nm(v):
    try:
        x=float(v); return str(int(x)) if x==int(x) else str(x)
    except: return v
def feats(t, unit_hint=None, size=None):
    t=norm(t);f=set()
    for m in re.finditer(r'(?:אורך|באורך)\s*:?\s*(\d+)\s*(?:מ"מ|מ״מ|mm|L)?|(?<![\d.])(\d{2,3})\s*L\b',t): f.add('len:'+(m.group(1) or m.group(2)))
    t=re.sub(r'(?:אורך|באורך)\s*:?\s*(\d+)\s*(?:מ"מ|מ״מ|mm|L)?|(?<![\d.])(\d{2,3})\s*L\b',' ',t)
    for m in re.finditer(r'(?:דרייב|דר\'|דר|DR\.?|D)\s*"?\s*(1/4|3/8|1/2|3/4|1)(?!\d|/)',t): f.add('dr:'+m.group(1))
    for m in re.finditer(r'(?<![\d/.])(1/4|3/8|1/2|3/4)"\s*(?:בוקס|הנעה|אביזר|סט|מגש|ידית|רצ|מאריך)',t): f.add('dr:'+m.group(1))
    for m in re.finditer(r'(?:הנעה|לבוקסות|בוקסות)\s*(1/4|3/8|1/2|3/4)"',t): f.add('dr:'+m.group(1))
    tt=re.sub(r'(?:דרייב|DR\.?)\s*"?\s*(1/4|3/8|1/2|3/4|1)(?!\d|/)',' ',t)
    for m in re.finditer(r'(?<![\d.])(\d+)\s*[*xX×\-]\s*(\d+)\s*(?:מ"מ|מ״מ|mm|MM)',tt):
        a,b=sorted([int(m.group(1)),int(m.group(2))]); f.add(f'mm:{a}-{b}')
    tt=re.sub(r'(?<![\d.])(\d+)\s*[*xX×\-]\s*(\d+)\s*(?:מ"מ|מ״מ|mm|MM)',' ',tt)
    for m in re.finditer(r'(?<![\d.])(\d+(?:\.\d+)?)\s*(?:מ"מ|מ״מ|מ”מ|mm|MM|מ\'מ)',tt): f.add('mm:'+nm(m.group(1)))
    for m in re.finditer(r'"\s*('+FR+r')(?![\d/])',tt):
        v=re.sub(r'[. ]','-',m.group(1)) if '/' in m.group(1) and re.search(r'\d[. -]\d+/',m.group(1)) else m.group(1)
        if v not in ('1/4','3/8','1/2','3/4') or 'בוקס' not in tt: f.add('in:'+v)
    for m in re.finditer(r'(?<![\d/])('+FR+r')"',tt):
        v=re.sub(r'[. ]','-',m.group(1)) if re.search(r'\d[. -]\d+/',m.group(1)) else m.group(1)
        f.add('in:'+v)
    for m in re.finditer(r'\b(T|TX|E|PH|PZ|SL|H)\s?(\d{1,3})\b',tt): f.add(m.group(1).replace('TX','T')+':'+m.group(2))
    for m in re.finditer(r'סט\s*(?:של\s*)?(\d{1,3})\b|(\d{1,3})\s*(?:יחידות|יח\'|יח׳|חלקים|יח)\b|יחידות\s*(\d{1,3})\b',tt):
        f.add('n:'+next(g for g in m.groups() if g))
    if re.search(r'VDE|1000V|מבודד',tt): f.add('vde')
    if re.search(r'עמוק',tt): f.add('deep')
    if re.search(r'12\s*PT|12PT|צלעות 12|12 צלעות',tt): f.add('pt12')
    for k in [x for x in f if x.startswith('dr:')]:
        v=k[3:]
        if 'in:'+v in f and len(re.findall(re.escape(v)+'(?!\\d)',t))<2: f.discard('in:'+v)
    if size:
        s=norm(size).replace('"','').strip()
        s=re.sub(r'^(\d)\.(\d+/\d+)$',r'\1-\2',s)
        if unit_hint=='mm' and re.fullmatch(r'[\d.]+',s): f.add('mm:'+nm(s))
        elif unit_hint=='mm' and re.fullmatch(r'[\d.]+(-[\d.]+)?',s): f.add('mm:'+s)
        elif unit_hint=='inch': f.add('in:'+s)
        elif re.fullmatch(r'(T|E|PH|PZ|H)\d+',s): f.add(re.sub(r'(\D+)(\d+)',r'\1:\2',s))
        elif re.fullmatch(r'\d+(\.\d+)?',s): f.add('mm:'+nm(s))
        elif re.fullmatch(r'\d+-\d+',s): f.add('mm:'+s)
        else: f.add('sz:'+s)
    return f
if __name__=='__main__':
    for t in ['בוקסה עמוקה דרייב "1/2, 12 מ"מ','בוקסה דרייב "1/2 מידה "1.1/16 אינצ\'י','מפתח רצ\'ט דו צדדי 13*12 מ"מ','סט 46 בוקסות 1/4" מ"מ','מפתח רינג פתוח אינצ\'י "1-15/16','מברג פיליפס PH2 x 100','ביט טורקס T20','115 1/2" בוקסות הנעה מ"ממידה']: print(t,feats(t))
