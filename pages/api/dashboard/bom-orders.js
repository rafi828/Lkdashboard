const { requirePermission } = require('../../../lib/access');
const { getBomOrdersData } = require('../../../lib/bom-orders');

// נתוני "הזמנות רכש לפי עצי מוצר": עצים + מכירות/מלאי/הזמנות לפריטי העצים + פרטי הטעינות. החישוב נעשה במסך.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requirePermission(req, res, 'bomorders.view');
  if (!user) return;
  return res.status(200).json(await getBomOrdersData());
}
