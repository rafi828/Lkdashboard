# LKdashboard — סיכום פרויקט עבור Claude Code

## מטרה
מערכת דשבורדים עסקית ל-ל.כ כלי עבודה וציוד בע"מ. אדמין: רפי (rafi@lkltd.com). כל העבודה והתקשורת בעברית, ממשק RTL.

- **Repo:** rafi828/Lkdashboard (GitHub)
- **Live URL:** https://lkdashboard-production.up.railway.app
- **Hosting:** Railway (אפליקציה + Postgres, שני שירותים נפרדים באותו פרויקט)
- **Stack:** Next.js 14 (Pages Router), PostgreSQL, JWT + TOTP (Google Authenticator), formidable v2 (העלאת קבצים), xlsx (פרסור Excel), nodemailer (טרם עובד - ראה "בעיה פתוחה: SMTP" למטה)

---

## כללי עבודה עם Claude Code
- הבראנץ' `main` מוגן ב-GitHub (Branch protection). שינויים נכנסים ל-`main` רק דרך Pull Request שרפי בודק וממזג בעצמו.
- לעולם לא לדחוף ישירות ל-`main`. לעבוד תמיד על בראנץ' נפרד.
- לפני כל שינוי: להציג לרפי תוכנית ברורה ולקבל אישור מפורש. רק אז לבצע.
- Deploy ל-Railway קורה רק אחרי ש-רפי ממזג PR ל-`main`.
- לא לפתוח PR בלי שרפי ביקש.

---

## ⚠️ קריטי: פער בין "מה שנשלח בצ'אט" למה שבאמת חי ב-Production
הבעיה המרכזית שהובילה להכנת הקובץ הזה: בעבודה קודמת מול Claude דרך צ'אט רגיל (claude.ai, לא Claude Code), רפי קיבל המון קבצים לאורך זמן, אבל לא תמיד העלה את כולם ל-GitHub. במקרים לא מעטים Claude "חשב" שקוד מסוים כבר חי ב-production, בזמן שבפועל גרסה ישנה יותר עדיין רצה. זה גרם לבאגים ובלבול חוזרים.

**הנחיה ל-Claude Code:** לפני כל שינוי, קרא תמיד את התוכן האמיתי הנוכחי של הקובץ מהדיסק (לא מהזיכרון/היסטוריית שיחה). אל תניח שקובץ שהוזכר בעבר בצ'אט קיים בגרסה שתוארה - תמיד תבדוק. אם התיקייה המחוברת אינה עדכנית מול GitHub (למשל `git status` מראה שינויים לא צפויים, או `git log` מראה שקומיטים אחרונים לא תואמים למה שמתואר כאן), עצור ותשאל את רפי לפני שתמשיך.

---

