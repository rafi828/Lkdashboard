const { getPool } = require('./db');
const { getUserFromRequest } = require('./auth');
const { ALL_PERMISSION_KEYS } = require('./reports');

// ==========================================================
// הרשאות: תבנית הרשאה + חריגים אישיים.
// הכל נקרא מה-DB בכל בקשה (לא מה-cookie), כדי ששינוי הרשאה / תפקיד / מחיקת משתמש
// ייכנסו לתוקף מיד ולא רק אחרי שה-session (7 ימים) יפוג.
// ==========================================================

// הרשאות אפקטיביות = (הרשאות התבנית + חריגים "הוסף") - חריגים "הסר". Admin -> הכל.
async function getEffectivePermissions(pool, user) {
  if (user.role === 'admin') return new Set(ALL_PERMISSION_KEYS);

  const perms = new Set();
  if (user.permission_template_id) {
    const { rows } = await pool.query(
      'SELECT permission_key FROM permission_template_items WHERE template_id = $1',
      [user.permission_template_id]
    );
    rows.forEach((r) => perms.add(r.permission_key));
  }
  const { rows: overrides } = await pool.query(
    'SELECT permission_key, granted FROM user_permission_overrides WHERE user_id = $1',
    [user.id]
  );
  overrides.forEach((o) => (o.granted ? perms.add(o.permission_key) : perms.delete(o.permission_key)));
  return perms;
}

async function getAgentCodes(pool, userId) {
  const { rows } = await pool.query(
    'SELECT agent_code FROM user_agent_codes WHERE user_id = $1 ORDER BY agent_code',
    [userId]
  );
  return rows.map((r) => r.agent_code);
}

// המשתמש המחובר, טרי מה-DB: { id, name, email, role, permission_template_id, permissions:Set, agentCodes:[] }
// מחזיר null אם אין cookie תקין או שהמשתמש כבר לא קיים.
async function loadCurrentUser(req) {
  const token = getUserFromRequest(req);
  if (!token) return null;

  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT id, name, email, role, permission_template_id FROM users WHERE id = $1',
    [token.id]
  );
  const user = rows[0];
  if (!user) return null;

  user.permissions = await getEffectivePermissions(pool, user);
  user.agentCodes = await getAgentCodes(pool, user.id);
  return user;
}

function hasPermission(user, key) {
  return user.role === 'admin' || user.permissions.has(key);
}

// מחזיר את המשתמש, או null אחרי ששלח 401
async function requireUser(req, res) {
  const user = await loadCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: 'לא מחובר' });
    return null;
  }
  return user;
}

// מחזיר את המשתמש אם יש לו את ההרשאה, אחרת null אחרי ששלח 401/403
async function requirePermission(req, res, key) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (!hasPermission(user, key)) {
    res.status(403).json({ error: 'אין לך הרשאה לדוח/פעולה זו' });
    return null;
  }
  return user;
}

async function requireAdmin(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (user.role !== 'admin') {
    res.status(403).json({ error: 'אין הרשאה לפעולה זו' });
    return null;
  }
  return user;
}

// היקף הנתונים בתוך דוח: Admin ומנהל מכירות -> הכל. סוכן -> רק קודי הסוכן שלו.
function getDataScope(user) {
  if (user.role === 'admin' || user.role === 'manager') return { all: true };
  return { all: false, codes: user.agentCodes };
}

module.exports = {
  loadCurrentUser,
  hasPermission,
  requireUser,
  requirePermission,
  requireAdmin,
  getDataScope,
};
