const { parseSingleFile } = require('../../../lib/api-helpers');
const { requirePermission } = require('../../../lib/access');
const { parseSkuLookupFile } = require('../../../lib/xlsx-parser');

export const config = { api: { bodyParser: false } };

// "חיפוש לפי מסמך": קורא קובץ אקסל/CSV ומחזיר את השורות (מק"ט/תיאור/כמות). לא נשמר כלום -
// ההתאמה מול הדוח נעשית במסך, והתוצאה זמנית.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requirePermission(req, res, 'skucompare.view');
  if (!user) return;

  try {
    const { buffer, filename } = await parseSingleFile(req);
    const { mode, lines } = parseSkuLookupFile(buffer);
    if (lines.length === 0) {
      return res.status(400).json({ error: 'לא נמצאו בקובץ מק"טים (אין עמודת מק"ט/קוד/פריט, ואין תאים שנראים כמו מק"ט)' });
    }
    return res.status(200).json({ filename, mode, lines });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'שגיאה בקריאת הקובץ' });
  }
}
