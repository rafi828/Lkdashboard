// סקריפט ליצירת נתוני דוגמה: אדמין, מנג'ר, ושני יוזרים תחתיו
// הרצה: node db/seed.js  (או npm run seed)

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);

  const passwordHash = await bcrypt.hash('password123', 10);

  // מוחקים נתונים קיימים כדי שאפשר להריץ כמה פעמים בלי כפילויות
  await pool.query('TRUNCATE sales, users RESTART IDENTITY CASCADE');

  const { rows: [admin] } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, manager_id)
     VALUES ('אדמין ראשי', 'admin@example.com', $1, 'admin', NULL) RETURNING id`,
    [passwordHash]
  );

  const { rows: [manager] } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, manager_id)
     VALUES ('מנהל מכירות', 'manager@example.com', $1, 'manager', $2) RETURNING id`,
    [passwordHash, admin.id]
  );

  const { rows: [user1] } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, manager_id)
     VALUES ('נציג מכירות א', 'user1@example.com', $1, 'user', $2) RETURNING id`,
    [passwordHash, manager.id]
  );

  const { rows: [user2] } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, manager_id)
     VALUES ('נציג מכירות ב', 'user2@example.com', $1, 'user', $2) RETURNING id`,
    [passwordHash, manager.id]
  );

  await pool.query(
    `INSERT INTO sales (owner_id, customer, amount) VALUES
     ($1, 'לקוח 1', 1200),
     ($1, 'לקוח 2', 800),
     ($2, 'לקוח 3', 1500),
     ($2, 'לקוח 4', 300)`,
    [user1.id, user2.id]
  );

  console.log('נתוני דוגמה נוצרו בהצלחה:');
  console.log('  admin@example.com   / password123  (Admin - רואה הכל)');
  console.log('  manager@example.com / password123  (Manager - רואה את עצמו + 2 היוזרים)');
  console.log('  user1@example.com   / password123  (User - רואה רק את הנתונים שלו)');
  console.log('  user2@example.com   / password123  (User - רואה רק את הנתונים שלו)');

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
