const { getPool } = require('./db');

// כל הנושאים במערכת, בסדר תצוגה
async function getAllTopics() {
  const pool = getPool();
  const { rows } = await pool.query('SELECT id, key, name, sort_order FROM topics ORDER BY sort_order');
  return rows;
}

// הנושאים שהמשתמש המחובר מורשה לראות. Admin -> הכל. אחרת -> רק מה שסומן ב-user_topic_access.
async function getVisibleTopics(currentUser) {
  const pool = getPool();
  if (currentUser.role === 'admin') {
    return getAllTopics();
  }
  const { rows } = await pool.query(
    `SELECT t.id, t.key, t.name, t.sort_order
     FROM topics t
     INNER JOIN user_topic_access uta ON uta.topic_id = t.id
     WHERE uta.user_id = $1
     ORDER BY t.sort_order`,
    [currentUser.id]
  );
  return rows;
}

module.exports = { getAllTopics, getVisibleTopics };
