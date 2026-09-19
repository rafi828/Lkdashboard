const { getPool } = require('./db');

/**
 * מחזיר אילו קודי סוכן המשתמש המחובר מורשה לראות בדשבורד היעדים.
 * - admin  -> { all: true }  (הכל, בלי סינון)
 * - manager/user -> { all: false, codes: [...] } המבוסס על agent_code של עצמו + כל מי שתחתיו בהיררכיה
 *   (אותה שאילתה רקורסיבית כמו lib/permissions.js, אבל אוספת agent_code במקום user id)
 */
async function getVisibleAgentCodes(currentUser) {
  if (currentUser.role === 'admin') {
    return { all: true };
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `
    WITH RECURSIVE subordinates AS (
      SELECT id, agent_code FROM users WHERE id = $1
      UNION ALL
      SELECT u.id, u.agent_code
      FROM users u
      INNER JOIN subordinates s ON u.manager_id = s.id
    )
    SELECT agent_code FROM subordinates WHERE agent_code IS NOT NULL
    `,
    [currentUser.id]
  );

  return { all: false, codes: rows.map((r) => r.agent_code) };
}

module.exports = { getVisibleAgentCodes };
