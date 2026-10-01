const { getPool } = require('../../lib/db');
const { requireAdmin } = require('../../lib/access');
const { getVisibleUserIds } = require('../../lib/permissions');

export default async function handler(req, res) {
  // API ישן (טבלת sales לדוגמה, לא בשימוש פעיל) - נעול ל-Admin בלבד כדי שלא יהיה "דלת אחורית" לנתונים
  const currentUser = await requireAdmin(req, res);
  if (!currentUser) return;

  const visibleIds = await getVisibleUserIds(currentUser);

  const pool = getPool();
  const { rows: sales } = await pool.query(
    `
    SELECT s.id, s.customer, s.amount, s.sale_date, u.name AS owner_name, u.id AS owner_id
    FROM sales s
    JOIN users u ON u.id = s.owner_id
    WHERE s.owner_id = ANY($1::int[])
    ORDER BY s.sale_date DESC
    `,
    [visibleIds]
  );

  const { rows: visibleUsers } = await pool.query(
    `SELECT id, name, role, manager_id FROM users WHERE id = ANY($1::int[]) ORDER BY id`,
    [visibleIds]
  );

  return res.status(200).json({
    currentUser: {
      id: currentUser.id,
      name: currentUser.name,
      role: currentUser.role,
    },
    visibleUsers,
    sales,
    totalAmount: sales.reduce((sum, s) => sum + Number(s.amount), 0),
  });
}
