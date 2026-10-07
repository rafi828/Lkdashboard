import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Layout, { IfCan } from '../../components/Layout';
import MultiSelect from '../../components/MultiSelect';

const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const PAGE_SIZE = 100;
const GROUP_KEY = 'קבוצה'; // עמודת "קבוצה" בקובץ הלקוחות = קבוצת לקוחות
const DETAIL_LABELS = { [GROUP_KEY]: 'קבוצת לקוחות' };
// ריבועי KPI לחיצים: מציגים בטבלת הלקוחות רק את הלקוחות האלה
const STATUS_FILTERS = {
  gained: { label: 'לקוחות חדשים', test: (r) => r.cur > 0 && r.prev <= 0 },
  lost: { label: 'לקוחות שלא חזרו', test: (r) => r.prev > 0 && r.cur <= 0 },
};
const TABS = [
  { key: 'agent', label: 'לפי סוכן' },
  { key: 'customer', label: 'לפי לקוח' },
  { key: 'month', label: 'לפי חודש' },
];

function fmt(n) {
  return '₪' + Math.round(n).toLocaleString('he-IL');
}
const mm = (m) => String(m).padStart(2, '0');
const pctChange = (cur, prev) => (prev > 0 ? (cur - prev) / prev : null);
function fmtChange(p) {
  if (p === null || p === undefined) return '—';
  return (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p * 100).toFixed(1) + '%';
}
const toneOf = (n) => (n === null || n === undefined || n === 0 ? undefined : n > 0 ? 'good' : 'bad');