## מבנה קבצים (Next.js Pages Router)
```
/components
  Layout.js          - עטיפת עמוד: בודק התחברות (GET /api/me), מרנדר TopNav + תוכן
  TopNav.js           - סרגל ניווט עליון. גרסה נוכחית (לפי מה שאושר אחרון בצ'אט, יתכן לא חי עדיין):
                        שורה אחת: לוגו+שם חברה+התנתקות בצד שמאל, "תפריט"/"מערכת" בצד ימין.
                        "תפריט" נטען דינמית מ-/api/topics (נושאים לפי הרשאת המשתמש).
                        "מערכת" מכיל רק "ניהול משתמשים" (קבוע, לא תלוי הרשאות).
  FileUploadGrid.js   - קומפוננטת טעינת קבצים משותפת (dropzones + "הועלה לאחרונה"), בשימוש
                        בשני עמודי ה-upload הייעודיים (ראה pages/dashboard/*-upload.js).
/db
  schema.sql          - כל ה-CREATE TABLE. ראה "עקרון חשוב: ALTER TABLE" למטה.
  seed.js             - סקריפט זריעת משתמש admin ראשוני (לא רץ אוטומטית ב-deploy).
/lib
  db.js               - getPool() - חיבור Postgres (SSL מותנה: כבוי לחיבור internal railway, דלוק לחיצוני).
  auth.js             - JWT + TOTP: getUserFromRequest, יצירת/אימות session.
  permissions.js, agent-permissions.js - הרשאות היררכיות מבוססות agent_code (admin/manager/user).
  calculations.js     - חישובי ימי עסקים (א'-ה', ללא חגים), פרו-רטה ליעדים MTD/YTD.
  xlsx-parser.js       - פרסור כל קבצי האקסל (ראה "פרסור קבצים" למטה).
  api-helpers.js       - parseSingleFile(req) [מחזיר {buffer, fields, filename}], requireRole(req,res,roles).
  topics.js            - getAllTopics, getVisibleTopics(user) - admin רואה הכל, אחרת לפי user_topic_access.
  file-uploads.js       - recordFileUpload(fileKey, filename, userId) - שומר "הועלה לאחרונה" בטבלת file_uploads.
  mailer.js             - עטיפת nodemailer סביב SMTP. **לא עובד כרגע** - ראה "בעיה פתוחה: SMTP".
  quarterly-email-template.js - בונה HTML למייל סטטוס יעד רבעוני ללקוח (משמש את quarterly-targets-send.js).
/pages
  login.js, upload.js(הוסר, ראה למטה), users.js, dashboard.js(legacy, לא בשימוש)
  /dashboard
    targets.js               - דשבורד "תקציב מול ביצוע" הראשי. MTD/YTD, עוגת פילוח תחומים+טבלה
                                מפורטת (יעד/בפועל/הפרש/השלמה/רווח[placeholder]), בר בודד לכל סוכן
                                (ירוק בהיר=יעד רקע, ירוק כהה=בפועל, פס שחור אם עברו יעד), תחום גדול
                                בשורה נפרדת + "שאר התחומים" בשורה מאוחדת + "לא מסווג" בנפרד (dashed).
    quarterly-targets.js     - דשבורד "יעדים רבעוניים ללקוח". Admin-only (ראה "הערת הרשאות" למטה).
                                פילטרים (סוכן/סטטוס/סוג יעד/חיפוש/רבעון 1-4+מצטבר), KPI, 3 גרפים
                                (בר סוכנים, עוגת סטטוס, קו מגמה חודשית), טבלה ממוינת. כפתורי
                                "ייצוא לשליחת מייל" (Word Mail Merge) ו"שליחת מייל" (ישיר, ראה SMTP).
    targets-upload.js         - עמוד טעינת קבצים ייעודי ל"תקציב מול ביצוע" (3 dropzones).
    quarterly-targets-upload.js - עמוד טעינת קבצים ייעודי ל"יעדים רבעוניים" (dropzone בודד).
    trends.js                 - "מגמות והיסטוריה" (קיים אך לא מקושר בתפריט הנוכחי - לבדוק אם רלוונטי).
  /api
    login.js, logout.js, me.js, totp/confirm.js
    topics.js                          - GET נושאים גלויים למשתמש הנוכחי.
    users/index.js, users/[id].js      - CRUD משתמשים.
    users/[id]/topics.js               - GET/PUT הרשאות נושא למשתמש (admin only).
    upload/classification.js           - טעינת קובץ סיווג סוכנים לתחומים (מבוסס מיקום עמודה קבוע!).
    upload/targets.js                  - טעינת קובץ יעדים חודשיים (מבוסס כותרת "קוד סוכן" + שמות חודשים).
    upload/sales-matrix.js             - טעינת מטריצת מכירות חודשית (מבוסס כותרת "סוכן" + MM/YYYY).
    upload/quarterly-targets.js        - טעינת קובץ יעדים רבעוניים ללקוח (מבוסס כותרות מדויקות).
    upload/status.js                   - GET "הועלה לאחרונה" לכל סוגי הקבצים (מ-file_uploads).
    dashboard/targets-summary.js       - נתוני "תקציב מול ביצוע" (מחושב, כולל diff/completion/contribution/profit[null]).
    dashboard/trends.js                - נתוני "מגמות".
    dashboard/quarterly-targets.js     - GET נתוני יעדים רבעוניים (admin only).
    dashboard/quarterly-targets-export.js - POST ייצוא xlsx מותאם ל-Word Mail Merge (מקבל customerIds).
    dashboard/quarterly-targets-send.js   - POST שליחת מייל ישירה per-customer (SMTP - לא עובד עדיין).
/public/logos
  lc-logo.png, roher-logo.png
```

**קובץ שהוסר:** `pages/upload.js` (המסך המרכזי הישן לטעינת קבצים) - הוחלף בעמודי טעינה ייעודיים
לכל דשבורד. יש לוודא שהוא באמת נמחק מה-repo (לא רק תוכן ריק) - זה פוטנציאל לבאג "route קיים אבל לא אמור להיות".
> ✅ אומת (ספטמבר 2026): הקובץ נמחק מה-repo בקומיט "Delete pages/upload.js".

**קבצים שקיימים ב-repo ולא מתועדים למעלה** (כנראה שאריות מגרסאות קודמות - לבדוק לפני שנוגעים, לא למחוק בלי אישור):
- `targets.js` בתיקייה הראשית - עותק ישן, שונה מ-`pages/dashboard/targets.js`.
- `components/Sidebar.js` - לא מיובא בשום מקום, ועדיין מקשר ל-`/upload` שנמחק.
- `pages/index.js`, `pages/targets-summary.js`, `pages/api/dashboard-data.js`, `lib/totp.js` - לבדוק אם בשימוש.

