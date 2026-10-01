const { requireUser } = require('../../lib/access');
const { getVisibleTopics } = require('../../lib/topics');

export default async function handler(req, res) {
  const currentUser = await requireUser(req, res);
  if (!currentUser) return;

  const topics = await getVisibleTopics(currentUser);
  return res.status(200).json({ topics, isAdmin: currentUser.role === 'admin' });
}
