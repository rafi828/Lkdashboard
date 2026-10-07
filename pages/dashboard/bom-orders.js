import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Layout, { IfCan } from '../../components/Layout';
import { computeBom, treeRows } from '../../lib/bom-compute';

// הגדרות החישוב שנשמרות בדפדפן של המשתמש (חודשי התקופה תמיד מחושבים מקובץ המכירות)
const SETTINGS_KEY = 'bom-orders-settings';
const DEFAULT_SETTINGS = { targetMonths: 3, urgentMonths: 1, warnMonths: 2.5 };
const DEFAULT_MONTHS = 6;

const STATUS = {
  bad: { label: 'דחוף להזמין', bg: '#fee2e2', color: '#b91c1c' },
  warn: { label: 'להזמין בקרוב', bg: '#ffedd5', color: '#c2410c' },
  ok: { label: 'תקין', bg: '#dcfce7', color: '#15803d' },
  mute: { label: 'אין מכירות', bg: '#f3f4f6', color: '#6b7280' },
};

// detail = עמודת פירוט (מוסתרת עד שמסמנים "הצג עמודות פירוט")
const COLUMNS = [
  { key: 'kind', label: 'סוג', noSort: true },
  { key: 'group', label: 'שייך למכלול', noSort: true },
  { key: 'code', label: 'קוד פריט' },
  { key: 'name', label: 'שם פריט' },
  { key: 'direct', label: 'נמכר ישירות', detail: true },
  { key: 'level2', label: 'נמכר כרכיב (הורה ישיר)', detail: true },
  { key: 'level3plus', label: 'נמכר כרכיב (רמות גבוהות)', detail: true },
  { key: 'total', label: 'סה"כ נמכר' },
  { key: 'monthlyAvg', label: 'ממוצע חודשי' },
  { key: 'stockTotal', label: 'יתרת מלאי' },
  { key: 'stockNoProd', label: 'ללא מחסן ייצור', detail: true },
  { key: 'stockProd', label: 'מחסן ייצור', detail: true },
  { key: 'monthsOfStock', label: 'חודשי מלאי' },
  { key: 'bySuppliers', label: 'מוזמן מספק' },
  { key: 'byCustomers', label: 'מוזמן ע"י לקוחות', detail: true },
  { key: 'recommended', label: 'מומלץ להזמין' },
  { key: 'status', label: 'סטטוס', noSort: true },
];

const fmt = (v, d = 0) => (v === null || v === undefined || !Number.isFinite(v) ? '—'
  : v.toLocaleString('he-IL', { minimumFractionDigits: d, maximumFractionDigits: d }));
const kindLabel = (it) => (it.isRoot ? 'מכלול עליון' : it.isLeaf ? 'רכיב סופי' : 'רכיב ביניים');

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export default function BomOrdersPage() {
  return (
    <Layout permission="bomorders.view">
      <BomOrders />
    </Layout>
  );
}

