# מערכת דשבורדים - יעדים מול ביצוע + ניהול משתמשים היררכי

## מה יש כאן עכשיו
- **התחברות + JWT + אימות דו-שלבי (Google Authenticator)** (`/login`): שלב 1 אימייל+סיסמה, שלב 2 קוד TOTP. בכניסה הראשונה של כל משתמש מוצג לו קוד QR לסריקה עם Google Authenticator (או כל אפליקציית TOTP); בכניסות הבאות רק מבקשים את הקוד בן 6 הספרות. ה-session (cookie) נקבע רק אחרי קוד תקין - ראה "אימות דו-שלבי" למטה.
- משתמשים עם היררכיה: `role` (`admin`/`manager`/`user`) + `manager_id` (רקורסיבי, בלי הגבלת עומק).
- **גשר בין משתמש לסוכן**: עמודת `agent_code` בטבלת `users`. Admin רואה הכל; Manager רואה את עצמו + agent_code של כל מי שתחתיו; User רואה רק את agent_code שלו.
- **דשבורד יעדים** (`/dashboard/targets`): כרטיסי KPI לפי תחום + סה"כ, בורר MTD/YTD, בורר חודש, דיאגרמת עמודות (בפועל מול יעד) לכל תחום, לפי סוכן. יעד לתקופה מחושב לפי ימי עסקים (ראשון-חמישי; חגים לא מטופלים בגרסה זו).
- **מגמות והיסטוריה** (`/dashboard/trends`): גרף מגמה חודשי, עם בורר תחום.
- **טעינת קבצים** (`/upload`, Admin בלבד): 3 קבצי אקסל - סיווג סוכנים, יעדים חודשיים, מטריצת מכירות חודשית. הפרסינג ב-`lib/xlsx-parser.js`.
- **ניהול משתמשים** (`/users`, Admin בלבד): רשימה, הוספה, עריכת תפקיד/מנהל/קוד סוכן, מחיקה.

## מבנה תיקיות
```
/components   -> Sidebar, Layout (משותפים לכל הדפים המחוברים)
/db           -> schema.sql, seed.js
/lib          -> db, auth, permissions (משתמשים), agent-permissions (סוכנים),
                 calculations (ימי עסקים + MTD/YTD), xlsx-parser, api-helpers
/pages        -> login, upload, users, dashboard/targets, dashboard/trends
/pages/api    -> login, logout, me, users/*, upload/*, dashboard/*
```

## הרצה מקומית
```bash
npm install
cp .env.example .env.local     # ומלא DATABASE_URL אמיתי + JWT_SECRET
npm install dotenv --save-dev  # רק בשביל סקריפט ה-seed
npm run seed                   # יוצר טבלאות + 4 משתמשי דוגמה (סיסמה לכולם: password123)
npm run dev
```
גלוש ל-`http://localhost:3000`, התחבר עם `admin@example.com` (רואה הכל), ותעלה את 3 הקבצים ב-`/upload` כדי לראות את הדשבורד מתמלא בנתונים אמיתיים.

## דיפלוי ל-Railway + GitHub - שלב אחר שלב

1. **דחיפה ל-GitHub**: אם עדיין לא עשית את זה, `git init`, `git add .`, `git commit`, וצור ריפו ב-GitHub ותדחוף אליו (`git remote add origin ...`, `git push`).
2. **חיבור ל-Railway**: בפרויקט Railway הקיים (עם ה-Postgres Service) -> "New" -> "GitHub Repo" -> תבחר את הריפו. Railway יזהה שזה Next.js ויבנה אוטומטית.
3. **משתני סביבה** (ב-Service של האפליקציה -> tab "Variables"):
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (Variable Reference לשירות ה-Postgres שכבר יש בפרויקט - Railway ימלא את זה אוטומטית, לא צריך להקליד בעצמך)
   - `JWT_SECRET` = מחרוזת אקראית וארוכה (למשל תפיק עם `openssl rand -hex 32`)
   - `JWT_EXPIRES_IN` = `7d`
4. **יצירת הטבלאות בפרודקשן** (חד-פעמי): מריצים את `db/schema.sql` מול בסיס הנתונים של Railway. הדרך הפשוטה ביותר: התקן את Railway CLI (`npm i -g @railway/cli`), הרץ `railway login`, `railway link` (בחר את הפרויקט), ואז `railway run node -e "require('./db/seed.js')"` (זה גם ירוץ את ה-seed וגם ייצור את הטבלאות - כי `seed.js` מריץ את `schema.sql` בעצמו). **מומלץ להריץ את ה-seed רק פעם אחת בפרודקשן**, כדי לא לאפס משתמשים קיימים (יש בו `TRUNCATE`) - לחלופין, תעתיק את תוכן `schema.sql` ותריץ ידנית ב-Railway's Postgres "Query" tab (בלי להריץ את seed.js), וייצר את משתמש ה-Admin הראשון ידנית (INSERT) או תשתמש בסקריפט seed רק בפעם הראשונה.
5. **דומיין**: Railway נותן דומיין אוטומטי (`your-app.up.railway.app`) ב-Service -> "Settings" -> "Networking" -> "Generate Domain".
6. מכאן, **כל `git push` ל-branch הראשי מריץ דיפלוי אוטומטי** - זה כל התהליך להמשך.

