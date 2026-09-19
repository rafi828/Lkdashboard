import Link from 'next/link';
import { useRouter } from 'next/router';

const NAV = [
  {
    label: 'תקציב מול ביצוע',
    items: [
      { href: '/dashboard/targets', text: 'דשבורד יעדים' },
      { href: '/dashboard/trends', text: 'מגמות והיסטוריה' },
      { href: '/upload', text: 'טעינת קבצים' },
    ],
  },
  {
    label: 'מערכת',
    items: [{ href: '/users', text: 'ניהול משתמשים' }],
  },
];

export default function Sidebar() {
  const router = useRouter();

  return (
    <div style={styles.sidebar}>
      <div style={styles.brand}>
        <img src="/logos/lc-logo.png" alt="ל.כ" style={styles.brandLogo} />
        <div style={styles.brandName}>כלי עבודה וציוד בע"מ</div>
      </div>

      {NAV.map((group) => (
        <div key={group.label} style={styles.navGroup}>
          <div style={styles.navLabel}>{group.label}</div>
          {group.items.map((item) => {
            const active = router.pathname === item.href;
            return (
              <Link key={item.href} href={item.href} style={active ? styles.navItemActive : styles.navItem}>
                {item.text}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const styles = {
  sidebar: {
    width: 230, flexShrink: 0, background: '#0a0a0a', padding: '32px 18px',
    display: 'flex', flexDirection: 'column', gap: 32, position: 'sticky', top: 0,
    height: '100vh', overflowY: 'auto', boxSizing: 'border-box',
  },
  brand: { display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px' },
  brandLogo: { width: 34, height: 34, objectFit: 'contain', flexShrink: 0 },
  brandName: { fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1.3 },
  navGroup: { display: 'flex', flexDirection: 'column', gap: 10 },
  navLabel: { fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: 0.5, padding: '0 14px' },
  navItem: {
    display: 'block', color: '#d1d5db', fontSize: 14, fontWeight: 500, padding: '10px 14px',
    borderRadius: 8, textDecoration: 'none',
  },
  navItemActive: {
    display: 'block', background: '#dc2626', color: '#fff', fontSize: 14, fontWeight: 700,
    padding: '10px 14px', borderRadius: 8, textDecoration: 'none',
  },
};
