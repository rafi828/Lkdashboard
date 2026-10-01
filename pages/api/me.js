const { requireUser } = require('../../lib/access');

// המשתמש המחובר + ההרשאות האפקטיביות שלו (נטען טרי מה-DB). משמש את Layout/TopNav/הדשבורדים
// להסתרת כפתורים ודוחות - אבל ההגנה האמיתית היא בכל API בנפרד (requirePermission).
export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  return res.status(200).json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      agentCodes: user.agentCodes,
      permissions: Array.from(user.permissions),
    },
  });
}
