const { getPool } = require('./db');
const { parseSingleFile } = require('./api-helpers');
const { requirePermission } = require('./access');
const { recordFileUpload } = require('./file-uploads');
const { parseBomTreeFile, parseBomSalesFile, parseBomStockFile, parseBomOrdersFile } = require('./xlsx-parser');

// ==========================================================
// "הזמנות רכש לפי עצי מוצר" - שמירת ארבעת הקבצים וקריאת הנתונים לדוח.
// עצי מוצר נשמרים קבוע (טעינה מעדכנת רק את פריטי האב שבקובץ). מכירות / מלאי / הזמנות ספקים = תמונת מצב,
// כל טעינה מחליפה את הקודמת. החישוב עצמו (פיצוץ עץ, חודשי מלאי, המלצה) נעשה במסך - pages/dashboard/bom-orders.js.
// ==========================================================

const n = (x) => Number(x).toLocaleString('he-IL');

async function inTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await fn(client);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function saveFileInfo(client, fileKey, info) {
  await client.query(
    `INSERT INTO bom_file_info (file_key, info) VALUES ($1, $2)
     ON CONFLICT (file_key) DO UPDATE SET info = EXCLUDED.info`,
    [fileKey, JSON.stringify(info)]
  );
}

const col = (rows, k) => rows.map((r) => r[k]);

const SAVERS = {
  'bom-tree': async (buffer) => {
    const { edges, names } = parseBomTreeFile(buffer);
    const parents = Array.from(new Set(edges.map((e) => e.parent)));
    let replaced = 0;
    await inTransaction(async (client) => {
      const del = await client.query('DELETE FROM bom_edges WHERE parent_code = ANY($1::varchar[])', [parents]);
      replaced = del.rowCount;
      await client.query(
        `INSERT INTO bom_edges (parent_code, child_code, qty)
         SELECT * FROM UNNEST($1::varchar[], $2::varchar[], $3::numeric[])`,
        [col(edges, 'parent'), col(edges, 'child'), col(edges, 'qty')]
      );
      const codes = Object.keys(names);
      await client.query(
        `INSERT INTO bom_items (code, name) SELECT * FROM UNNEST($1::varchar[], $2::text[])
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`,
        [codes, codes.map((c) => names[c])]
      );
      const { rows } = await client.query('SELECT COUNT(*)::int AS edges, COUNT(DISTINCT parent_code)::int AS parents FROM bom_edges');
      await saveFileInfo(client, 'bom-tree', rows[0]);
    });
    return {
      rows: edges.length,
      summary: `${n(parents.length)} פריטי אב עודכנו (${n(edges.length)} קשרי אב-בן; ${n(replaced)} קשרים קודמים שלהם הוחלפו). `
        + 'פריטי אב שלא בקובץ - נשמרו כמו שהם.',
    };
  },

  'bom-sales': async (buffer) => {
    const { rows, period } = parseBomSalesFile(buffer);
    await inTransaction(async (client) => {
      await client.query('DELETE FROM bom_sales');
      await client.query(
        `INSERT INTO bom_sales (code, name, qty, has_qty, amount)
         SELECT * FROM UNNEST($1::varchar[], $2::text[], $3::numeric[], $4::boolean[], $5::numeric[])`,
        [col(rows, 'code'), col(rows, 'name'), col(rows, 'qty'), col(rows, 'has_qty'), col(rows, 'amount')]
      );
      await saveFileInfo(client, 'bom-sales', period || {});
    });
    return {
      rows: rows.length,
      summary: period
        ? `טווח: ${period.from} – ${period.to} (${n(period.days)} ימים)`
        : 'לא נמצא טווח תאריכים בשורה הראשונה - בדוח יש להזין את מספר החודשים ידנית',
    };
  },

  'bom-stock': async (buffer) => {
    const { rows, totalFound, productionFound } = parseBomStockFile(buffer);
    await inTransaction(async (client) => {
      await client.query('DELETE FROM bom_stock');
      await client.query(
        `INSERT INTO bom_stock (code, name, total, production)
         SELECT * FROM UNNEST($1::varchar[], $2::text[], $3::numeric[], $4::numeric[])`,
        [col(rows, 'code'), col(rows, 'name'), col(rows, 'total'), col(rows, 'production')]
      );
      await saveFileInfo(client, 'bom-stock', { totalFound, productionFound });
    });
    const warn = [];
    if (!totalFound) warn.push('⚠ לא נמצאה עמודת "סה"כ" בשורה 2 - נלקחה עמודה C');
    if (!productionFound) warn.push('⚠ לא נמצאה עמודת "ייצור" - מחסן ייצור = 0');
    return { rows: rows.length, summary: warn.length ? warn.join(' · ') : null };
  },

  'bom-orders': async (buffer) => {
    const { rows } = parseBomOrdersFile(buffer);
    await inTransaction(async (client) => {
      await client.query('DELETE FROM bom_supplier_orders');
      await client.query(
        `INSERT INTO bom_supplier_orders (code, name, stock, by_customers, by_suppliers, future)
         SELECT * FROM UNNEST($1::varchar[], $2::text[], $3::numeric[], $4::numeric[], $5::numeric[], $6::numeric[])`,
        [col(rows, 'code'), col(rows, 'name'), col(rows, 'stock'), col(rows, 'by_customers'), col(rows, 'by_suppliers'), col(rows, 'future')]
      );
      await saveFileInfo(client, 'bom-orders', {});
    });
    return { rows: rows.length, summary: null };
  },
};

