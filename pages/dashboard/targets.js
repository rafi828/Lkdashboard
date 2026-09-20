import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';

const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

const DOMAIN_ORDER = ['מכירות סיטונאים', 'סניפי ל.כ', 'משווקים', 'מוסדיים', 'משרד הביטחון'];
const DOMAIN_COLORS = {
  'מכירות סיטונאים': '#dc2626',
  'סניפי ל.כ': '#111827',
  'משווקים': '#f97316',
  'מוסדיים': '#6b7280',
  'משרד הביטחון': '#fbbf24',
  'לא מסווג': '#d1d5db',
};

function fmt(n) {
  return '₪' + Math.round(n).toLocaleString('he-IL');
}
function fmtSigned(n) {
  const sign = n >= 0 ? '+' : '-';
  return sign + '₪' + Math.round(Math.abs(n)).toLocaleString('he-IL');
}
function pctLabel(p) {
  return p === null || p === undefined ? 'אין יעד' : p.toFixed(1) + '%';
}
function completionTier(p) {
  if (p === null || p === undefined) return 'none';
  if (p >= 90) return 'good';
  if (p >= 50) return 'mid';
  return 'bad';
}

export default function TargetsDashboard() {
  const now = new Date();
  const [period, setPeriod] = useState('mtd');
  const [year] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    fetch(`/api/dashboard/targets-summary?period=${period}&year=${year}&month=${month}`)
      .then((res) => res.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)))
      .catch(() => setError('שגיאה בטעינת הנתונים'));
  }, [period, year, month]);

  return (
    <Layout>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.h1}>דשבורד יעדים</h1>
          <p style={styles.subtext}>ביצוע בפועל מול יעד, לפי תחום ולפי סוכן</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={styles.periodToggle}>
            <button onClick={() => setPeriod('mtd')} style={period === 'mtd' ? styles.periodBtnActive : styles.periodBtn}>
              MTD - מתחילת החודש
            </button>
            <button onClick={() => setPeriod('ytd')} style={period === 'ytd' ? styles.periodBtnActive : styles.periodBtn}>
              YTD - מתחילת השנה
            </button>
          </div>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={styles.select}>
            {MONTH_NAMES.map((name, idx) => (
              <option key={idx} value={idx + 1}>
                {name} {year}{idx + 1 === now.getMonth() + 1 && year === now.getFullYear() ? ' (נוכחי)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div style={styles.card}>{error}</div>}
      {!data && !error && <div style={styles.card}>טוען...</div>}

      {data && (
        <>
          <DomainBreakdownCard grandTotal={data.grandTotal} domains={data.domains} />
          <AgentsLayout domains={data.domains} />
        </>
      )}
    </Layout>
  );
}

// ==================== עוגת תרומה + טבלה מפורטת ====================

function DomainBreakdownCard({ grandTotal, domains }) {
  const ordered = DOMAIN_ORDER
    .map((name) => domains.find((d) => d.domain === name))
    .filter(Boolean)
    .concat(domains.filter((d) => d.domain === 'לא מסווג'));

  let cum = 0;
  const gradientStops = ordered.map((d) => {
    const start = (cum / 100) * 360;
    cum += d.contributionPct;
    const end = (cum / 100) * 360;
    return `${DOMAIN_COLORS[d.domain] || '#d1d5db'} ${start.toFixed(1)}deg ${end.toFixed(1)}deg`;
  });
  const conicGradient = `conic-gradient(${gradientStops.join(',')})`;

  return (
    <div style={styles.card}>
      <div style={styles.chartTitle}>פילוח תרומה לפי תחום</div>
      <div style={styles.chartSub}>תרומה מסה"כ המכירות, ופירוט יעד / בפועל / רווח לכל תחום</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{ ...styles.donut, background: conicGradient }}>
          <div style={styles.donutCenter}>
            <div style={styles.donutBig}>{fmt(grandTotal.actual)}</div>
            <div style={styles.donutSmall}>סה"כ בפועל</div>
            <div style={{ ...styles.donutSmall, color: '#4338ca', fontWeight: 700, marginTop: 2 }}>
              רווח: {grandTotal.profitPct === null ? '-' : grandTotal.profitPct.toFixed(1) + '%'}
            </div>
          </div>
        </div>

        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}></th>
              <th style={styles.th}>תחום</th>
              <th style={styles.th}>תרומה</th>
              <th style={styles.th}>יעד</th>
              <th style={styles.th}>בפועל</th>
              <th style={styles.th}>הפרש ליעד</th>
              <th style={styles.th}>השלמה</th>
              <th style={styles.th}>רווח</th>
              <th style={styles.th}>רווח %</th>
            </tr>
          </thead>
          <tbody>
            <tr style={styles.summaryRow}>
              <td style={styles.td}></td>
              <td style={styles.td}>סה"כ</td>
              <td style={styles.td}>100%</td>
              <td style={styles.td}>{fmt(grandTotal.target)}</td>
              <td style={styles.td}>{fmt(grandTotal.actual)}</td>
              <td style={{ ...styles.td, color: grandTotal.diff >= 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>{fmtSigned(grandTotal.diff)}</td>
              <td style={styles.td}><CompletionCell pct={grandTotal.completionPct} /></td>
              <td style={styles.td}>{grandTotal.profit === null ? '-' : fmt(grandTotal.profit)}</td>
              <td style={styles.td}>{grandTotal.profitPct === null ? '-' : grandTotal.profitPct.toFixed(1) + '%'}</td>
            </tr>
            {ordered.map((d) => (
              <tr key={d.domain} style={rowTint(completionTier(d.completionPct))}>
                <td style={styles.td}><span style={{ ...styles.sw, background: DOMAIN_COLORS[d.domain] || '#d1d5db' }} /></td>
                <td style={styles.td}>{d.domain}</td>
                <td style={styles.td}>{d.contributionPct.toFixed(1)}%</td>
                <td style={styles.td}>{d.target ? fmt(d.target) : '-'}</td>
                <td style={styles.td}>{fmt(d.actual)}</td>
                <td style={{ ...styles.td, color: d.diff >= 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>{d.target ? fmtSigned(d.diff) : '-'}</td>
                <td style={styles.td}><CompletionCell pct={d.completionPct} /></td>
                <td style={styles.td}>{d.profit === null ? '-' : fmt(d.profit)}</td>
                <td style={styles.td}>{d.profitPct === null ? '-' : d.profitPct.toFixed(1) + '%'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={styles.placeholderNote}>
        ⚠ עמודות "רווח" ריקות בכוונה - עדיין אין מקור נתונים לרווחיות לפי סוכן/תחום. נצטרך להחליט מאיפה זה יגיע (עמודה נוספת בקובץ המכירות? קובץ נפרד?) לפני שיתמלאו במספרים אמיתיים.
      </div>
    </div>
  );
}

function CompletionCell({ pct }) {
  const tier = completionTier(pct);
  const width = pct === null ? 0 : Math.min(100, pct);
  const color = tier === 'good' ? '#16a34a' : tier === 'mid' ? '#d97706' : tier === 'bad' ? '#dc2626' : '#d1d5db';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={styles.miniBarTrack}>
        <div style={{ ...styles.miniBarFill, width: `${width}%`, background: color }} />
      </div>
      <span>{pctLabel(pct)}</span>
    </div>
  );
}

function rowTint(tier) {
  if (tier === 'good') return { background: '#f0fdf4' };
  if (tier === 'mid') return { background: '#fffbeb' };
  if (tier === 'bad') return { background: '#fef2f2' };
  return {};
}

// ==================== סוכנים: התחום הגדול בשורה שלו, השאר בשורה משולבת, לא מסווג בנפרד ====================

function AgentsLayout({ domains }) {
  const classified = domains.filter((d) => d.domain !== 'לא מסווג');
  const unclassified = domains.find((d) => d.domain === 'לא מסווג');
  const sorted = classified.slice().sort((a, b) => b.agents.length - a.agents.length);
  const [biggest, ...rest] = sorted;
  const restAgents = rest.flatMap((d) => d.agents.map((a) => ({ ...a, _domain: d.domain })));

  return (
    <>
      {biggest && (
        <div style={styles.card}>
          <div style={styles.chartTitle}>{biggest.domain} - פירוט לפי סוכן</div>
          <BarLegend />
          <div style={styles.barsRow}>
            {biggest.agents.map((a) => (
              <AgentBarUnit key={a.agent_code} agent={a} />
            ))}
          </div>
        </div>
      )}

      {restAgents.length > 0 && (
        <div style={styles.card}>
          <div style={styles.chartTitle}>שאר התחומים - לפי סוכן</div>
          <div style={styles.chartSub}>{rest.map((d) => d.domain).join(' · ')} - בשורה אחת, בקנה מידה קומפקטי</div>
          <div style={styles.barsRow}>
            {restAgents.map((a) => (
              <AgentBarUnit key={a.agent_code} agent={a} domainTag={a._domain} />
            ))}
          </div>
        </div>
      )}

      {unclassified && unclassified.agents.length > 0 && (
        <div style={{ ...styles.card, background: '#fafafa', borderStyle: 'dashed' }}>
          <div style={styles.chartTitle}>
            לא מסווג
            <span style={styles.unclassifiedBadge}>ממתין לשיוך</span>
          </div>
          <div style={styles.barsRow}>
            {unclassified.agents.map((a) => (
              <AgentBarUnit key={a.agent_code} agent={a} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function BarLegend() {
  return (
    <div style={styles.legendNote}>
      <span><i style={{ ...styles.dot, background: '#bbf7d0' }} /> יעד</span>
      <span><i style={{ ...styles.dot, background: '#15803d' }} /> בפועל</span>
      <span><i style={{ ...styles.dot, background: '#111827' }} /> קו שחור = איפה שהיה היעד (רק כשעברו אותו)</span>
    </div>
  );
}

function AgentBarUnit({ agent, domainTag }) {
  const { agent_name, agent_code, actual, target, completionPct, profitPct } = agent;
  const scaleMax = Math.max(actual, target, 1) * 1.15;
  const actualPct = (actual / scaleMax) * 100;
  const targetPct = target ? (target / scaleMax) * 100 : 0;
  const exceeded = target > 0 && actual > target;
  const tier = completionTier(completionPct);

  return (
    <div style={styles.barUnit}>
      <div style={styles.barTrack}>
        {target > 0 && <div style={{ ...styles.barTarget, height: `${targetPct}%` }} />}
        <div style={{ ...styles.barActual, height: `${actualPct}%` }} />
        {exceeded && <div style={{ ...styles.barTick, bottom: `${targetPct}%` }} />}
      </div>
      <div style={styles.infoPanel}>
        {domainTag && <span style={styles.domainTag}>{domainTag}</span>}
        <div style={styles.infoName}>{agent_name || agent_code}</div>
        <div style={styles.infoAmount}>{fmt(actual)}</div>
        <div style={styles.infoLine}>{target ? `יעד: ${fmt(target)}` : 'אין יעד'}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
          {target > 0 && (
            <span style={{ ...styles.badge, ...badgeColor(tier) }}>{pctLabel(completionPct)}</span>
          )}
          <span style={styles.profitBadge}>רווח {profitPct === null ? '-' : profitPct.toFixed(0) + '%'}</span>
        </div>
      </div>
    </div>
  );
}

function badgeColor(tier) {
  if (tier === 'good') return { background: '#dcfce7', color: '#15803d' };
  if (tier === 'mid') return { background: '#ffedd5', color: '#d97706' };
  if (tier === 'bad') return { background: '#fee2e2', color: '#dc2626' };
  return { background: '#f3f4f6', color: '#6b7280' };
}

const styles = {
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 },
  h1: { margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' },
  subtext: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  periodToggle: { display: 'flex', gap: 6, background: '#fff', border: '1px solid #e9e9ec', borderRadius: 10, padding: 4 },
  periodBtn: { border: 'none', background: 'transparent', color: '#6b7280', fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' },
  periodBtnActive: { border: 'none', background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' },
  select: { fontSize: 13, fontWeight: 600, color: '#111827', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 10px' },
  card: { background: '#fff', border: '1px solid #e9e9ec', borderRadius: 12, padding: 20, marginTop: 0 },
  chartTitle: { fontSize: 15, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center' },
  chartSub: { fontSize: 12, color: '#6b7280', marginTop: 4, marginBottom: 14 },

  donut: { width: 150, height: 150, borderRadius: '50%', flexShrink: 0, position: 'relative' },
  donutCenter: {
    position: 'absolute', inset: 30, background: '#fff', borderRadius: '50%',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  },
  donutBig: { fontSize: 13, fontWeight: 700 },
  donutSmall: { fontSize: 9, color: '#9ca3af' },

  table: { width: '100%', borderCollapse: 'collapse', fontSize: 11.5 },
  th: { textAlign: 'right', color: '#9ca3af', fontWeight: 600, padding: '4px 6px', borderBottom: '1px solid #f0f0f0' },
  td: { padding: '5px 6px', borderBottom: '1px solid #f5f5f5', whiteSpace: 'nowrap' },
  sw: { width: 10, height: 10, borderRadius: 3, display: 'inline-block' },
  summaryRow: { background: '#f9fafb', fontWeight: 700 },
  miniBarTrack: { width: 46, height: 6, borderRadius: 3, background: '#e5e7eb', overflow: 'hidden', flexShrink: 0 },
  miniBarFill: { height: '100%', borderRadius: 3 },
  placeholderNote: { fontSize: 11, color: '#4338ca', background: '#eef2ff', border: '1px dashed #c7d2fe', borderRadius: 8, padding: '8px 12px', marginTop: 12 },

  barsRow: { display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', gap: 22, paddingTop: 6, paddingBottom: 4 },
  barUnit: { display: 'flex', alignItems: 'flex-end', gap: 10, flexShrink: 0 },
  barTrack: { position: 'relative', width: 26, height: 150, borderRadius: 6, background: '#f1f2f4', overflow: 'hidden', flexShrink: 0 },
  barTarget: { position: 'absolute', bottom: 0, left: 0, right: 0, background: '#bbf7d0', borderRadius: '6px 6px 0 0' },
  barActual: { position: 'absolute', bottom: 0, left: 0, right: 0, background: '#15803d', borderRadius: '6px 6px 0 0', zIndex: 2 },
  barTick: { position: 'absolute', left: 0, right: 0, height: 3, background: '#111827', zIndex: 3 },
  infoPanel: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 110 },
  infoName: { fontSize: 12.5, fontWeight: 700 },
  infoAmount: { fontSize: 14, fontWeight: 800 },
  infoLine: { fontSize: 10.5, color: '#9ca3af' },
  domainTag: { fontSize: 9.5, fontWeight: 700, color: '#6b7280', background: '#f3f4f6', padding: '1px 7px', borderRadius: 8, display: 'inline-block', marginBottom: 2, alignSelf: 'flex-start' },
  badge: { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 9 },
  profitBadge: { background: '#eef2ff', color: '#4338ca', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 9 },
  legendNote: { display: 'flex', gap: 16, fontSize: 11, color: '#6b7280', margin: '2px 0 10px', flexWrap: 'wrap' },
  dot: { width: 11, height: 11, borderRadius: 3, display: 'inline-block', marginInlineEnd: 5 },
  unclassifiedBadge: {
    marginInlineStart: 10, fontSize: 11, fontWeight: 700, color: '#d97706',
    background: '#ffedd5', padding: '2px 8px', borderRadius: 10,
  },
};
