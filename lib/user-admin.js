const { ALL_PERMISSION_KEYS } = require('./reports');

// עזרים משותפים ל-API של ניהול משתמשים / תבניות הרשאה

const ROLES = ['admin', 'manager', 'user'];

// מקבל מערך / מחרוזת "101, 205" ומחזיר מערך מספרים ייחודי, או null אם יש ערך לא תקין
function parseAgentCodes(input) {
  if (input === null || input === undefined || input === '') return [];
  const parts = Array.isArray(input) ? input : String(input).split(/[,\s]+/);
  const codes = [];
  for (const p of parts) {
    if (p === '' || p === null || p === undefined) continue;
    const n = Number(p);
    if (!Number.isInteger(n) || n <= 0) return null;
    if (!codes.includes(n)) codes.push(n);
  }
  return codes;
}

function cleanPermissionKeys(keys) {
  if (!Array.isArray(keys)) return null;
  return [...new Set(keys)].filter((k) => ALL_PERMISSION_KEYS.includes(k));
}

const AGENT_CODE_REQUIRED_MSG = 'לא ניתן לשמור משתמש מסוג "סוכן" בלי קוד סוכן. יש להזין לפחות קוד סוכן אחד.';

async function setAgentCodes(client, userId, codes) {
  await client.query('DELETE FROM user_agent_codes WHERE user_id = $1', [userId]);
  for (const code of codes) {
    await client.query('INSERT INTO user_agent_codes (user_id, agent_code) VALUES ($1,$2) ON CONFLICT DO NOTHING', [userId, code]);
  }
}

module.exports = { ROLES, parseAgentCodes, cleanPermissionKeys, setAgentCodes, AGENT_CODE_REQUIRED_MSG };