## איך מוסיפים דברים לדשבורד הזה (אחרי שהקוד כבר באוויר)

זו עבודת פיתוח רגילה - אין "מסך ניהול" מיוחד לזה, העדכון קורה בקוד ואז נדחף ל-GitHub:

1. **לשנות משהו קיים** (למשל להוסיף KPI card, לשנות צבע, להוסיף עמודה בטבלה) - עורכים את הקובץ המתאים ב-`/pages` או `/components` מקומית (או דרך Claude Code / כל עורך), בודקים עם `npm run dev`, ואז:
   ```bash
   git add .
   git commit -m "תיאור השינוי"
   git push
   ```
   Railway יבנה וידפלוי אוטומטית תוך דקה-שתיים.

2. **להוסיף שדה חדש** (למשל עמודה נוספת בקובץ אקסל) - צריך: (א) לעדכן את `lib/xlsx-parser.js` שיקרא את העמודה החדשה, (ב) להוסיף עמודה בטבלה הרלוונטית ב-`db/schema.sql` (וגם להריץ `ALTER TABLE` ידנית בפרודקשן, כי `schema.sql` רק יוצר טבלאות `IF NOT EXISTS` ולא משנה טבלאות קיימות), (ג) לעדכן את ה-API שמחזיר את הנתונים, (ד) לעדכן את הדף שמציג אותם.

3. **להוסיף דשבורד נוסף** (למשל "דשבורד רווחיות"):
   - קובץ עמוד חדש: `pages/dashboard/profitability.js` (מבנה כמו `targets.js` - עוטפים ב-`<Layout>`).
   - API חדש תחת `pages/api/dashboard/` שמחשב ומחזיר את הנתונים (עם בדיקת הרשאה כמו בשאר ה-API-ים).
   - שורה אחת ב-`components/Sidebar.js` בתוך מערך `NAV` כדי שהקישור יופיע בסרגל הצד.
   - אם הדשבורד צריך טבלאות חדשות - מוסיפים אותן ב-`db/schema.sql` (וגם `ALTER`/`CREATE` ידני בפרודקשן בפעם הראשונה).

4. **בדיקה לפני דחיפה**: מומלץ תמיד `npm run dev` מקומית מול בסיס נתונים (אפשר Postgres מקומי, או להתחבר לזה של Railway דרך `railway run npm run dev` כדי לבדוק מול נתונים אמיתיים) לפני `git push`, כדי לא לשבור את הפרודקשן.

## מגבלות/הנחות ידועות בגרסה הזו (לשיפור בהמשך)
- ימי עסקים = ראשון-חמישי בלבד, בלי לוח חגים.
- "לא מסווג" מוצג רק למשתמש עם הרשאת Admin.
- אין עדיין כפתור לשיוך ידני של סוכן "לא מסווג" מתוך המסך (אפשר להוסיף בהמשך).
- קובץ היעדים לא כולל שנה בתוכו - שדה "year" בטופס ההעלאה קובע לאיזו שנה מתייחסים הנתונים (ברירת מחדל: השנה הנוכחית).

## אימות דו-שלבי (Google Authenticator / TOTP)

**חשוב:** זה **לא** "Sign in with Google" (OAuth) - זה אימות בשיטת TOTP (כמו שבנקים ורוב המערכות העסקיות עושות), שמשתמש באפליקציית Google Authenticator בטלפון כדי להפיק קוד בן 6 ספרות. הסיסמה עדיין מתחלפת מול המסד שלנו כרגיל; ה-TOTP הוא שלב שני, לא תחליף.

**איך זה עובד בקוד:**
1. `/api/login` (שלב 1) מאמת אימייל+סיסמה. אם `totp_enabled=false` (כניסה ראשונה) - מפיק סוד TOTP חדש (`lib/totp.js`), שומר אותו ב-`users.totp_secret`, ומחזיר קוד QR (כתמונת `data:` URL, לא נשמר בשרת כקובץ) בתוך JSON. אם כבר מאומת בעבר - רק מחזיר שצריך קוד.
   בשני המקרים **לא נקבע session cookie בשלב הזה** - רק `pendingToken` זמני (5 דקות).
2. `/api/totp/confirm` (שלב 2) מקבל את `pendingToken` + הקוד בן 6 הספרות, מאמת מול `otplib`, ואם זה הכניסה הראשונה - מסמן `totp_enabled=true`. רק אחרי קוד תקין נקבע ה-session cookie האמיתי (7 ימים, כמו קודם).
3. אם מכשיר המשתמש (הטלפון) אבד - **אין דרך שחזור בממשק בגרסה זו**. הפתרון הזמני: Admin מריץ `UPDATE users SET totp_secret = NULL, totp_enabled = false WHERE email = '...'` ישירות ב-Postgres, וזה יגרום למשתמש לעבור שוב את מסך ה-QR בכניסה הבאה.

**אם יש לך כבר בסיס נתונים בפרודקשן** (דיפלוי קודם, לפני הפיצ'ר הזה) - `schema.sql` לא ישנה טבלה קיימת (`CREATE TABLE IF NOT EXISTS` לא מוסיף עמודות). צריך להריץ פעם אחת, ידנית, ב-Railway's Postgres Query tab:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false;
```
