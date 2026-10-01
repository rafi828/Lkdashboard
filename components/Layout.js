import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import TopNav from './TopNav';
import { MeContext, IfCan, useMe, can } from './MeContext';

export { IfCan, useMe, can };

// permission: מפתח הרשאה שנדרש כדי לראות את העמוד (למשל 'targets.view'). adminOnly: עמוד ל-Admin בלבד.
// זו רק שכבת תצוגה - ההגנה האמיתית היא ב-API של כל דוח.
export default function Layout({ children, permission, adminOnly }) {
  const router = useRouter();
  const [me, setMe] = useState(null);

  useEffect(() => {
    fetch('/api/me')
      .then((res) => {
        if (res.status === 401) {
          router.push('/login');
          return null;
        }
        return res.json();
      })
      .then((d) => d?.user && setMe(d.user))
      .catch(() => {});
  }, [router]);

  if (!me) return null;

  const allowed = adminOnly ? me.role === 'admin' : !permission || can(me, permission);

  return (
    <MeContext.Provider value={me}>
      <div style={{ minHeight: '100vh', direction: 'rtl', fontFamily: '-apple-system, "Segoe UI", Arial, sans-serif', background: '#f4f5f7' }}>
        <TopNav />
        <div style={{ padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 1200, margin: '0 auto' }}>
          {allowed ? children : (
            <div style={{ background: '#fff', border: '1px solid #e9e9ec', borderRadius: 12, padding: 24, fontSize: 14, color: '#374151' }}>
              אין לך הרשאה לצפות בעמוד הזה. אם אתה צריך גישה - פנה למנהל המערכת.
            </div>
          )}
        </div>
      </div>
    </MeContext.Provider>
  );
}