---

## סכימת בסיס הנתונים (עיקרי, לפי schema.sql)
```sql
users (id, name, email, password_hash, role['admin'|'manager'|'user'], manager_id, agent_code, totp_secret, totp_enabled)
sales (id, owner_id, customer, amount, sale_date)                         -- legacy, לא בשימוש פעיל
agent_classification (agent_code PK, agent_name, domain)                  -- מ"סיווג סוכנים לתחומים"
agent_targets (id, agent_code, agent_name, year, month, target_amount, UNIQUE(agent_code,year,month))
agent_sales_monthly (id, agent_code, agent_name, year, month, sales_amount, UNIQUE(agent_code,year,month))

topics (id, key, name, sort_order)                                        -- 'sales'/'procurement'/'warehouse'
user_topic_access (user_id, topic_id)                                     -- הרשאות non-admin

customer_quarterly_targets (
  id, customer_id, customer_name, agent_name, agent_email, agent_phone,
  chanoch_email, rafi_email, david_email, amir_email,                     -- 4 עמודות מייל נוספות מהקובץ המקורי
  target_type, target_type_simple['רבעוני'|'שנתי'|'אחר / הערה'], year,
  q1_target, q1_actual, q1_credit,  q2_target, q2_actual, q2_credit,
  q3_target, q3_actual, q3_credit,  q4_target, q4_actual, q4_credit,
  annual_target, last_year_sales, m1..m6,
  UNIQUE(customer_id, year)
)

file_uploads (file_key PK['classification'|'targets'|'matrix'|'quarterly'], filename, uploaded_at, uploaded_by)
```

