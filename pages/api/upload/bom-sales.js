const { handleBomUpload } = require('../../../lib/bom-orders');

export const config = { api: { bodyParser: false } };

// "הזמנות רכש לפי עצי מוצר" - טעינת קובץ (הלוגיקה ב-lib/bom-orders.js)
export default function handler(req, res) {
  return handleBomUpload(req, res, 'bom-sales');
}
