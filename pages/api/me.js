const { getUserFromRequest } = require('../../lib/auth');

export default function handler(req, res) {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: 'לא מחובר' });
  return res.status(200).json({ user });
}