export default function CustomerSalesPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const [year, setYear] = useState(null);
  const [cmpYear, setCmpYear] = useState(''); // '' = ללא השוואה
  const [periodType, setPeriodType] = useState('range'); // 'range' | 'month'
  const [fromMonth, setFromMonth] = useState(1);
  const [toMonth, setToMonth] = useState(12);
  const [agentSel, setAgentSel] = useState([]);
  const [groupSel, setGroupSel] = useState([]);
  const [customerSel, setCustomerSel] = useState([]);
  const [showDetails, setShowDetails] = useState(false);
  const [showZero, setShowZero] = useState(false);
  const [statusFilter, setStatusFilter] = useState(null); // null | 'gained' | 'lost'
  const [monthly, setMonthly] = useState(false);
  const [tab, setTab] = useState('agent');
  const [sortKey, setSortKey] = useState('cur');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetch('/api/dashboard/customer-sales')
      .then((res) => res.json())
      .then((d) => {
        if (d.error) return setError(d.error);
        setData(d);
        if (d.loaded.length) applyYear(d.loaded[d.loaded.length - 1].year, d.loaded, 'range');
      })
      .catch(() => setError('שגיאה בטעינת הנתונים'));
  }, []);

  const loaded = data?.loaded || [];

  // ברירת מחדל לשנה: מינואר עד החודש האחרון שנטען בה, מול השנה הקודמת (אם נטענה)
  function applyYear(y, loadedList = loaded, pType = periodType) {
    const entry = loadedList.find((l) => l.year === y);
    const last = entry ? Math.max(...entry.months) : 12;
    setYear(y);
    setToMonth(last);
    setFromMonth(pType === 'month' ? last : 1);
    setCmpYear(loadedList.some((l) => l.year === y - 1) ? y - 1 : '');
  }

  function changePeriodType(t) {
    setPeriodType(t);
    setFromMonth(t === 'month' ? toMonth : 1);
  }

  function changeFrom(m) {
    setFromMonth(m);
    if (toMonth < m) setToMonth(m);
  }

  function changeTo(m) {
    setToMonth(m);
    if (periodType === 'month' || fromMonth > m) setFromMonth(m);
  }

  function resetFilters() {
    setAgentSel([]); setGroupSel([]); setCustomerSel([]); setShowZero(false); setStatusFilter(null);
    if (loaded.length) applyYear(loaded[loaded.length - 1].year, loaded, periodType);
  }

  // לחיצה על "לקוחות חדשים" / "לקוחות שלא חזרו": עוברים ללשונית לקוח ומציגים רק אותם. לחיצה נוספת - ביטול.
  function toggleStatusFilter(key) {
    if (statusFilter === key) return setStatusFilter(null);
    if (tab !== 'customer') changeTab('customer');
    setStatusFilter(key);
    setPage(0);
  }

  function changeTab(t) {
    setTab(t);
    if (t !== 'customer') setStatusFilter(null);
    setSortKey(t === 'month' ? 'month' : 'cur');
    setSortDir(t === 'month' ? 'asc' : 'desc');
    setPage(0);
  }

  // ---------- נתוני בסיס (לא תלויים בסינון) ----------
  const base = useMemo(() => {
    if (!data) return null;
    const customers = new Map(data.customers.map((c) => [c.id, { ...c, details: c.details || {} }]));
    const agentName = new Map(data.agents.map((a) => [a.code, a.name]));
    const codeByName = new Map(data.agents.map((a) => [a.name, a.code]));
    // הסוכן הנוכחי של לקוח = הסוכן בשורת המכירה האחרונה שלו; אם אין - לפי השם בכרטיס הלקוח
    const currentAgent = new Map();
    data.sales.forEach(([id, code]) => currentAgent.set(id, code));
    data.sales.forEach(([id]) => {
      if (!customers.has(id)) customers.set(id, { id, name: null, agent_name: null, details: {} });
    });
    customers.forEach((c) => {
      if (!currentAgent.has(c.id) && codeByName.has(c.agent_name)) currentAgent.set(c.id, codeByName.get(c.agent_name));
    });
    return { customers, agentName, currentAgent };
  }, [data]);

  const agentOptions = useMemo(
    () => (data?.agents || []).map((a) => ({ value: a.code, label: a.code === 0 ? 'ללא סוכן' : `${a.code} – ${a.name || ''}` })),
    [data]
  );
  const groupOptions = useMemo(() => {
    if (!base) return [];
    const set = new Set();
    base.customers.forEach((c) => c.details[GROUP_KEY] && set.add(c.details[GROUP_KEY]));
    return [...set].sort((a, b) => a.localeCompare(b, 'he')).map((g) => ({ value: g, label: g }));
  }, [base]);
  const customerOptions = useMemo(() => {
    if (!base) return [];
    const agents = new Set(agentSel);
    const groups = new Set(groupSel);
    return [...base.customers.values()]
      .filter((c) => (!groups.size || groups.has(c.details[GROUP_KEY])) && (!agents.size || agents.has(base.currentAgent.get(c.id))))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he'))
      .map((c) => ({ value: c.id, label: `${c.name || '(ללא שם)'} · ${c.id}` }));
  }, [base, agentSel, groupSel]);

  // ---------- חישוב לפי סינון ותקופה ----------
  const calc = useMemo(() => {
    if (!base || !year) return null;
    const agents = new Set(agentSel);
    const groups = new Set(groupSel);
    const custs = new Set(customerSel);
    const cmp = cmpYear === '' ? null : Number(cmpYear);
    const customerPasses = (c) => (!groups.size || groups.has(c.details[GROUP_KEY])) && (!custs.size || custs.has(c.id));

    const byCustomer = new Map(); // id -> { cur, prev, months: {m: סכום} }
    const byAgent = new Map(); // code -> { cur, prev, buyers:Set }
    const byMonth = {}; // m -> { cur, prev }
    for (let m = fromMonth; m <= toMonth; m++) byMonth[m] = { cur: 0, prev: 0 };

    data.sales.forEach(([id, code, y, m, amount]) => {
      if (m < fromMonth || m > toMonth || (y !== year && y !== cmp)) return;
      if (agents.size && !agents.has(code)) return;
      const c = base.customers.get(id);
      if (!customerPasses(c)) return;
      const isCur = y === year;
      const field = isCur ? 'cur' : 'prev';

      let rc = byCustomer.get(id);
      if (!rc) byCustomer.set(id, (rc = { cur: 0, prev: 0, months: {} }));
      rc[field] += amount;
      if (isCur) rc.months[m] = (rc.months[m] || 0) + amount;

      let ra = byAgent.get(code);
      if (!ra) byAgent.set(code, (ra = { cur: 0, prev: 0, curByCustomer: new Map() }));
      ra[field] += amount;
      if (isCur) ra.curByCustomer.set(id, (ra.curByCustomer.get(id) || 0) + amount);

      byMonth[m][field] += amount;
    });

    // לקוחות בטבלה: עם מכירות (השנה או בשנת ההשוואה), ואם סומן - גם כאלה בלי מכירות בתקופה
    if (showZero) {
      base.customers.forEach((c) => {
        if (byCustomer.has(c.id) || !customerPasses(c)) return;
        if (agents.size && !agents.has(base.currentAgent.get(c.id))) return;
        byCustomer.set(c.id, { cur: 0, prev: 0, months: {} });
      });
    }

    const customerRows = [...byCustomer.entries()].map(([id, r]) => {
      const c = base.customers.get(id);
      const agentCode = base.currentAgent.get(id);
      return {
        id,
        name: c.name || '(ללא שם)',
        agent: agentCode !== undefined ? base.agentName.get(agentCode) || c.agent_name || '' : c.agent_name || '',
        details: c.details,
        cur: r.cur,
        prev: r.prev,
        diff: r.cur - r.prev,
        change: pctChange(r.cur, r.prev),
        months: r.months,
      };
    });

    const totalCur = customerRows.reduce((s, r) => s + r.cur, 0);
    const totalPrev = customerRows.reduce((s, r) => s + r.prev, 0);

    const agentRows = [...byAgent.entries()].map(([code, r]) => ({
      code,
      name: code === 0 ? 'ללא סוכן' : base.agentName.get(code) || '',
      buyers: [...r.curByCustomer.values()].filter((v) => v > 0).length,
      cur: r.cur,
      prev: r.prev,
      diff: r.cur - r.prev,
      change: pctChange(r.cur, r.prev),
      share: totalCur ? r.cur / totalCur : 0,
    }));

    let cumCur = 0, cumPrev = 0;
    const monthRows = Object.entries(byMonth).map(([m, r]) => {
      cumCur += r.cur; cumPrev += r.prev;
      return {
        month: Number(m), cur: r.cur, prev: r.prev, diff: r.cur - r.prev, change: pctChange(r.cur, r.prev),
        cumCur, cumPrev, cumChange: pctChange(cumCur, cumPrev),
      };
    });

    return {
      cmp,
      customerRows,
      agentRows,
      monthRows,
      totalCur,
      totalPrev,
      buyersCur: customerRows.filter((r) => r.cur > 0).length,
      buyersPrev: customerRows.filter((r) => r.prev > 0).length,
      lost: customerRows.filter((r) => r.prev > 0 && r.cur <= 0).length,
      gained: customerRows.filter((r) => r.cur > 0 && r.prev <= 0).length,
    };
  }, [base, data, year, cmpYear, fromMonth, toMonth, agentSel, groupSel, customerSel, showZero]);

  useEffect(() => setPage(0), [year, cmpYear, fromMonth, toMonth, agentSel, groupSel, customerSel, showZero]);
  useEffect(() => { if (cmpYear === '') setStatusFilter(null); }, [cmpYear]);

  const periodLabel = fromMonth === toMonth ? `${mm(fromMonth)}/${year}` : `${mm(fromMonth)}–${mm(toMonth)}/${year}`;
  const cmpLabel = calc?.cmp ? (fromMonth === toMonth ? `${mm(fromMonth)}/${calc.cmp}` : `${mm(fromMonth)}–${mm(toMonth)}/${calc.cmp}`) : '';

  // ---------- עמודות הטבלה (משמשות גם לייצוא - מה שרואים זה מה שיוצא) ----------
  const table = useMemo(() => {
    if (!calc) return null;
    const cmpCols = calc.cmp
      ? [
        { key: 'prev', label: `מכירות ${cmpLabel}`, type: 'money' },
        { key: 'diff', label: 'הפרש', type: 'diff' },
        { key: 'change', label: '% שינוי', type: 'change' },
      ]
      : [];
    const total = { cur: calc.totalCur, prev: calc.totalPrev, diff: calc.totalCur - calc.totalPrev, change: pctChange(calc.totalCur, calc.totalPrev) };

    if (tab === 'agent') {
      return {
        title: 'פירוט לפי סוכן',
        columns: [
          { key: 'code', label: 'קוד סוכן', type: 'text' },
          { key: 'name', label: 'שם סוכן', type: 'text' },
          { key: 'buyers', label: 'לקוחות קונים', type: 'num' },
          { key: 'cur', label: `מכירות ${periodLabel}`, type: 'money' },
          ...cmpCols,
          { key: 'share', label: '% מהסה"כ', type: 'share' },
        ],
        rows: calc.agentRows,
        rowKey: (r) => r.code,
        total: { ...total, code: '', name: 'סה"כ', buyers: calc.buyersCur, share: calc.totalCur ? 1 : 0 },
      };
    }
    if (tab === 'month') {
      return {
        title: 'פירוט לפי חודש',
        columns: [
          { key: 'month', label: 'חודש', type: 'month' },
          { key: 'cur', label: `מכירות ${year}`, type: 'money' },
          ...(calc.cmp
            ? [
              { key: 'prev', label: `מכירות ${calc.cmp}`, type: 'money' },
              { key: 'diff', label: 'הפרש', type: 'diff' },
              { key: 'change', label: '% שינוי', type: 'change' },
            ]
            : []),
          { key: 'cumCur', label: `מצטבר ${year}`, type: 'money' },
          ...(calc.cmp
            ? [
              { key: 'cumPrev', label: `מצטבר ${calc.cmp}`, type: 'money' },
              { key: 'cumChange', label: '% שינוי מצטבר', type: 'change' },
            ]
            : []),
        ],
        rows: calc.monthRows,
        rowKey: (r) => r.month,
        total: { ...total, month: 'סה"כ' },
      };
    }
    const detailCols = showDetails
      ? data.detailColumns.map((k) => ({ key: `d:${k}`, label: DETAIL_LABELS[k] || k, type: 'text', get: (r) => r.details[k] || '' }))
      : [];
    const monthCols = [];
    if (monthly && fromMonth !== toMonth) {
      for (let m = fromMonth; m <= toMonth; m++) {
        monthCols.push({ key: `m:${m}`, label: `${mm(m)}/${year}`, type: 'money', get: (r) => r.months[m] || 0 });
      }
    }
    const statusDef = statusFilter && calc.cmp ? STATUS_FILTERS[statusFilter] : null;
    const rows = statusDef ? calc.customerRows.filter(statusDef.test) : calc.customerRows;
    // סה"כ לפי השורות שבטבלה (כשמוצגים רק לקוחות חדשים / שלא חזרו - הסה"כ שלהם בלבד)
    const sum = (get) => rows.reduce((s, r) => s + get(r), 0);
    const custTotal = statusDef
      ? { cur: sum((r) => r.cur), prev: sum((r) => r.prev) }
      : { cur: total.cur, prev: total.prev };
    custTotal.diff = custTotal.cur - custTotal.prev;
    custTotal.change = pctChange(custTotal.cur, custTotal.prev);
    const monthTotals = {};
    monthCols.forEach((c) => { monthTotals[c.key] = sum(c.get); });
    return {
      title: 'פירוט לפי לקוח',
      columns: [
        { key: 'id', label: 'מס׳ לקוח', type: 'text' },
        { key: 'name', label: 'שם לקוח', type: 'text' },
        { key: 'agent', label: 'סוכן', type: 'text' },
        ...detailCols,
        ...monthCols,
        { key: 'cur', label: `מכירות ${periodLabel}`, type: 'money' },
        ...cmpCols,
      ],
      rows,
      rowKey: (r) => r.id,
      paged: true,
      statusLabel: statusDef?.label,
      total: { ...custTotal, ...monthTotals, id: '', name: `סה"כ (${rows.length} לקוחות)`, agent: '' },
    };
  }, [calc, tab, showDetails, monthly, data, year, fromMonth, toMonth, periodLabel, cmpLabel, statusFilter]);

  const sortedRows = useMemo(() => {
    if (!table) return [];
    const col = table.columns.find((c) => c.key === sortKey) || table.columns[0];
    const get = col.get || ((r) => r[col.key]);
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...table.rows].sort((a, b) => {
      const va = get(a), vb = get(b);
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === 'string' || typeof vb === 'string') {
        const na = Number(va), nb = Number(vb);
        if (va !== '' && vb !== '' && Number.isFinite(na) && Number.isFinite(nb)) return (na - nb) * dir;
        return String(va).localeCompare(String(vb), 'he') * dir;
      }
      return (va - vb) * dir;
    });
  }, [table, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  async function handleExport() {
    if (!table || sortedRows.length === 0) return alert('אין שורות לייצוא עם הסינון הנוכחי');
    // שורת הסה"כ שומרת ערכים לפי מפתח העמודה (אין לה months/details)
    const exportValue = (c, r, isTotal) => {
      const v = c.get && !isTotal ? c.get(r) : r[c.key];
      if (c.type === 'month') return typeof v === 'number' ? `${mm(v)} - ${MONTH_NAMES[v - 1]}` : v;
      if (c.type === 'change' || c.type === 'share') return v === null || v === undefined ? '' : Math.round(v * 1000) / 10;
      return v;
    };
    const columns = table.columns.map((c) => (c.type === 'change' || c.type === 'share' ? `${c.label} (%)` : c.label));
    const rows = sortedRows.map((r) => table.columns.map((c) => exportValue(c, r)));
    rows.push(table.columns.map((c) => (c.key in table.total ? exportValue(c, table.total, true) : '')));
    setExporting(true);
    try {
      const res = await fetch('/api/dashboard/customer-sales-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetName: TABS.find((t) => t.key === tab).label, columns, rows }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        return alert(d.error || 'שגיאה בייצוא');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `מכירות ללקוח - ${table.statusLabel || TABS.find((t) => t.key === tab).label} ${periodLabel.replace('/', '-')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const pageCount = table?.paged ? Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE)) : 1;
  const visibleRows = table?.paged ? sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : sortedRows;

  const chartItems = useMemo(() => {
    if (!calc) return [];
    if (tab === 'month') return calc.monthRows.map((r) => ({ label: MONTH_NAMES[r.month - 1], cur: r.cur, prev: r.prev }));
    if (tab === 'agent') return [...calc.agentRows].sort((a, b) => b.cur - a.cur).map((r) => ({ label: r.name || String(r.code), cur: r.cur, prev: r.prev }));
    const rows = table?.rows || calc.customerRows;
    return [...rows].sort((a, b) => Math.max(b.cur, b.prev) - Math.max(a.cur, a.prev)).slice(0, 15).map((r) => ({ label: r.name, cur: r.cur, prev: r.prev }));
  }, [calc, tab, table]);
  const chartTitle = tab === 'month' ? 'מכירות לפי חודש' : tab === 'agent' ? 'מכירות לפי סוכן'
    : table?.statusLabel ? `${table.statusLabel} - 15 הגדולים` : '15 הלקוחות המובילים';

  const loadedText = loaded.map((l) => `${mm(Math.min(...l.months))}–${mm(Math.max(...l.months))}/${l.year}`).join(' · ');
  const totalChange = calc ? pctChange(calc.totalCur, calc.totalPrev) : null;

  return (
    <Layout permission="custsales.view">
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.h1}>מכירות ללקוח</h1>
          <p style={styles.subtext}>
            {loaded.length > 0 ? `נתוני מכירות טעונים: ${loadedText}` : 'טרם נטען קובץ מכירות'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <IfCan permission="custsales.upload">
            <button onClick={() => router.push('/dashboard/customer-sales-upload')} style={styles.uploadBtn}>
              📤 טעינת קבצים
            </button>
          </IfCan>
        </div>
      </div>

      {error && <div style={styles.card}>{error}</div>}
      {data?.noAgentCode && <div style={styles.card}>לא הוגדר לך קוד סוכן, ולכן אין נתונים להצגה. פנה למנהל המערכת.</div>}
      {data && !data.noAgentCode && loaded.length === 0 && (
        <div style={styles.card}>אין עדיין נתונים להצגה בדוח הזה.</div>
      )}

      {calc && (
        <>
          {/* פילטרים */}
          <div style={{ ...styles.card, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <FilterField label="שנה">
              <select value={year} onChange={(e) => applyYear(Number(e.target.value))} style={{ ...styles.select, minWidth: 90 }}>
                {loaded.map((l) => <option key={l.year} value={l.year}>{l.year}</option>)}
              </select>
            </FilterField>
            <FilterField label="השוואה מול">
              <select value={cmpYear} onChange={(e) => setCmpYear(e.target.value === '' ? '' : Number(e.target.value))} style={{ ...styles.select, minWidth: 110 }}>
                <option value="">ללא השוואה</option>
                {loaded.filter((l) => l.year !== year).map((l) => <option key={l.year} value={l.year}>{l.year}</option>)}
              </select>
            </FilterField>
            <FilterField label="תקופה">
              <div style={styles.periodToggle}>
                <button onClick={() => changePeriodType('range')} style={periodType === 'range' ? styles.periodBtnActive : styles.periodBtn}>מחודש עד חודש</button>
                <button onClick={() => changePeriodType('month')} style={periodType === 'month' ? styles.periodBtnActive : styles.periodBtn}>חודש מול חודש</button>
              </div>
            </FilterField>
            {periodType === 'range' && (
              <FilterField label="מחודש">
                <MonthSelect value={fromMonth} onChange={changeFrom} />
              </FilterField>
            )}
            <FilterField label={periodType === 'range' ? 'עד חודש' : 'חודש'}>
              <MonthSelect value={toMonth} onChange={changeTo} />
            </FilterField>
            <FilterField label="סוכן">
              <MultiSelect options={agentOptions} value={agentSel} onChange={setAgentSel} allLabel="כל הסוכנים" />
            </FilterField>
            <FilterField label="קבוצת לקוחות">
              <MultiSelect options={groupOptions} value={groupSel} onChange={setGroupSel} allLabel="כל הקבוצות" />
            </FilterField>
            <FilterField label="לקוח">
              <MultiSelect options={customerOptions} value={customerSel} onChange={setCustomerSel} allLabel="כל הלקוחות" />
            </FilterField>
            <button onClick={resetFilters} style={styles.resetBtn}>איפוס סינונים</button>
            <button onClick={handleExport} disabled={exporting} style={styles.exportBtn}>
              {exporting ? 'מייצא...' : '⬇ ייצוא לאקסל'}
            </button>
          </div>

          {/* KPI */}
          <div style={styles.kpiGrid}>
            <Kpi label={`מכירות ${periodLabel}`} value={fmt(calc.totalCur)} sub={`${calc.buyersCur} לקוחות קונים`} />
            <Kpi label={calc.cmp ? `אותה תקופה ${calc.cmp}` : 'שנת השוואה'} value={calc.cmp ? fmt(calc.totalPrev) : '—'} sub={calc.cmp ? `${calc.buyersPrev} לקוחות קונים` : 'לא נבחרה'} />
            <Kpi label="הפרש" value={calc.cmp ? fmt(calc.totalCur - calc.totalPrev) : '—'} tone={calc.cmp ? toneOf(calc.totalCur - calc.totalPrev) : undefined} />
            <Kpi label="% שינוי" value={calc.cmp ? fmtChange(totalChange) : '—'} tone={calc.cmp ? toneOf(totalChange) : undefined} />
            <Kpi label="לקוחות חדשים" value={calc.cmp ? calc.gained : '—'} tone="good"
              sub={statusFilter === 'gained' ? '✓ מוצגים בטבלה · לחץ לביטול' : calc.cmp ? 'קנו השנה ולא באותה תקופה אשתקד · לחץ להצגה' : 'קנו השנה ולא באותה תקופה אשתקד'}
              onClick={calc.cmp ? () => toggleStatusFilter('gained') : undefined} active={statusFilter === 'gained'} />
            <Kpi label="לקוחות שלא חזרו" value={calc.cmp ? calc.lost : '—'} tone="bad"
              sub={statusFilter === 'lost' ? '✓ מוצגים בטבלה · לחץ לביטול' : calc.cmp ? 'קנו אשתקד ולא השנה · לחץ להצגה' : 'קנו אשתקד ולא השנה'}
              onClick={calc.cmp ? () => toggleStatusFilter('lost') : undefined} active={statusFilter === 'lost'} />
          </div>

          {/* גרף */}
          <BarsChart title={chartTitle} items={chartItems} year={year} cmp={calc.cmp} periodLabel={periodLabel} cmpLabel={cmpLabel} />

          {/* טבלה */}
          <div style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={styles.periodToggle}>
                {TABS.map((t) => (
                  <button key={t.key} onClick={() => changeTab(t.key)} style={tab === t.key ? styles.tabBtnActive : styles.tabBtn}>{t.label}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {tab === 'customer' && (
                  <>
                    <Check checked={showDetails} onChange={setShowDetails} label="הצג פרטי לקוח" />
                    <Check checked={monthly} onChange={setMonthly} label="פירוט חודשי" disabled={fromMonth === toMonth} />
                    <Check checked={showZero} onChange={setShowZero} label="הצג גם לקוחות ללא מכירות" />
                  </>
                )}
                {table.statusLabel && (
                  <button onClick={() => setStatusFilter(null)} style={styles.statusChip} title="הצג את כל הלקוחות">
                    מוצגים רק: {table.statusLabel} ✕
                  </button>
                )}
                <div style={{ fontSize: 12, color: '#6b7280' }}>{sortedRows.length} שורות</div>
              </div>
            </div>
            <div style={{ overflow: 'auto', maxHeight: 620, border: '1px solid #f0f0f2', borderRadius: 8 }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {table.columns.map((c) => (
                      <SortTh key={c.key} label={c.label} k={c.key} numeric={c.type !== 'text' && c.type !== 'month'} detail={c.key.startsWith('d:')} sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => (
                    <tr key={table.rowKey(r)}>
                      {table.columns.map((c) => <Cell key={c.key} col={c} row={r} />)}
                    </tr>
                  ))}
                  {visibleRows.length === 0 && (
                    <tr><td colSpan={table.columns.length} style={{ ...styles.td, color: '#9ca3af', textAlign: 'center' }}>אין נתונים לסינון הזה</td></tr>
                  )}
                </tbody>
                {visibleRows.length > 0 && (
                  <tfoot>
                    <tr>
                      {table.columns.map((c) => (
                        <Cell key={c.key} col={c} row={table.total} total empty={!(c.key in table.total)} />
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {table.paged && pageCount > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 12, fontSize: 12, color: '#6b7280' }}>
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} style={styles.resetBtn}>→ הקודם</button>
                <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sortedRows.length)} מתוך {sortedRows.length}</span>
                <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1} style={styles.resetBtn}>הבא ←</button>
              </div>
            )}
          </div>
        </>
      )}
    </Layout>
  );
}

function MonthSelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ ...styles.select, minWidth: 120 }}>
      {MONTH_NAMES.map((n, i) => <option key={n} value={i + 1}>{mm(i + 1)} – {n}</option>)}
    </select>
  );
}

function Cell({ col, row, total, empty }) {
  const style = { ...styles.td, ...(total ? styles.totalTd : null), ...(col.key.startsWith('d:') && !total ? styles.detailTd : null) };
  if (empty) return <td style={style} />;
  const v = col.get && !total ? col.get(row) : row[col.key];
  const numStyle = { ...style, direction: 'ltr', textAlign: 'right' };
  switch (col.type) {
    case 'money':
      return <td style={numStyle}>{fmt(v || 0)}</td>;
    case 'diff':
      return <td style={{ ...numStyle, color: v > 0 ? '#16a34a' : v < 0 ? '#dc2626' : undefined }}>{fmt(v || 0)}</td>;
    case 'change':
      return (
        <td style={style}>
          {v === null || v === undefined ? <span style={{ color: '#9ca3af' }}>—</span> : (
            <span style={{ ...styles.badge, ...(v >= 0 ? { background: '#dcfce7', color: '#16a34a' } : { background: '#fee2e2', color: '#dc2626' }) }}>{fmtChange(v)}</span>
          )}
        </td>
      );
    case 'share':
      return <td style={style}>{((v || 0) * 100).toFixed(1)}%</td>;
    case 'month':
      return <td style={style}>{typeof v === 'number' ? `${mm(v)} – ${MONTH_NAMES[v - 1]}` : v}</td>;
    default:
      return <td style={style}>{v}</td>;
  }
}

function Check({ checked, onChange, label, disabled }) {
  return (
    <label style={{ ...styles.check, ...(disabled ? { opacity: 0.45, cursor: 'default' } : null), ...(checked && !disabled ? styles.checkOn : null) }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function FilterField({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, color: '#6b7280' }}>{label}</label>
      {children}
    </div>
  );
}

function Kpi({ label, value, sub, tone, onClick, active }) {
  const color = tone === 'good' ? '#16a34a' : tone === 'bad' ? '#dc2626' : '#111827';
  const clickStyle = onClick ? { cursor: 'pointer', ...(active ? { borderColor: color, boxShadow: `0 0 0 1px ${color}`, background: tone === 'good' ? '#f0fdf4' : '#fef2f2' } : null) } : null;
  return (
    <div style={{ ...styles.kpi, ...clickStyle }} onClick={onClick} role={onClick ? 'button' : undefined}>
      <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af' }}>{sub}</div>}
    </div>
  );
}

function SortTh({ label, k, sortKey, sortDir, onClick, detail }) {
  const active = sortKey === k;
  return (
    <th style={{ ...styles.th, cursor: 'pointer', ...(detail ? styles.detailTh : null) }} onClick={() => onClick(k)}>
      {label} {active && (sortDir === 'asc' ? '▲' : '▼')}
    </th>
  );
}

// ==================== גרף עמודות: התקופה מול אותה תקופה בשנת ההשוואה ====================
function BarsChart({ title, items, year, cmp, periodLabel, cmpLabel }) {
  const maxVal = Math.max(1, ...items.flatMap((i) => [i.cur, i.prev]));
  return (
    <div style={styles.card}>
      <div style={styles.chartTitle}>{title}</div>
      <div style={styles.chartSub}>
        {cmp ? `${periodLabel} מול ${cmpLabel}` : periodLabel}, בהתאם לסינון הפעיל
      </div>
      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', height: 190, overflowX: 'auto', paddingTop: 6 }}>
        {items.length === 0 && <div style={{ color: '#9ca3af', fontSize: 13 }}>אין נתונים</div>}
        {items.map((it, idx) => (
          <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 140 }}>
              <div style={{ width: 20, height: (Math.max(0, it.cur) / maxVal) * 140, background: '#dc2626', borderRadius: '4px 4px 0 0' }} title={`${year}: ${fmt(it.cur)}`} />
              {cmp && <div style={{ width: 20, height: (Math.max(0, it.prev) / maxVal) * 140, background: '#111827', borderRadius: '4px 4px 0 0' }} title={`${cmp}: ${fmt(it.prev)}`} />}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, width: 76, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.label}>{it.label}</div>
          </div>
        ))}
      </div>
      <div style={styles.legendNote}>
        <span><i style={{ ...styles.dot, background: '#dc2626' }} /> {year}</span>
        {cmp && <span><i style={{ ...styles.dot, background: '#111827' }} /> {cmp}</span>}
      </div>
    </div>
  );
}

const styles = {
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  h1: { margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' },
  subtext: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  card: { background: '#fff', border: '1px solid #e9e9ec', borderRadius: 12, padding: 20 },
  uploadBtn: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#111827', background: '#fff', border: '1px solid #d1d5db', borderRadius: 9, padding: '9px 14px', cursor: 'pointer' },
  select: { fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db', minWidth: 150 },
  periodToggle: { display: 'flex', gap: 4, background: '#f9fafb', border: '1px solid #e9e9ec', borderRadius: 8, padding: 3 },
  periodBtn: { border: 'none', background: 'transparent', color: '#6b7280', fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' },
  periodBtnActive: { border: 'none', background: '#dc2626', color: '#fff', fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' },
  tabBtn: { border: 'none', background: 'transparent', color: '#6b7280', fontSize: 13, fontWeight: 700, padding: '7px 16px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' },
  tabBtnActive: { border: 'none', background: '#111827', color: '#fff', fontSize: 13, fontWeight: 700, padding: '7px 16px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' },
  resetBtn: { fontSize: 12, padding: '8px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', color: '#374151' },
  exportBtn: { fontSize: 12, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 600 },
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#374151', background: '#f9fafb', border: '1px solid #e9e9ec', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', whiteSpace: 'nowrap' },
  checkOn: { background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0,1fr))', gap: 14 },
  kpi: { background: '#fff', border: '1px solid #e9e9ec', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 4 },
  chartTitle: { fontSize: 15, fontWeight: 700 },
  chartSub: { fontSize: 12, color: '#6b7280', marginBottom: 10 },
  legendNote: { display: 'flex', gap: 16, fontSize: 11, color: '#6b7280', marginTop: 10 },
  dot: { width: 10, height: 10, borderRadius: 3, display: 'inline-block', marginInlineEnd: 5 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 },
  th: { position: 'sticky', top: 0, zIndex: 1, background: '#fff', textAlign: 'right', padding: '8px 10px', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #eee', whiteSpace: 'nowrap' },
  td: { textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #f5f5f5', whiteSpace: 'nowrap' },
  totalTd: { position: 'sticky', bottom: 0, background: '#f9fafb', fontWeight: 700, borderTop: '1px solid #e5e7eb' },
  detailTh: { background: '#f0f9ff' },
  detailTd: { background: '#f8fcff', color: '#374151' },
  badge: { fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 10 },
  statusChip: { fontSize: 12, fontWeight: 700, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', whiteSpace: 'nowrap' },
};
