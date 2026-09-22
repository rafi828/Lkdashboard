const { getUserFromRequest } = require('../../lib/auth');
const { getVisibleTopics } = require('../../lib/topics');

export default async function handler(req, res) {
  const currentUser = getUserFromRequest(req);
  if (!currentUser) return res.status(401).json({ error: 'לא מחובר' });

  const topics = await getVisibleTopics(currentUser);
  return res.status(200).json({ topics, isAdmin: currentUser.role === 'admin' });
}
