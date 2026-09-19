const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cookie = require('cookie');

const COOKIE_NAME = 'session_token';

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

// טוקן זמני (5 דקות) שמאשר "הסיסמה נכונה, ממתין לקוד TOTP" - עדיין לא session מלא
function signPendingToken(userId) {
  return jwt.sign({ id: userId, purpose: 'totp-pending' }, process.env.JWT_SECRET, { expiresIn: '5m' });
}

function verifyPendingToken(token) {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.purpose !== 'totp-pending') return null;
    return payload;
  } catch {
    return null;
  }
}

function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

async function checkPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// שולף את המשתמש המחובר מתוך ה-cookie על בקשת API
function getUserFromRequest(req) {
  const cookies = cookie.parse(req.headers.cookie || '');
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  return verifyToken(token); // { id, email, role, name }
}

// יוצר את ה-Set-Cookie header להתחברות
function buildSessionCookie(token) {
  return cookie.serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 ימים
  });
}

// ה-cookie למחיקה בהתנתקות
function buildLogoutCookie() {
  return cookie.serialize(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

module.exports = {
  signToken,
  signPendingToken,
  verifyPendingToken,
  verifyToken,
  checkPassword,
  getUserFromRequest,
  buildSessionCookie,
  buildLogoutCookie,
};
