const { getPool } = require('./db');
const { REPORTS, viewPermissionOf } = require('./reports');

// כל הנושאים במערכת, בסדר תצוגה
async function getAllTopics() {
  const pool = getPool();
  const { rows } = await pool.query('SELECT id, key, name, sort_order FROM topics ORDER BY sort_order');
  return rows;
}

// הנושאים שהמשתמש המחובר רואה בתפריט. Admin -> הכל.
// אחרת -> רק נושאים שיש בהם לפחות דוח אחד שיש לו הרשאת צפייה בו (לפי התבנית + החריגים שלו).
async function getVisibleTopics(currentUser) {
  const topics = await getAllTopics();
  if (currentUser.role === 'admin') return topics;
  const visibleTopicKeys = new Set(
    REPORTS.filter((r) => {
      const viewKey = viewPermissionOf(r);
      return viewKey && currentUser.permissions.has(viewKey);
    }).map((r) => r.topic)
  );
  return topics.filter((t) => visibleTopicKeys.has(t.key));
}

module.exports = { getAllTopics, getVisibleTopics };