// handler משותף לארבעת ה-API של הטעינה (pages/api/upload/bom-*.js)
async function handleBomUpload(req, res, fileKey) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requirePermission(req, res, 'bomorders.upload');
  if (!user) return;
  try {
    const { buffer, filename } = await parseSingleFile(req);
    const result = await SAVERS[fileKey](buffer);
    await recordFileUpload(fileKey, filename, user.id);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'שגיאה בעיבוד הקובץ' });
  }
}

// כל הנתונים שהדוח צריך. מכירות/מלאי/הזמנות - רק לפריטים שמופיעים בעצי המוצר (שאר הפריטים לא רלוונטיים לדוח).
async function getBomOrdersData() {
  const pool = getPool();
  const [edges, names, sales, stock, orders, files] = await Promise.all([
    pool.query('SELECT parent_code AS parent, child_code AS child, qty::float AS qty FROM bom_edges'),
    pool.query('SELECT code, name FROM bom_items'),
    pool.query(`SELECT code, name, qty::float AS qty, has_qty, amount::float AS amount FROM bom_sales
                WHERE code IN (SELECT parent_code FROM bom_edges UNION SELECT child_code FROM bom_edges)`),
    pool.query(`SELECT code, name, total::float AS total, production::float AS production FROM bom_stock
                WHERE code IN (SELECT parent_code FROM bom_edges UNION SELECT child_code FROM bom_edges)`),
    pool.query(`SELECT code, name, by_customers::float AS by_customers, by_suppliers::float AS by_suppliers FROM bom_supplier_orders
                WHERE code IN (SELECT parent_code FROM bom_edges UNION SELECT child_code FROM bom_edges)`),
    pool.query(`SELECT k.file_key, f.filename, f.uploaded_at, i.info
                FROM UNNEST(ARRAY['bom-tree','bom-sales','bom-stock','bom-orders']) AS k(file_key)
                LEFT JOIN file_uploads f ON f.file_key = k.file_key
                LEFT JOIN bom_file_info i ON i.file_key = k.file_key`),
  ]);
  return {
    edges: edges.rows,
    names: Object.fromEntries(names.rows.map((r) => [r.code, r.name])),
    sales: sales.rows,
    stock: stock.rows,
    orders: orders.rows,
    files: Object.fromEntries(files.rows.map((r) => [r.file_key, r.filename ? { filename: r.filename, uploadedAt: r.uploaded_at, info: r.info || {} } : null])),
  };
}

module.exports = { handleBomUpload, getBomOrdersData };
