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
                        "תפריט" - נושאים מ-/api/topics + דוחות מ-lib/reports.js, רק מה שיש למשתמש הרשאת צפייה בו.
                        "מערכת" ("ניהול משתמשים") מוצג ל-Admin בלבד.
  MeContext.js        - useMe() / can(me, key) / <IfCan permission="..."> - הסתרת כפתורים לפי הרשאה.
                        Layout מקבל permission="targets.view" או adminOnly וחוסם עמוד שאין אליו הרשאה.
  FileUploadGrid.js   - קומפוננטת טעינת קבצים משותפת (dropzones + "הועלה לאחרונה"), בשימוש
                        בשני עמודי ה-upload הייעודיים (ראה pages/dashboard/*-upload.js).
/db
  schema.sql          - כל ה-CREATE TABLE. לשינויים ב-DB קיים ראה "שינוי סכימה = קובץ migration" למטה.
  seed.js             - סקריפט זריעת משתמש admin ראשוני (לא רץ אוטומטית ב-deploy).
  migrate.js          - ⭐ רץ אוטומטית בכל `npm start` (לפני next start): מריץ קבצי migrations/*.sql שעוד לא רצו.
  migrations/         - 001-permissions.sql, ... - כל קובץ רץ פעם אחת (נרשם בטבלת schema_migrations).
/lib
  db.js               - getPool() - חיבור Postgres (SSL מותנה: כבוי לחיבור internal railway, דלוק לחיצוני).
  auth.js             - JWT + TOTP: getUserFromRequest, יצירת/אימות session.
  reports.js          - ⭐ רשימת הדוחות המרכזית: נושא, שם, href, ומפתחות הרשאה (targets.view, quarterly.upload...).
                        דוח חדש = מוסיפים כאן בלבד, והוא מופיע אוטומטית בתפריט ובמסך התבניות/חריגים.
  access.js           - ⭐ requireUser / requirePermission(req,res,key) / requireAdmin / getDataScope(user).
                        טוען את המשתמש וההרשאות טרי מה-DB בכל בקשה (לא סומך על role שב-cookie).
  user-admin.js       - עזרים ל-API ניהול משתמשים (פרסור קודי סוכן, ולידציה).
  permissions.js      - ישן, בשימוש רק ב-api/dashboard-data.js (legacy, Admin בלבד).
  calculations.js     - חישובי ימי עסקים (א'-ה', ללא חגים), פרו-רטה ליעדים MTD/YTD.
  xlsx-parser.js       - פרסור כל קבצי האקסל (ראה "פרסור קבצים" למטה).
  api-helpers.js       - parseSingleFile(req) [מחזיר {buffer, fields, filename}]. (בדיקות הרשאה -> lib/access.js)
  topics.js            - getAllTopics, getVisibleTopics(user) - admin רואה הכל, אחרת נושאים שיש בהם דוח עם הרשאת צפייה.
  file-uploads.js       - recordFileUpload(fileKey, filename, userId) - שומר "הועלה לאחרונה" בטבלת file_uploads.
  mailer.js             - עטיפת nodemailer סביב SMTP. **לא עובד כרגע** - ראה "בעיה פתוחה: SMTP".
  quarterly-email-template.js - בונה HTML למייל סטטוס יעד רבעוני ללקוח (משמש את quarterly-targets-send.js).
  sku-compare.js        - getSkuCompareRows(lkSkus?) - שורות "השוואת מק"טים": תוצאת מנוע + החלטה ידנית (JOIN).
/pages
  login.js            - התחברות: אימייל+סיסמה -> קוד Google Authenticator. בכניסה ראשונה: QR + הסבר שלב-אחר-שלב.
                        השם באפליקציה ("דשבורד ל.כ") מוגדר ב-ISSUER ב-lib/totp.js (משפיע רק על סריקות חדשות).
  home.js             - דף הפתיחה אחרי התחברות: מעביר לדוח הראשון שיש למשתמש הרשאה אליו (סדר lib/reports.js),
                        ואם אין לו אף דוח - מציג הודעה "פנה למנהל המערכת". גם / ו-/dashboard מפנים לכאן.
  upload.js(הוסר, ראה למטה), users.js, dashboard.js(legacy, מפנה ל-/home)
  /dashboard
    targets.js               - דשבורד "תקציב מול ביצוע" הראשי. MTD/YTD, עוגת פילוח תחומים+טבלה
                                מפורטת (יעד/בפועל/הפרש/השלמה/רווח[placeholder]), בר בודד לכל סוכן
                                (ירוק בהיר=יעד רקע, ירוק כהה=בפועל, פס שחור אם עברו יעד), תחום גדול
                                בשורה נפרדת + "שאר התחומים" בשורה מאוחדת + "לא מסווג" בנפרד (dashed).
    quarterly-targets.js     - דשבורד "יעדים רבעוניים ללקוח". לפי הרשאה quarterly.view; סוכן רואה רק את הלקוחות שלו (ראה "הרשאות").
                                פילטרים (סוכן/סטטוס/סוג יעד/חיפוש/רבעון 1-4+מצטבר), KPI, 3 גרפים
                                (בר סוכנים, עוגת סטטוס, קו מגמה חודשית), טבלה ממוינת. כפתורי
                                "ייצוא לשליחת מייל" (Word Mail Merge) ו"שליחת מייל" (ישיר, ראה SMTP).
    targets-upload.js         - עמוד טעינת קבצים ייעודי ל"תקציב מול ביצוע" (3 dropzones).
    quarterly-targets-upload.js - עמוד טעינת קבצים ייעודי ל"יעדים רבעוניים" (dropzone בודד).
    sku-compare.js            - דשבורד "השוואת מק"טים" (skucompare.view). כרטיסים, סינון, טבלה ממוינת בעמודים של 100,
                                כפתורי אישור/דחייה/תיקון (skucompare.decide), צ'קבוקס לכל שורה (נשמר בין חיפושים,
                                נמחק ביציאה מהמסך), "הצג מסומנים בלבד", ייצוא לאקסל (מסומנים, או כל מה שמוצג אם לא סומן כלום).
    sku-compare-upload.js     - עמוד טעינת קובץ התוצאות של כלי ההשוואה (dropzone בודד).
    trends.js                 - "מגמות והיסטוריה" (קיים אך לא מקושר בתפריט הנוכחי - לבדוק אם רלוונטי).
  /api
    login.js, logout.js, me.js, totp/confirm.js
    topics.js                          - GET נושאים גלויים למשתמש הנוכחי.
    users/index.js, users/[id].js      - CRUD משתמשים.
    users/[id]/overrides.js            - PUT חריגים אישיים למשתמש (admin only).
    permission-templates/index.js, [id].js - CRUD תבניות הרשאה (admin only; מחיקה חסומה אם יש משתמשים משויכים).
    upload/classification.js           - טעינת קובץ סיווג סוכנים לתחומים (מבוסס מיקום עמודה קבוע!).
    upload/targets.js                  - טעינת קובץ יעדים חודשיים (מבוסס כותרת "קוד סוכן" + שמות חודשים).
    upload/sales-matrix.js             - טעינת מטריצת מכירות חודשית (מבוסס כותרת "סוכן" + MM/YYYY).
    upload/quarterly-targets.js        - טעינת קובץ יעדים רבעוניים ללקוח (מבוסס כותרות מדויקות).
    upload/sku-compare.js              - טעינת קובץ תוצאות ההשוואה (גיליונות "התאמות" + "ל.כ ללא התאמה", לפי כותרות).
                                         מחליף את כל sku_compare_items; לא נוגע ב-sku_compare_decisions.
    upload/status.js                   - GET "הועלה לאחרונה" לכל סוגי הקבצים (מ-file_uploads).
    dashboard/targets-summary.js       - נתוני "תקציב מול ביצוע" (מחושב, כולל diff/completion/contribution/profit[null]).
    dashboard/trends.js                - נתוני "מגמות".
    dashboard/quarterly-targets.js     - GET נתוני יעדים רבעוניים (quarterly.view, מסונן לפי קוד סוכן).
    dashboard/quarterly-targets-export.js - POST ייצוא xlsx מותאם ל-Word Mail Merge (מקבל customerIds).
    dashboard/quarterly-targets-send.js   - POST שליחת מייל ישירה per-customer (SMTP - לא עובד עדיין).
    dashboard/sku-compare.js              - GET נתוני "השוואת מק"טים" + פרטי הקובץ האחרון.
    dashboard/sku-compare-decision.js     - POST החלטה ידנית לפריט (approved/rejected/corrected, null = ביטול).
    dashboard/sku-compare-export.js       - POST ייצוא xlsx (מקבל lkSkus), כולל מק"ט סופי אחרי החלטות.
/tools/signet-matching  - כלי פייתון (לא חלק מהאתר) שמייצר את קובץ ההשוואה. ראה README שם.
                          input/ work/ output/ לא נשמרים ב-Git (קטלוג החברה + קבצים זמניים).
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
users (id, name, email, password_hash, role['admin'|'manager'|'user'], manager_id, agent_code[ישן, לא בשימוש],
       permission_template_id, totp_secret, totp_enabled)
user_agent_codes (user_id, agent_code)                                    -- כמה קודי סוכן למשתמש
permission_templates (id, name)  +  permission_template_items (template_id, permission_key)
user_permission_overrides (user_id, permission_key, granted)              -- true=הוסף, false=הסר מעל התבנית
sales (id, owner_id, customer, amount, sale_date)                         -- legacy, לא בשימוש פעיל
agent_classification (agent_code PK, agent_name, domain)                  -- מ"סיווג סוכנים לתחומים"
agent_targets (id, agent_code, agent_name, year, month, target_amount, UNIQUE(agent_code,year,month))
agent_sales_monthly (id, agent_code, agent_name, year, month, sales_amount, UNIQUE(agent_code,year,month))

topics (id, key, name, sort_order)                                        -- 'sales'/'procurement'/'warehouse'
user_topic_access (user_id, topic_id)                                     -- ישן, כבר לא קובע גישה

customer_quarterly_targets (
  id, customer_id, customer_name, agent_code[מ"קוד סוכן מלקוח - 2"], agent_name, agent_email, agent_phone,
  chanoch_email, rafi_email, david_email, amir_email,                     -- 4 עמודות מייל נוספות מהקובץ המקורי
  target_type, target_type_simple['רבעוני'|'שנתי'|'אחר / הערה'], year,
  q1_target, q1_actual, q1_credit,  q2_target, q2_actual, q2_credit,
  q3_target, q3_actual, q3_credit,  q4_target, q4_actual, q4_credit,
  annual_target, last_year_sales, m1..m6,
  UNIQUE(customer_id, year)
)

file_uploads (file_key PK['classification'|'targets'|'matrix'|'quarterly'|'sku-compare'], filename, uploaded_at, uploaded_by)

sku_compare_items (lk_sku PK, lk_desc, lk_dept, comp_sku, comp_desc, comp_brand,
                   confidence['ודאי'|'סביר'|'לבדיקה'|'ללא התאמה'], notes, catalog_page, comp_price)  -- מוחלף בכל טעינה
sku_compare_decisions (lk_sku PK, decision['approved'|'rejected'|'corrected'], corrected_sku, note,
                       decided_by, decided_at)                            -- לא נמחק בטעינה, גובר על תוצאת המנוע
```

### ⚠️ עקרון קריטי: שינוי סכימה = קובץ migration חדש (אוטומטי מאוקטובר 2026)
`CREATE TABLE IF NOT EXISTS` לא מוסיף עמודות לטבלה קיימת, והרצה חוזרת של `schema.sql` לא מעדכנת DB קיים -
זה היה מקור לשעות של דיבוג בעבר. **מעכשיו לא מריצים SQL ידני ב-Railway.** כל שינוי סכימה:
1. קובץ חדש ב-`db/migrations/` עם המספר הבא: `002-<תיאור>.sql`, `003-...` (הסדר נקבע לפי שם הקובץ).
2. רק פקודות בטוחות להרצה חוזרת: `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO NOTHING`.
3. לעדכן גם את `schema.sql` (תיעוד המבנה המלא / התקנה חדשה).
4. **לעולם לא לשנות קובץ migration שכבר רץ ב-production** - רק להוסיף קובץ חדש.

`db/migrate.js` רץ בכל הפעלה (`npm start`), כל קובץ בטרנזקציה: אם קובץ נכשל - הוא מבוטל כולו, השגיאה
מופיעה ב-Railway → Deploy Logs (`[migrate] ✗ ...`), והאפליקציה עולה בכל זאת. ריצה ידנית: `npm run migrate`.

---

## פרסור קבצי אקסל - שני מנגנונים שונים (חשוב!)
- **לפי מיקום עמודה קבוע** (`parseClassificationFile`): רק קובץ הסיווג. עמודה A=תחום, B=קוד סוכן,
  C=שם. שינוי סדר עמודות = קריאה שגויה. לא גמיש.
- **לפי חיפוש כותרת** (שלושת הקבצים האחרים): מחפש תא עם טקסט מדויק ("קוד סוכן" / "סוכן" / "לקוח")
  ואז מחפש עמודות לפי שם מדויק (שמות חודשים בעברית, או תבנית MM/YYYY, או כותרות רבעון/זיכוי מדויקות).
  גמיש לסדר עמודות, שביר לניסוח כותרת שונה.

`customer_quarterly_targets` UPSERT-ing תמיד לפי `(customer_id, year)` — טעינה חוזרת של הקובץ מעדכנת שורות קיימות.

---

## הרשאות (permissions) - תבניות + חריגים (אוקטובר 2026)
- **מה מותר (אילו דוחות/פעולות):** לכל משתמש תבנית הרשאה (`permission_templates`), ומעליה חריגים אישיים
  (`user_permission_overrides`: הוסף/הסר). מפתחות ההרשאה מוגדרים ב-`lib/reports.js`:
  `targets.view`, `targets.upload`, `quarterly.view`, `quarterly.upload`, `quarterly.email`,
  `skucompare.view`, `skucompare.upload`, `skucompare.decide`. Admin = הכל אוטומטית.
- **מה רואים בתוך הדוח (`getDataScope`):** Admin ומנהל מכירות (`manager`) = כל הנתונים. סוכן (`user`) = רק
  קודי הסוכן שלו (`user_agent_codes`, יכולים להיות כמה). ב"תקציב מול ביצוע" לפי agent_code, וב"יעדים רבעוניים"
  לפי `customer_quarterly_targets.agent_code` (עמודה "קוד סוכן מלקוח - 2" בקובץ). `manager_id` כבר לא משפיע על נתונים.
- ייצוא/שליחת מייל - רק ללקוחות שהמשתמש רואה (נאכף בשרת).
- אי אפשר לשמור סוכן בלי קוד סוכן (חסום גם בשרת וגם בהודעה קופצת). אי אפשר להוריד/למחוק את האדמין האחרון.
- ההגנה האמיתית היא ב-API (`requirePermission`) - הסתרת כפתורים במסך היא רק נוחות.

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
- כל שינוי סכימה → קובץ חדש ב-`db/migrations/`, רץ אוטומטית בדיפלוי (ראה "שינוי סכימה = קובץ migration").
  לבדוק ב-Deploy Logs שמופיע `[migrate] ✓`.

משתני סביבה קיימים: `DATABASE_URL` (auto מ-Railway), `JWT_SECRET`, `JWT_EXPIRES_IN=7d`,
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `PUBLIC_APP_URL`.

---

## עוד לעשות / פתוח
- "השוואת מק"טים": שלב 3 - ייצוא ההחלטות ל-`tools/signet-matching/input/overrides.xlsx` שהמנוע יחיל בהרצה הבאה.
  רפי ציין שירצה לעדכן גם את מבנה קובץ האקסל של ההשוואה - אם משנים שמות עמודות, לעדכן את
  `SKU_MATCH_COLUMNS` / `SKU_UNMATCHED_COLUMNS` ב-`lib/xlsx-parser.js` (יש שם כבר שמות חלופיים).
- לעבור מ-SMTP ל-Resend לשליחת מייל אמיתית (`lib/mailer.js`).
- ~~דוח "יעדים רבעוניים ללקוח" - הרשאות מעבר ל-admin-only~~ - ✅ בוצע (תבניות + חריגים, קוד סוכן מהקובץ).
- ~~עדכון DB אוטומטי בעלייה (migrations)~~ - ✅ בוצע (`db/migrate.js`, רץ ב-`npm start`).
- אופציה עתידית: מנהל מכירות שרואה רק את הסוכנים שמתחתיו (במקום הכל) - אם יידרש.
- ניקוי: `users.agent_code`, `user_topic_access` - כבר לא בשימוש, למחוק רק באישור רפי אחרי שהמעבר יציב.
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
