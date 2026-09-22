-- ==========================================================
-- סכמת בסיס הנתונים - מערכת דשבורדים עם הרשאות היררכיות
-- ==========================================================

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(50)  NOT NULL DEFAULT 'user', -- 'admin' | 'manager' | 'user'
  manager_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  agent_code    INTEGER,       -- גשר בין משתמש מחובר לסוכן בקבצי האקסל (NULL = לא מקושר לסוכן, כמו Admin)
  totp_secret   VARCHAR(64),           -- סוד ה-TOTP (Google Authenticator); NULL = עדיין לא נוצר
  totp_enabled  BOOLEAN NOT NULL DEFAULT false, -- true רק אחרי שהמשתמש אימת קוד בפעם הראשונה
  created_at    TIMESTAMP DEFAULT NOW()
);

-- טבלת דוגמה לנתוני מכירות ששייכים למשתמש מסוים (מהשלד המקורי - עדיין בשימוש להדגמה)
CREATE TABLE IF NOT EXISTS sales (
  id          SERIAL PRIMARY KEY,
  owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer    VARCHAR(255) NOT NULL,
  amount      NUMERIC(12,2) NOT NULL,
  sale_date   DATE NOT NULL DEFAULT CURRENT_DATE
);

-- אינדקס שמאיץ את השאילתה הרקורסיבית להיררכיה
CREATE INDEX IF NOT EXISTS idx_users_manager_id ON users(manager_id);
CREATE INDEX IF NOT EXISTS idx_sales_owner_id ON sales(owner_id);

-- ==========================================================
-- דשבורד יעדים - טבלאות שמוזנות מ-3 קבצי האקסל
-- ==========================================================

-- מ"סיווג_סוכנים_לתחומים.xlsx" - לאיזה תחום כל קוד סוכן משתייך
CREATE TABLE IF NOT EXISTS agent_classification (
  agent_code  INTEGER PRIMARY KEY,
  agent_name  VARCHAR(255),
  domain      VARCHAR(100) NOT NULL   -- 'מכירות סיטונאים' | 'סניפי ל.כ' | 'מוסדיים' | 'משווקים' | 'משרד הביטחון'
);

-- מ"יעדי_סוכנים_לפי_חודש.xlsx" - יעד חודשי לכל סוכן
CREATE TABLE IF NOT EXISTS agent_targets (
  id            SERIAL PRIMARY KEY,
  agent_code    INTEGER NOT NULL,
  agent_name    VARCHAR(255),
  year          INTEGER NOT NULL,
  month         INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  target_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  UNIQUE(agent_code, year, month)
);

-- מ"מטריצת_מכירות_חודשי_לסוכן.xlsx" - מכירה בפועל, חודש בחודשו
CREATE TABLE IF NOT EXISTS agent_sales_monthly (
  id            SERIAL PRIMARY KEY,
  agent_code    INTEGER NOT NULL,
  agent_name    VARCHAR(255),
  year          INTEGER NOT NULL,
  month         INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  sales_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
  UNIQUE(agent_code, year, month)
);

CREATE INDEX IF NOT EXISTS idx_targets_period ON agent_targets(year, month);
CREATE INDEX IF NOT EXISTS idx_sales_monthly_period ON agent_sales_monthly(year, month);

-- ==========================================================
-- נושאים (לתפריט העליון) + הרשאות משתמש-נושא
-- Admin רואה הכל תמיד ולא צריך שורה ב-user_topic_access.
-- Manager/User רואים רק נושאים שסומנו להם כאן.
-- ==========================================================
CREATE TABLE IF NOT EXISTS topics (
  id          SERIAL PRIMARY KEY,
  key         VARCHAR(50) UNIQUE NOT NULL,   -- 'sales' | 'procurement' | 'warehouse' | ...
  name        VARCHAR(100) NOT NULL,          -- 'מכירות' | 'רכש' | 'פעילות מחסן' | ...
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_topic_access (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, topic_id)
);

INSERT INTO topics (key, name, sort_order) VALUES
  ('sales', 'מכירות', 1),
  ('procurement', 'רכש', 2),
  ('warehouse', 'פעילות מחסן', 3)
ON CONFLICT (key) DO NOTHING;

-- ==========================================================
-- דוח "יעדים רבעוניים ללקוח" - נתוני יעד/בפועל רבעוניים ברמת לקוח בודד (לא ברמת קוד סוכן המספרי)
-- שים לב: agent_name הוא טקסט חופשי מהקובץ (שם הסוכן כפי שמופיע שם) - לא agent_code המספרי
-- שמשמש בשאר המערכת. לכן הדוח הזה, בשלב הזה, זמין ל-Admin בלבד (אין עדיין הצלבה בין השם למספר קוד סוכן).
-- ==========================================================
CREATE TABLE IF NOT EXISTS customer_quarterly_targets (
  id                SERIAL PRIMARY KEY,
  customer_id       BIGINT NOT NULL,
  customer_name     VARCHAR(255),
  agent_name        VARCHAR(255),
  agent_phone       VARCHAR(50),
  target_type       VARCHAR(255),          -- הטקסט המקורי מהקובץ (חופשי)
  target_type_simple VARCHAR(20),          -- 'רבעוני' | 'שנתי' | 'אחר / הערה' (מחושב)
  year              INTEGER NOT NULL,
  q1_target NUMERIC(14,2) DEFAULT 0, q1_actual NUMERIC(14,2) DEFAULT 0, q1_credit NUMERIC(14,2) DEFAULT 0,
  q2_target NUMERIC(14,2) DEFAULT 0, q2_actual NUMERIC(14,2) DEFAULT 0, q2_credit NUMERIC(14,2) DEFAULT 0,
  q3_target NUMERIC(14,2) DEFAULT 0, q3_actual NUMERIC(14,2) DEFAULT 0, q3_credit NUMERIC(14,2) DEFAULT 0,
  q4_target NUMERIC(14,2) DEFAULT 0, q4_actual NUMERIC(14,2) DEFAULT 0, q4_credit NUMERIC(14,2) DEFAULT 0,
  annual_target     NUMERIC(14,2) DEFAULT 0,
  last_year_sales   NUMERIC(14,2) DEFAULT 0,
  m1 NUMERIC(14,2) DEFAULT 0, m2 NUMERIC(14,2) DEFAULT 0, m3 NUMERIC(14,2) DEFAULT 0,
  m4 NUMERIC(14,2) DEFAULT 0, m5 NUMERIC(14,2) DEFAULT 0, m6 NUMERIC(14,2) DEFAULT 0,
  UNIQUE(customer_id, year)
);

-- ==========================================================
-- שאילתת עזר (לא חובה כ-VIEW, אפשר גם ישירות בקוד):
-- מחזירה את כל ה-IDs שמשתמש נתון (viewerId) מורשה לראות,
-- כולל את עצמו וכל מי שנמצא תחתיו בהיררכיה בכל עומק.
-- ==========================================================
-- WITH RECURSIVE subordinates AS (
--   SELECT id FROM users WHERE id = $1          -- המשתמש עצמו
--   UNION ALL
--   SELECT u.id FROM users u
--   INNER JOIN subordinates s ON u.manager_id = s.id
-- )
-- SELECT id FROM subordinates;
