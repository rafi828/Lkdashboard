"""הרצת תהליך ההשוואה המלא.
שימוש:  python run.py [--fetch] [--refresh]
  --fetch    הורדת עמודי הקטלוג מהאתר (אחרת משתמש במטמון שב-work/)
  --refresh  הורדה מחדש גם של עמודים שכבר קיימים
קלט:  input/lk_catalog.xlsx   (ייצוא קטלוג ל.כ)
פלט:  output/השוואת_קטלוג_לכ_סיגנט_<תאריך>.xlsx
"""
import os,sys,subprocess,datetime
HERE=os.path.dirname(os.path.abspath(__file__))
SRC=os.path.join(HERE,'src');WORK=os.path.join(HERE,'work')
os.makedirs(WORK,exist_ok=True);os.makedirs(os.path.join(HERE,'output'),exist_ok=True)
env=dict(os.environ,PYTHONPATH=SRC,PYTHONIOENCODING='utf-8',
         LK_FILE=os.path.join(HERE,'input','lk_catalog.xlsx'),
         OUT_FILE=os.path.join(HERE,'output',f'השוואת_קטלוג_לכ_סיגנט_{datetime.date.today()}.xlsx'))
steps=(['fetch.py'] if ('--fetch' in sys.argv or not os.path.exists(os.path.join(WORK,'pagetext.json'))) else [])+\
      ['pilot.py','lk.py','match.py','sigall.py','engine.py','match_all.py','build_all.py']
for s in steps:
    print(f'== {s}',flush=True)
    args=[sys.executable,os.path.join(SRC,s)]+[a for a in sys.argv[1:] if a=='--refresh']
    if subprocess.run(args,cwd=WORK,env=env).returncode: sys.exit(f'שגיאה בשלב {s}')
print('הקובץ נוצר:',env['OUT_FILE'])