function BomOrders() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [months, setMonths] = useState(DEFAULT_MONTHS);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [view, setView] = useState('tree');
  const [search, setSearch] = useState('');
  const [onlyOrder, setOnlyOrder] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [kpi, setKpi] = useState('');
  const [sort, setSort] = useState({ key: 'monthsOfStock', dir: 'asc' });
  const [expanded, setExpanded] = useState({});
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
    fetch('/api/dashboard/bom-orders')
      .then((res) => res.json().then((d) => ({ ok: res.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) return setError(d.error || 'שגיאה בטעינת הנתונים');
        setData(d);
        const days = d.files['bom-sales']?.info?.days;
        if (days) setMonths(Math.round((days / 30.437) * 10) / 10);
      })
      .catch(() => setError('שגיאת רשת'));
  }, []);

  function updateSetting(key, value) {
    const next = { ...settings, [key]: Math.max(0, Number(value) || 0) };
    setSettings(next);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* דפדפן בלי localStorage */ }
  }

  const model = useMemo(
    () => (data && data.edges.length ? computeBom(data, { months, targetMonths: settings.targetMonths }) : null),
    [data, months, settings.targetMonths]
  );

  const statusOf = (it) => {
    if (it.monthlyAvg <= 0) return 'mute';
    if (it.monthsOfStock < settings.urgentMonths) return 'bad';
    if (it.monthsOfStock < settings.warnMonths) return 'warn';
    return 'ok';
  };

  const q = search.trim().toLowerCase();
  const passes = (it) => (!q || it.code.toLowerCase().includes(q) || String(it.name).toLowerCase().includes(q))
    && (!onlyOrder || it.recommended > 0)
    && (!kpi || (kpi === 'rec' ? it.recommended > 0 : statusOf(it) === kpi));
  const isOpen = (key, def) => (key in expanded ? expanded[key] : def);

  const columns = COLUMNS.filter((c) => showDetail || !c.detail);

  if (error) return <div style={styles.card}>{error}</div>;
  if (!data) return <div style={styles.card}>טוען...</div>;

  const header = (
    <div style={styles.headerRow}>
      <div>
        <h1 style={styles.h1}>הזמנות רכש לפי עצי מוצר</h1>
        <p style={styles.subtext}>מכירות ישירות + מכירות כרכיב בתוך מגשים/עגלות ← מלאי בכל המחסנים ← המלצת הזמנה</p>
      </div>
      <div style={styles.headerBtns}>
        <IfCan permission="bomorders.upload">
          <button onClick={() => router.push('/dashboard/bom-orders-upload')} style={styles.uploadBtn}>📂 טעינת קבצים</button>
        </IfCan>
        {model && (
          <button onClick={handleExport} disabled={exporting} style={styles.exportBtn}>
            {exporting ? 'מייצא...' : '⬇ ייצוא לאקסל'}
          </button>
        )}
      </div>
    </div>
  );

  if (!model) {
    return (
      <div style={styles.page}>
        {header}
        <div style={{ ...styles.card, ...styles.empty }}>
          עדיין לא נטענו עצי מוצר. כדי שהדוח יוצג, יש לטעון לפחות את קובץ <b>עצי המוצר</b> במסך "טעינת קבצים".
        </div>
      </div>
    );
  }

  const { items, groupOf } = model;
  const needOrder = items.filter((i) => i.recommended > 0);
  const kpis = [
    { id: '', label: 'סה"כ פריטים בעצי המוצר', value: items.length, color: '#111827' },
    { id: 'bad', label: 'דחוף להזמין', value: items.filter((i) => statusOf(i) === 'bad').length, color: '#dc2626' },
    { id: 'warn', label: 'להזמין בקרוב', value: items.filter((i) => statusOf(i) === 'warn').length, color: '#ea580c' },
    { id: 'rec', label: 'מומלצים להזמנה', value: needOrder.length, color: '#d97706' },
    { id: null, label: 'סה"כ יחידות מומלצות', value: fmt(needOrder.reduce((s, i) => s + i.recommended, 0)), color: '#d97706' },
    { id: 'mute', label: 'ללא מכירות בתקופה', value: items.filter((i) => i.monthlyAvg <= 0).length, color: '#9ca3af' },
  ];

  let rows;
  let countLabel;
  if (view === 'tree') {
    rows = treeRows(model, passes, isOpen, false);
    countLabel = `${rows.filter((r) => r.type === 'group').length} מכלולים עליונים`;
  } else {
    const dir = sort.dir === 'asc' ? 1 : -1;
    const val = (v) => (v === null || v === undefined ? dir * Infinity : v);
    rows = items.filter(passes)
      .sort((a, b) => {
        const va = val(a[sort.key]);
        const vb = val(b[sort.key]);
        if (va === vb) return 0;
        if (typeof va === 'string') return dir * va.localeCompare(vb, 'he');
        return dir * (va - vb);
      })
      .map((it) => ({ type: 'item', key: it.code, depth: 0, it, group: groupOf[it.code], hasKids: false }));
    countLabel = `${rows.length} פריטים`;
  }

  function toggleSort(key) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'monthsOfStock' ? 'asc' : 'desc' }));
  }

  // ייצוא: מבנה העץ, פתוח כולו, עם הסינון הנוכחי וכל העמודות (כמו בכלי המקורי)
  async function handleExport() {
    const all = treeRows(model, passes, isOpen, true);
    if (!all.length) return;
    const round2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : '');
    const exportRows = all.map((r) => {
      const it = r.it;
      return [
        r.depth,
        r.type === 'group' ? (r.group.merged ? 'מכלול עליון (מאוחד ישן+חדש)' : 'מכלול עליון') : kindLabel(it),
        r.group?.label || '',
        it.code,
        (r.depth > 0 ? '    '.repeat(r.depth) + '↳ ' : '') + it.name,
        it.direct, it.level2, it.level3plus, it.total, round2(it.monthlyAvg),
        it.stockTotal, it.stockNoProd, it.stockProd, round2(it.monthsOfStock),
        it.bySuppliers, it.byCustomers, it.recommended, STATUS[statusOf(it)].label,
      ];
    });
    const cols = ['רמה', 'סוג', 'שייך למכלול', 'קוד פריט', 'שם פריט', 'נמכר ישירות', 'נמכר כרכיב (הורה ישיר)',
      'נמכר כרכיב (רמות גבוהות)', 'סה"כ נמכר', 'ממוצע חודשי', 'יתרת מלאי (סה"כ)', 'יתרה ללא מחסן ייצור',
      'יתרת מחסן ייצור בלבד', 'חודשי מלאי', 'מוזמן מספק', 'מוזמן ע"י לקוחות', 'מומלץ להזמין', 'סטטוס'];
    setExporting(true);
    try {
      const res = await fetch('/api/dashboard/bom-orders-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetName: 'עץ מוצר - ניתוח הזמנות', columns: cols, rows: exportRows }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'שגיאה בייצוא');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `הזמנות רכש לפי עצי מוצר ${new Date().toLocaleDateString('he-IL').replace(/\./g, '-')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  function cell(c, r) {
    const it = r.it;
    const g = r.group;
    switch (c.key) {
      case 'kind':
        return (
          <td key={c.key} style={{ ...styles.td, borderRight: `3px solid ${g ? g.color : 'transparent'}` }}>
            <span style={{ ...styles.tag, ...(it.isRoot ? styles.tagRoot : it.isLeaf ? styles.tagLeaf : styles.tagMid) }}>{kindLabel(it)}</span>
          </td>
        );
      case 'group':
        return (
          <td key={c.key} style={styles.td}>
            {g && <><span style={{ ...styles.gdot, background: g.color }} />{g.label}</>}
          </td>
        );
      case 'code':
        return <td key={c.key} style={{ ...styles.td, ...styles.code }}>{it.code}</td>;
      case 'name':
        return (
          <td key={c.key} style={{ ...styles.td, ...styles.nameCell }}>
            <span style={{ paddingRight: r.depth * 16 }}>
              {r.hasKids && (
                <button style={styles.twist} onClick={() => setExpanded((e) => ({ ...e, [r.key]: !r.open }))}>{r.open ? '−' : '+'}</button>
              )}
              {r.depth > 0 && '↳ '}{it.name}
            </span>
          </td>
        );
      case 'direct':
        return (
          <td key={c.key} style={styles.tdNum}>
            {fmt(it.direct)}
            {it.saleNoQty && <span title="קיימת שורה בדוח המכירות עם סכום בלבד, בלי כמות (זיכוי/תיקון?) - לכן הכמות שנמכרה ישירות מוצגת כ-0" style={styles.info}> ⓘ</span>}
          </td>
        );
      case 'total':
        return <td key={c.key} style={{ ...styles.tdNum, fontWeight: 800 }}>{fmt(it.total)}</td>;
      case 'monthlyAvg':
        return <td key={c.key} style={styles.tdNum}>{fmt(it.monthlyAvg, 1)}</td>;
      case 'monthsOfStock': {
        const s = it.monthsOfStock === null || it.monthsOfStock === Infinity ? 'mute' : statusOf(it);
        const v = it.monthsOfStock === null ? '—' : it.monthsOfStock === Infinity ? '∞' : fmt(it.monthsOfStock, 1);
        return <td key={c.key} style={styles.tdNum}><Pill s={s}>{v}</Pill></td>;
      }
      case 'recommended':
        return (
          <td key={c.key} style={{ ...styles.tdNum, fontWeight: 800, color: it.recommended > 0 ? '#b91c1c' : '#d1d5db' }}>
            {it.recommended > 0 ? fmt(it.recommended) : '—'}
          </td>
        );
      case 'status': {
        const s = statusOf(it);
        return <td key={c.key} style={styles.td}><Pill s={s}>{STATUS[s].label}</Pill></td>;
      }
      default:
        return <td key={c.key} style={styles.tdNum}>{fmt(it[c.key])}</td>;
    }
  }

  return (
    <div style={styles.page}>
      {header}

      <div style={{ ...styles.card, ...styles.settings }}>
        <span style={styles.setTitle}>הגדרות חישוב</span>
        <Field label="תקופת המכירות (חודשים)" note={data.files['bom-sales']?.info?.days ? 'אוטומטי מתאריכי קובץ המכירות' : 'לא נמצא טווח בקובץ - להזין ידנית'}
          value={months} step={0.1} onChange={(v) => setMonths(Math.max(0.1, Number(v) || 0.1))} />
        <Field label="יעד חודשי מלאי להזמנה" note="כמה חודשי מלאי לשמור" value={settings.targetMonths} step={0.5} onChange={(v) => updateSetting('targetMonths', v)} />
        <Field label='סף "דחוף" (חודשי מלאי)' value={settings.urgentMonths} step={0.5} onChange={(v) => updateSetting('urgentMonths', v)} />
        <Field label='סף "להזמין בקרוב"' value={settings.warnMonths} step={0.5} onChange={(v) => updateSetting('warnMonths', v)} />
      </div>

      <div style={styles.kpiGrid}>
        {kpis.map((k) => (
          <button
            key={k.label}
            onClick={k.id === null ? undefined : () => setKpi((cur) => (cur === k.id ? '' : k.id))}
            style={{ ...styles.kpi, borderTopColor: k.color, cursor: k.id === null ? 'default' : 'pointer', ...(k.id && kpi === k.id ? styles.kpiSel : {}) }}
          >
            <span style={styles.kpiLabel}>{k.label}</span>
            <span style={{ ...styles.kpiValue, color: k.color }}>{k.value}</span>
          </button>
        ))}
      </div>

      <div style={styles.card}>
        <div style={styles.filters}>
          <input style={styles.search} placeholder="חיפוש לפי קוד או שם פריט..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <div style={styles.seg}>
            <button style={view === 'tree' ? styles.segOn : styles.segBtn} onClick={() => setView('tree')}>תצוגת עץ מוצר</button>
            <button style={view === 'flat' ? styles.segOn : styles.segBtn} onClick={() => setView('flat')}>טבלה שטוחה</button>
          </div>
          <label style={styles.chk}><input type="checkbox" checked={onlyOrder} onChange={(e) => setOnlyOrder(e.target.checked)} /> רק פריטים שדורשים הזמנה</label>
          <label style={styles.chk}><input type="checkbox" checked={showDetail} onChange={(e) => setShowDetail(e.target.checked)} /> הצג עמודות פירוט</label>
          <span style={styles.count}>{countLabel}</span>
        </div>

        <div style={styles.tableScroll}>
          <table style={styles.table}>
            <thead>
              <tr>
                {columns.map((c) => {
                  const sortable = view === 'flat' && !c.noSort;
                  return (
                    <th key={c.key} style={{ ...styles.th, cursor: sortable ? 'pointer' : 'default' }} onClick={sortable ? () => toggleSort(c.key) : undefined}>
                      {c.label}
                      {sortable && sort.key === c.key && <span style={styles.arrow}> {sort.dir === 'asc' ? '▲' : '▼'}</span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={columns.length} style={styles.emptyRow}>לא נמצאו פריטים תואמים</td></tr>
              )}
              {rows.map((r, i) => (
                <tr key={r.type + r.key + i} style={r.type === 'group' ? { background: r.group.bg, fontWeight: 700 } : undefined}>
                  {columns.map((c) => cell(c, r))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={styles.legend}>
          {['bad', 'warn', 'ok', 'mute'].map((s) => (
            <span key={s} style={styles.legendItem}><Pill s={s}>{STATUS[s].label}</Pill>
              {s === 'bad' ? 'מתחת לסף הדחיפות' : s === 'warn' ? 'מתחת לסף "להזמין בקרוב"' : s === 'ok' ? 'מעל הסף' : 'אין מכירות בתקופה שנטענה'}
            </span>
          ))}
        </div>
        <div style={styles.foot}>
          <b>נמכר ישירות</b> = כמות שנמכרה כפריט בפני עצמו. <b>נמכר כרכיב</b> = כמות שנצרכה בתוך פריטי-אב שנמכרו (מגש/עגלה/סט),
          לפי כמות ליחידה בעץ, כולל רכיב בתוך רכיב. <b>מומלץ להזמין</b> = (יעד חודשי מלאי × ממוצע חודשי) − יתרת מלאי − מוזמן מספק.
          מגשים ישנים וחדשים עם אותו מספר ושם דומה מאוחדים לשורת מכלול אחת.
        </div>
      </div>
    </div>
  );
}

function Pill({ s, children }) {
  return (
    <span style={{ ...styles.pill, background: STATUS[s].bg, color: STATUS[s].color }}>
      <i style={styles.pillDot} />{children}
    </span>
  );
}

function Field({ label, note, value, step, onChange }) {
  return (
    <div style={styles.field}>
      <label style={styles.fieldLabel}>{label}</label>
      <input type="number" min={0} step={step} value={value} onChange={(e) => onChange(e.target.value)} style={styles.fieldInput} />
      {note && <span style={styles.fieldNote}>{note}</span>}
    </div>
  );
}

const styles = {
  page: { display: 'flex', flexDirection: 'column', gap: 12, marginTop: -12 },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  headerBtns: { display: 'flex', gap: 8, flexShrink: 0 },
  h1: { margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' },
  subtext: { margin: '2px 0 0', fontSize: 12.5, color: '#6b7280' },
  card: { background: '#fff', border: '1px solid #e9e9ec', borderRadius: 12, padding: '14px 16px' },
  empty: { fontSize: 14, color: '#374151', lineHeight: 1.7 },
  uploadBtn: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#111827', background: '#fff', border: '1px solid #d1d5db', borderRadius: 9, padding: '9px 14px', cursor: 'pointer', whiteSpace: 'nowrap' },
  exportBtn: { fontSize: 12, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 600 },
  settings: { display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-end' },
  setTitle: { fontSize: 13, fontWeight: 700, alignSelf: 'center', color: '#111827' },
  field: { display: 'flex', flexDirection: 'column', gap: 3 },
  fieldLabel: { fontSize: 11.5, color: '#6b7280', fontWeight: 600 },
  fieldInput: { width: 110, fontSize: 13, padding: '6px 8px', borderRadius: 8, border: '1px solid #d1d5db', fontFamily: 'Consolas, monospace' },
  fieldNote: { fontSize: 10.5, color: '#9ca3af' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0,1fr))', gap: 8 },
  kpi: { background: '#fff', border: '1px solid #e9e9ec', borderTop: '3px solid', borderRadius: 10, padding: '7px 10px', display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'right', font: 'inherit', color: 'inherit' },
  kpiSel: { outline: '2px solid #111827' },
  kpiLabel: { fontSize: 11.5, color: '#6b7280', fontWeight: 600, lineHeight: 1.25 },
  kpiValue: { fontSize: 19, fontWeight: 700 },
  filters: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  search: { flex: 1, minWidth: 220, fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db' },
  seg: { display: 'flex', border: '1px solid #d1d5db', borderRadius: 8, overflow: 'hidden' },
  segBtn: { border: 'none', background: '#fff', padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#374151' },
  segOn: { border: 'none', background: '#111827', padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#fff' },
  chk: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: '#374151', cursor: 'pointer' },
  count: { fontSize: 12, color: '#6b7280', marginInlineStart: 'auto' },
  tableScroll: { overflow: 'auto', maxHeight: 'calc(100vh - 300px)', minHeight: 320, marginTop: 10, border: '1px solid #f0f0f0', borderRadius: 8 },
  table: { width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 },
  th: { position: 'sticky', top: 0, zIndex: 2, background: '#f9fafb', textAlign: 'right', padding: '7px 8px', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap', userSelect: 'none' },
  arrow: { color: '#9ca3af', fontSize: 10 },
  td: { textAlign: 'right', padding: '5px 8px', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap', verticalAlign: 'middle' },
  tdNum: { textAlign: 'right', padding: '5px 8px', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap', verticalAlign: 'middle', fontVariantNumeric: 'tabular-nums' },
  code: { fontFamily: 'Consolas, monospace', fontWeight: 700 },
  nameCell: { whiteSpace: 'normal', minWidth: 200, maxWidth: 320 },
  twist: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 4, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 11, padding: 0, marginLeft: 5, verticalAlign: 'middle' },
  tag: { display: 'inline-block', padding: '1px 7px', borderRadius: 10, fontSize: 10.5, fontWeight: 700 },
  tagRoot: { background: '#fee2e2', color: '#991b1b' },
  tagMid: { background: '#e5e7eb', color: '#374151' },
  tagLeaf: { background: '#f3f4f6', color: '#6b7280' },
  gdot: { display: 'inline-block', width: 8, height: 8, borderRadius: 2, marginLeft: 5, verticalAlign: 'middle' },
  pill: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 10, fontSize: 11, fontWeight: 700 },
  pillDot: { width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' },
  info: { color: '#d97706', fontWeight: 800, cursor: 'help' },
  emptyRow: { textAlign: 'center', color: '#9ca3af', padding: 24 },
  legend: { display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: 11.5, color: '#6b7280' },
  legendItem: { display: 'inline-flex', alignItems: 'center', gap: 5 },
  foot: { fontSize: 11.5, color: '#6b7280', lineHeight: 1.7, marginTop: 8 },
};
