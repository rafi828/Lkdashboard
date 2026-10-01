-- ==========================================================
-- עדכון חד-פעמי: תבניות הרשאה + חריגים + כמה קודי סוכן למשתמש + קוד סוכן ביעדים רבעוניים
-- להריץ פעם אחת ב-Railway: Postgres -> Database -> Data -> Query -> להדביק את כל הקובץ -> Run.
-- בטוח להרצה חוזרת (לא מוחק כלום, לא יוצר כפילויות).
-- ==========================================================

-- 1. תבניות הרשאה
CREATE TABLE IF NOT EXISTS permission_templates (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) UNIQUE NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS permission_template_items (
  template_id    INTEGER NOT NULL REFERENCES permission_templates(id) ON DELETE CASCADE,
  permission_key VARCHAR(100) NOT NULL,
  PRIMARY KEY (template_id, permission_key)
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS permission_template_id INTEGER REFERENCES permission_templates(id) ON DELETE SET NULL;

-- 2. חריגים אישיים (true = להוסיף מעבר לתבנית, false = להסיר מהתבנית)
CREATE TABLE IF NOT EXISTS user_permission_overrides (
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_key VARCHAR(100) NOT NULL,
  granted        BOOLEAN NOT NULL,
  PRIMARY KEY (user_id, permission_key)
);

-- 3. כמה קודי סוכן למשתמש אחד
CREATE TABLE IF NOT EXISTS user_agent_codes (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_code INTEGER NOT NULL,
  PRIMARY KEY (user_id, agent_code)
);
-- העברת קוד הסוכן הקיים של כל משתמש לטבלה החדשה
INSERT INTO user_agent_codes (user_id, agent_code)
SELECT id, agent_code FROM users WHERE agent_code IS NOT NULL
ON CONFLICT DO NOTHING;

-- 4. קוד סוכן ביעדים רבעוניים (עמודה "קוד סוכן מלקוח - 2" בקובץ). יתמלא בטעינה הבאה של הקובץ.
ALTER TABLE customer_quarterly_targets ADD COLUMN IF NOT EXISTS agent_code INTEGER;
CREATE INDEX IF NOT EXISTS idx_cqt_agent_code ON customer_quarterly_targets(agent_code);

-- 5. תבניות התחלתיות + שיוך משתמשים קיימים, כדי שאף אחד לא יאבד גישה שיש לו היום:
--    מי שסומן לו היום "מכירות" מקבל צפייה ב"תקציב מול ביצוע" (מה שהוא רואה היום).
--    "יעדים רבעוניים" היה עד היום Admin בלבד - מוסיפים אותו לתבנית בלחיצה אחת במסך ניהול המשתמשים.
INSERT INTO permission_templates (name) VALUES ('מנהל מכירות'), ('סוכן') ON CONFLICT (name) DO NOTHING;
INSERT INTO permission_template_items (template_id, permission_key)
SELECT id, 'targets.view' FROM permission_templates WHERE name IN ('מנהל מכירות', 'סוכן')
ON CONFLICT DO NOTHING;

UPDATE users u SET permission_template_id = t.id
FROM permission_templates t
WHERE u.permission_template_id IS NULL
  AND u.role IN ('manager', 'user')
  AND t.name = CASE u.role WHEN 'manager' THEN 'מנהל מכירות' ELSE 'סוכן' END
  AND EXISTS (
    SELECT 1 FROM user_topic_access uta JOIN topics tp ON tp.id = uta.topic_id
    WHERE uta.user_id = u.id AND tp.key = 'sales'
  );
