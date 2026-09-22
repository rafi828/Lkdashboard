import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

// כל דוח קיים/עתידי משויך כאן ל-topic key שלו. topics שהמשתמש לא רואה (מ-/api/topics) לא יופיעו בתפריט "תפריט".
const REPORTS_BY_TOPIC = {
  sales: [
    { href: '/dashboard/targets', name: 'יעדים מול ביצוע', desc: 'יעדים מול בפועל, לפי תחום ולפי סוכן', available: true },
    { href: '/upload', name: 'טעינת קבצים', desc: 'העלאת קבצי יעדים / מכירות / סיווג', available: true },
    { href: null, name: 'יעדים רבעוניים ללקוח', desc: 'מעקב יעדי רבעון לפי לקוח', available: false },
  ],
  procurement: [{ href: null, name: 'דוחות רכש', desc: 'ייבנה בהמשך', available: false }],
  warehouse: [{ href: null, name: 'דוחות מחסן', desc: 'ייבנה בהמשך', available: false }],
};

const SYSTEM_ITEMS = [
  { href: '/users', name: 'ניהול משתמשים', desc: 'משתמשים, תפקידים, הרשאות לפי נושא' },
];

export default function TopNav() {
  const [topics, setTopics] = useState([]);
  const [openMenu, setOpenMenu] = useState(null); // 'menu' | 'system' | null
  const router = useRouter();

  useEffect(() => {
    fetch('/api/topics')
      .then((res) => res.json())
      .then((d) => d.topics && setTopics(d.topics));
  }, []);

  function toggle(name) {
    setOpenMenu((cur) => (cur === name ? null : name));
  }

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <div style={styles.topbar}>
      <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
        <div style={styles.menuRoot}>
          <button onClick={() => toggle('menu')} style={styles.menuBtn}>תפריט ▾</button>
          {openMenu === 'menu' && (
            <div style={styles.menuLvl1}>
              {topics.map((t) => (
                <TopicItem key={t.key} topic={t} onNavigate={() => setOpenMenu(null)} />
              ))}
              {topics.length === 0 && <div style={styles.emptyNote}>אין לך גישה לנושאים כרגע</div>}
            </div>
          )}
        </div>

        <div style={styles.menuRoot}>
          <button onClick={() => toggle('system')} style={styles.menuBtn}>מערכת ▾</button>
          {openMenu === 'system' && (
            <div style={{ ...styles.menuLvl1, minWidth: 230 }}>
              {SYSTEM_ITEMS.map((item) => (
                <Link key={item.href} href={item.href} style={styles.ddItem} onClick={() => setOpenMenu(null)}>
                  <div style={styles.ddName}>{item.name}</div>
                  <div style={styles.ddDesc}>{item.desc}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={styles.leftGroup}>
        <button onClick={handleLogout} style={styles.logoutBtn}>התנתקות</button>
        <div style={styles.brand}>
          <img src="/logos/lc-logo.png" alt="ל.כ" style={styles.brandLogo} />
          <div style={styles.brandName}>כלי עבודה וציוד בע"מ</div>
        </div>
      </div>
    </div>
  );
}

function TopicItem({ topic, onNavigate }) {
  const [hover, setHover] = useState(false);
  const reports = REPORTS_BY_TOPIC[topic.key] || [];

  return (
    <div style={styles.topicItem} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div style={styles.topicRow}>
        {topic.name} <span style={styles.arrow}>◂</span>
      </div>
      {hover && (
        <div style={styles.menuLvl2}>
          {reports.map((r) => (
            r.available ? (
              <Link key={r.name} href={r.href} style={styles.ddItem} onClick={onNavigate}>
                <div style={styles.ddName}>
                  {r.name} <span style={styles.activeChip}>זמין</span>
                </div>
                <div style={styles.ddDesc}>{r.desc}</div>
              </Link>
            ) : (
              <div key={r.name} style={{ ...styles.ddItem, ...styles.ddDisabled }}>
                <div style={styles.ddName}>
                  {r.name} <span style={styles.soonChip}>בקרוב</span>
                </div>
                <div style={styles.ddDesc}>{r.desc}</div>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  topbar: {
    background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 24px', height: 60, position: 'sticky', top: 0, zIndex: 20,
  },
  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  brandLogo: { width: 30, height: 30, objectFit: 'contain' },
  brandName: { fontSize: 13, fontWeight: 700, color: '#fff' },
  leftGroup: { display: 'flex', alignItems: 'center', gap: 16 },
  logoutBtn: { background: 'transparent', border: '1px solid #374151', color: '#d1d5db', fontSize: 12.5, fontWeight: 600, padding: '7px 14px', borderRadius: 8, cursor: 'pointer' },
  menuRoot: { position: 'relative', height: '100%', display: 'flex', alignItems: 'center' },
  menuBtn: { background: 'transparent', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, padding: '0 16px', height: '100%', cursor: 'pointer' },
  menuLvl1: {
    position: 'absolute', top: '100%', right: 0, background: '#fff', border: '1px solid #e9e9ec',
    borderRadius: '0 0 10px 10px', boxShadow: '0 12px 24px rgba(0,0,0,.14)', minWidth: 210, padding: 8, zIndex: 30,
  },
  topicItem: { position: 'relative' },
  topicRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px',
    borderRadius: 8, cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: '#111827',
  },
  arrow: { color: '#9ca3af', fontSize: 11 },
  menuLvl2: {
    position: 'absolute', top: 0, right: '100%', marginInlineEnd: 4, background: '#fff', border: '1px solid #e9e9ec',
    borderRadius: 10, boxShadow: '0 12px 24px rgba(0,0,0,.14)', minWidth: 250, padding: 10, zIndex: 31,
  },
  ddItem: { display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textDecoration: 'none', color: 'inherit' },
  ddDisabled: { cursor: 'not-allowed', opacity: 0.55 },
  ddName: { fontSize: 13.5, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 },
  ddDesc: { fontSize: 11.5, color: '#6b7280' },
  soonChip: { fontSize: 9.5, fontWeight: 700, color: '#d97706', background: '#ffedd5', padding: '1px 7px', borderRadius: 8 },
  activeChip: { fontSize: 9.5, fontWeight: 700, color: '#15803d', background: '#dcfce7', padding: '1px 7px', borderRadius: 8 },
  emptyNote: { fontSize: 12, color: '#9ca3af', padding: '8px 12px' },
};
