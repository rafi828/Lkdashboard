import json,re
d=json.load(open('pagetext.json'))
SKU=re.compile(r'^0\d{5}$')
def parse(p):
    toks=d[str(p)].split()
    tables=[];cur=None;i=0
    while i<len(toks):
        t=toks[i]
        if 'מידה' in t:
            unit='mm' if 'מ"מ' in t else ('inch' if "אינץ'" in t else '?')
            cur={'unit':unit,'rows':[]};tables.append(cur)
            # skip header until 'מחיר'
            while i<len(toks) and toks[i]!='מחיר': i+=1
            i+=1;buf=[];continue
        if cur is not None:
            if SKU.match(t) and i+1<len(toks):
                cur['rows'].append({'size':buf[0] if buf else None,'dims':buf[1:],'sku':t,'price':toks[i+1]})
                buf=[];i+=2;continue
            buf.append(t)
            if len(buf)>12: cur=None;buf=[]
        i+=1
    return tables
