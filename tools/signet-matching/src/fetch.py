"""מוריד את עמודי קטלוג פלד (FlippingBook) ובונה pagetext.json + meta.json בתיקיית העבודה."""
import os,re,json,html,sys,urllib.request,concurrent.futures as cf
BASE=os.environ.get('CATALOG_URL','https://peledtech.com/catalog2024-25/').rstrip('/')+'/'
os.makedirs('pages',exist_ok=True)
def get(url):
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
    with urllib.request.urlopen(req,timeout=30) as r: return r.read().decode('utf-8','ignore')
first=get(BASE+'10/')
last=int(re.search(r'rel="last" href="\.\./(\d+)/"',first).group(1))
print('pages:',last)
def dl(i):
    fn=f'pages/{i}.html'
    if os.path.exists(fn) and '--refresh' not in sys.argv: return
    open(fn,'w',encoding='utf-8').write(get(f'{BASE}{i}/'))
with cf.ThreadPoolExecutor(6) as ex: list(ex.map(dl,range(1,last+1)))
text={};titles={}
for i in range(1,last+1):
    t=open(f'pages/{i}.html',encoding='utf-8').read()
    m=re.search(r'<div id="text-container".*?<p>(.*?)</p>',t,re.S)
    text[str(i)]=html.unescape(m.group(1)) if m else ''
    for m in re.finditer(r'title="([^"]*)">(\d+)</a>',t): titles.setdefault(int(m.group(2)),html.unescape(m.group(1)))
json.dump(text,open('pagetext.json','w'),ensure_ascii=False)
# אינדקס מק"טים בסוף הקטלוג
idx={}
for p in range(1,last+1):
    t=text[str(p)]
    if 'אינדקס מק"טים' not in t: continue
    toks=t.replace('אינדקס מק"טים לפי סדר כרונולוגי','').split()
    for i,tok in enumerate(toks[:-1]):
        if re.fullmatch(r'\d{5,9}',tok) and re.fullmatch(r'\d{1,3}',toks[i+1]) and int(toks[i+1])<=last: idx.setdefault(tok,int(toks[i+1]))
json.dump({'idx':idx,'titles':titles},open('meta.json','w'),ensure_ascii=False)
print('SKUs in index:',len(idx))
