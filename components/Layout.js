import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Sidebar from './Sidebar';

export default function Layout({ children }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    fetch('/api/me')
      .then((res) => {
        if (res.status === 401) {
          router.push('/login');
        } else {
          setChecked(true);
        }
      })
      .catch(() => setChecked(true));
  }, [router]);

  if (!checked) return null;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', direction: 'rtl', fontFamily: '-apple-system, "Segoe UI", Arial, sans-serif', background: '#f4f5f7' }}>
      <Sidebar />
      <div style={{ flexGrow: 1, minWidth: 0, padding: '36px 40px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        {children}
      </div>
    </div>
  );
}