### ⚠️ עקרון קריטי: `CREATE TABLE IF NOT EXISTS` לא מוסיף עמודות לטבלה קיימת
כל פעם שנוספה עמודה חדשה לטבלה שכבר קיימת ב-production (למשל `q1_credit` ל-`customer_quarterly_targets`,
או `agent_email`/`chanoch_email` וכו'), חובה להריץ בנפרד `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`
ב-Postgres (Railway → Postgres → Database → Data tab → תיבת Query). הרצה חוזרת של `schema.sql` המלא
לא מוסיפה עמודות לטבלאות קיימות - זו הייתה מקור לכמה שעות דיבוג בעבר. Claude Code: כשמוסיפים עמודה
לטבלה קיימת, תמיד להזכיר לרפי גם את פקודת ה-ALTER TABLE הנפרדת, לא להסתפק בעדכון schema.sql.

---

## פרסור קבצי אקסל - שני מנגנונים שונים (חשוב!)
- **לפי מיקום עמודה קבוע** (`parseClassificationFile`): רק קובץ הסיווג. עמודה A=תחום, B=קוד סוכן,
  C=שם. שינוי סדר עמודות = קריאה שגויה. לא גמיש.
- **לפי חיפוש כותרת** (שלושת הקבצים האחרים): מחפש תא עם טקסט מדויק ("קוד סוכן" / "סוכן" / "לקוח")
  ואז מחפש עמודות לפי שם מדויק (שמות חודשים בעברית, או תבנית MM/YYYY, או כותרות רבעון/זיכוי מדויקות).
  גמיש לסדר עמודות, שביר לניסוח כותרת שונה.

`customer_quarterly_targets` UPSERT-ing תמיד לפי `(customer_id, year)` — טעינה חוזרת של הקובץ מעדכנת שורות קיימות.

---

## הרשאות (permissions)
- **מערכת ישנה (תקציב מול ביצוע):** לפי `agent_code` מספרי. Admin=הכל, Manager=עצמו+כפיפים
  (רקורסיבי), User=רק agent_code שלו. הצלבה בין משתמש לסוכן דרך `users.agent_code`.
- **מערכת חדשה (נושאים בתפריט):** טבלת `topics`+`user_topic_access`, ברמת נושא (לא דוח בודד).
  Admin רואה הכל אוטומטית.

**⚠️ פער ידוע:** דוח "יעדים רבעוניים ללקוח" מזהה סוכנים לפי שם טקסט חופשי (`agent_name`
ב-`customer_quarterly_targets`), לא לפי `agent_code` מספרי. אין עדיין הצלבה בין השניים.
כרגע הדוח admin-only (403 לכל תפקיד אחר) - זה limitation מכוון, לא רק חסר הרשאה זמני.
אם רוצים לפתוח את זה ל-Manager/User, צריך קודם למפות שם→קוד.

---

## בעיה פתוחה: SMTP חסום ב-Railway
נבדק ואומת: Railway חוסם חיבורי SMTP יוצאים (גם פורט 587 וגם 465, שניהם "Connection timeout" אחרי
בדיקה ישירה מול Gmail עם App Password תקין - אומת בנפרד דרך Outlook שהעבודה מול אותו Gmail עצמו כן
עובדת ממחשב רגיל, כך שזו בעיה של הפלטפורמה ולא של הקרדנציאלס). הוחלט לעבור ל-Resend (שירות מייל
מבוסס HTTP, פורט 443 - כמעט אף פעם לא חסום). טרם בוצע קוד - נעצר כדי לטפל קודם בסידור התפריט/כפתורים.

כשחוזרים לזה: `lib/mailer.js` צריך replaced ל-Resend SDK (או fetch ל-REST API שלו) במקום nodemailer/SMTP.
`pages/api/dashboard/quarterly-targets-send.js` קורא ל-`lib/mailer.js` - הלוגיקה שם (דילוג על לא-רבעוני,
דילוג על חסר-מייל, בניית HTML) לא צריכה להשתנות, רק שכבת השליחה בפועל.

משתני סביבה קיימים ב-Railway (לצורך זה, כרגע לא בשימוש בפועל): `SMTP_HOST/PORT/USER/PASS/FROM`,
`PUBLIC_APP_URL` (נדרש גם ל-Resend, ללוגו במייל).

---

## מצב נוכחי בתפריט העליון / כפתור טעינת קבצים
היו כמה סבבי איטרציה על מיקום כפתור "טעינת קבצים" (מודל, מסך נפרד עם back-link, כפתור אנכי/אופקי
בפינות שונות של הסרגל). הגרסה האחרונה שרפי ביקש בפירוש: להשאיר את הכפתור בדיוק כמו שהוא כרגע
חי ב-production (בתוך תוכן כל דשבורד, ליד ה-MTD/YTD toggle, לא בסרגל העליון בכלל) - ופשוט לצבוע
אותו צהוב (`background: '#fde047'`, `border: '2px solid #eab308'`) בשני הדשבורדים. יש לוודא בפועל
מהריפו מה חי כרגע לפני שממשיכים לשנות משהו בנושא הזה - זו הייתה נקודת חיכוך משמעותית בעבר.
> ✅ אומת מול ה-repo (ספטמבר 2026): המיקום נכון - הכפתור בתוך תוכן הדשבורד ב-`pages/dashboard/targets.js`
> וב-`pages/dashboard/quarterly-targets.js`, בסגנון לבן (`styles.uploadBtn`).
> **החלטה סופית של רפי (ספטמבר 2026): לא לצבוע את הכפתור בצהוב.** הכפתור נשאר כמו שהוא - לא לשנות בלי בקשה מפורשת.

---

## Deploy Workflow (Railway)
- Merge ל-`main` (דרך PR) → דיפלוי אוטומטי.
- שינוי ב-`package.json` (תלות חדשה) → build מלא יותר (npm install מאפס), לוקח קצת יותר זמן.
- שינוי במשתני סביבה → דיפלוי אוטומטי נפרד (לא דרך GitHub).
- כל שינוי סכימה חדש בטבלה קיימת → חובה ALTER TABLE ידני בנוסף לעדכון schema.sql (ראה למעלה).

משתני סביבה קיימים: `DATABASE_URL` (auto מ-Railway), `JWT_SECRET`, `JWT_EXPIRES_IN=7d`,
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `PUBLIC_APP_URL`.

---

## עוד לעשות / פתוח
- לעבור מ-SMTP ל-Resend לשליחת מייל אמיתית (`lib/mailer.js`).
- דוח "יעדים רבעוניים ללקוח" - אם רוצים הרשאות עדינות יותר מ-admin-only, למפות agent_name→agent_code.
- `pages/dashboard/trends.js` - לבדוק אם עדיין רלוונטי / איך מקושר בתפריט.
- ~~לוודא ש-`pages/upload.js` הישן באמת הוסר מה-repo~~ - ✅ אומת.
- לבדוק ולנקות את הקבצים הלא-מתועדים (ראה "קבצים שקיימים ב-repo ולא מתועדים" למעלה) - רק באישור רפי.

---

## הנחיות סגנון לעבודה מול רפי (רלוונטי גם ל-Claude Code)
- כל הממשק והתקשורת בעברית, RTL.
- רפי לא מפתח - כל הסבר טכני צריך שלבים ברורים ופשוטים, לא ז'רגון.
- לפני שינוי עיצובי משמעותי, מקובל להראות תצוגה מקדימה (HTML) ולקבל אישור מפורש לפני קוד.
- כשמזהים חוסר ודאות לגבי מה שבאמת חי ב-production - לבקש מרפי לבדוק ישירות (screenshot / GitHub /
  Railway logs) במקום להניח.
