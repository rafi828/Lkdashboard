const { buildLogoutCookie } = require('../../lib/auth');

export default function handler(req, res) {
  res.setHeader('Set-Cookie', buildLogoutCookie());
  return res.status(200).json({ ok: true });
}
