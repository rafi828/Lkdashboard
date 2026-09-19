const { getPool } = require('./db');

/**
 * מחזיר את רשימת ה-IDs של כל המשתמשים שהמשתמש הנוכחי מורשה לראות.
 *
 * - admin  -> כל המשתמשים במערכת
 * - manager/user -> את עצמו + כל מי שנמצא תחתיו בהיררכיה, בכל עומק
 *   (עובד עם עץ בעומק בלתי מוגבל, בזכות שאילתה רקורסיבית ב-Postgres)
 */
async function getVisibleUserIds(currentUser) {
  const pool = getPool();

  if (currentUser.role === 'admin') {
    const { rows } = await pool.query('SELECT id FROM users');
    return rows.map((r) => r.id);
  }

  const { rows } = await pool.query(
    `
    WITH RECURSIVE subordinates AS (
      SELECT id FROM users WHERE id = $1
      UNION ALL
      SELECT u.id
      FROM users u
      INNER JOIN subordinates s ON u.manager_id = s.id
    )
    SELECT id FROM subordinates
    `,
    [currentUser.id]
  );

  return rows.map((r) => r.id);
}

module.exports = { getVisibleUserIds };
