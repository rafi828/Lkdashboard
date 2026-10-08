import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Layout, { IfCan, useMe, can } from '../../components/Layout';

const CATALOG_URL = 'https://peledtech.com/catalog2024-25/';
const PAGE_SIZE = 100;
const SIG = 'סיגנט ללא התאמה';
const CONFIDENCES = ['ודאי', 'סביר', 'לבדיקה', 'ללא התאמה', SIG];
const CONF_STYLE = {
  'ודאי': { background: '#dcfce7', color: '#15803d' },
  'סביר': { background: '#dbeafe', color: '#1d4ed8' },
  'לבדיקה': { background: '#ffedd5', color: '#c2410c' },
  'ללא התאמה': { background: '#f3f4f6', color: '#4b5563' },
  [SIG]: { background: '#e5e7eb', color: '#374151' },
};
// ריבועי הסיכום: כל ריבוע = רמת ביטחון (+ מקור). לחיצה מסננת את הטבלה לפיו.
const KPIS = [
  { label: 'ודאי', confidence: 'ודאי', source: '', top: '#16a34a' },
  { label: 'סביר', confidence: 'סביר', source: '', top: '#2563eb' },
  { label: 'לבדיקה – מנוע', confidence: 'לבדיקה', source: 'engine', top: '#ea580c' },
  { label: 'לבדיקה – מרובי ברקודים', confidence: 'לבדיקה', source: 'barcodes', top: '#0d9488' },
  { label: 'ללא התאמה', confidence: 'ללא התאמה', source: '', top: '#9ca3af' },
  { label: SIG, confidence: SIG, source: '', top: '#6b7280' },
];
const SOURCE_LABELS = { engine: 'מנוע ההשוואה', barcodes: 'מרובי ברקודים' };
const DECISION_LABELS = { approved: 'אושר', rejected: 'נדחה', corrected: 'תוקן' };
const DECISION_STYLE = { approved: '#15803d', rejected: '#b91c1c', corrected: '#7c3aed' };
const IMPORT_STYLE = '#0d9488';
const COLUMNS = [
  ['lk_sku', 'מק"ט ל.כ'], ['lk_desc', 'תיאור ל.כ'], ['lk_dept', 'מחלקה'], ['comp_sku', 'מק"ט מתחרה'],
  ['comp_desc', 'תיאור מתחרה'], ['comp_brand', 'מותג'], ['confidence', 'רמת ביטחון'], ['notes', 'הערות'],
  ['catalog_page', 'עמוד'], ['comp_price', 'מחיר'],
];

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('he-IL');
}

// השוואת מק"טים בלי תלות באפסים בהתחלה (030210 = 30210) - כמו normSku ב-lib/sku-compare.js
const normSku = (sku) => String(sku ?? '').trim().replace(/^0+(?=.)/, '');

// המק"ט הסופי של שורת ל.כ אחרי ההחלטה הידנית (null = אין התאמה / נדחה)
const effectiveSku = (r) => (r.decision === 'corrected' ? r.corrected_sku : r.decision === 'rejected' ? null : r.comp_sku);

// "ממתין להחלטה" = יש התאמה (מהמנוע, או "לבדיקה" מהברקודים) ועוד לא הוחלט עליה. "יבוא ידני" ודאי לא ממתין.
const isPending = (r) => !r.isSig && r.confidence !== 'ללא התאמה' && !r.decision && r.import_kind !== 'sure';

const DELETED_USER = 'משתמש שנמחק';
// מי החליט על השורה ומתי: החלטה ידנית, או "יבוא ידני" (מי טען את קובץ מרובי הברקודים). null = אין החלטה.
function actorOf(r) {
  if (r.decision) return { kind: 'user', name: r.decided_by_name || DELETED_USER, at: r.decided_at };
  if (r.import_kind === 'sure') return { kind: 'import', name: r.imported_by_name || DELETED_USER, at: r.imported_at };
  return null;
}

export default function SkuComparePage() {
  return (
    <Layout permission="skucompare.view">
      <SkuCompare />
    </Layout>
  );
}

function SkuCompare() {
  const router = useRouter();
  const me = useMe();
  const canDecide = can(me, 'skucompare.decide');
  const [rows, setRows] = useState([]);
  const [compItems, setCompItems] = useState([]);
  const [lastUpload, setLastUpload] = useState(null);
  const [lastBarcodes, setLastBarcodes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [confidence, setConfidence] = useState('');
  const [source, setSource] = useState('');
  const [decisionFilter, setDecisionFilter] = useState('');
  const [decider, setDecider] = useState(''); // '' | 'none' | 'import' | 'user:<שם>'
  const [dateFrom, setDateFrom] = useState(''); // yyyy-mm-dd, תאריך ההחלטה
  const [dateTo, setDateTo] = useState('');
  const [onlyMarked, setOnlyMarked] = useState(false);
  const [marked, setMarked] = useState(() => new Set());
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(0);
  const [fixRow, setFixRow] = useState(null);
  const [assignRow, setAssignRow] = useState(null);
  const [exporting, setExporting] = useState(false);
  // "חיפוש לפי מסמך" - זמני (לא נשמר): { filename, mode, total, foundLk, foundComp, unknown: [...], qty: {key: n}, hit: {key: 'lk'|'comp'} }
  const [lookup, setLookup] = useState(null);
  const [lookupOpen, setLookupOpen] = useState(false);

  useEffect(() => {
    fetch('/api/dashboard/sku-compare')
      .then((res) => res.json())
      .then((d) => {
        if (d.error) return setError(d.error);
        setRows(d.rows);
        setCompItems(d.compItems || []);
        setLastUpload(d.lastUpload);
        setLastBarcodes(d.lastBarcodes);
      })
      .catch(() => setError('שגיאה בטעינת הנתונים'))
      .finally(() => setLoading(false));
  }, []);

  const deptOptions = useMemo(() => [...new Set(rows.map((r) => r.lk_dept).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he')), [rows]);

  const compMap = useMemo(() => new Map(compItems.map((c) => [normSku(c.comp_sku), c])), [compItems]);

  // שורות ל.כ (מק"ט מתוקן -> פרטי המתחרה של המק"ט המתוקן) + שורות "סיגנט ללא התאמה":
  // כל מק"ט מתחרה שלא משויך כרגע לאף פריט ל.כ. מחושב כאן, כך ששיוך מוריד את השורה מיד.
  const allRows = useMemo(() => {
    const lkRows = rows.map((r) => {
      const row = { ...r, key: r.lk_sku };
      if (r.decision === 'corrected') {
        const c = compMap.get(normSku(r.corrected_sku));
        Object.assign(row, {
          comp_desc: c?.comp_desc || null, comp_brand: c?.comp_brand || null,
          catalog_page: c?.catalog_page || null, comp_price: c?.comp_price ?? null,
        });
      }
      return row;
    });
    const used = new Set(rows.map(effectiveSku).filter(Boolean).map(normSku));
    const sigRows = compItems.filter((c) => !used.has(normSku(c.comp_sku))).map((c) => ({
      ...c, key: `sig:${c.comp_sku}`, isSig: true, confidence: SIG, source: null,
    }));
    return lkRows.concat(sigRows);
  }, [rows, compItems, compMap]);

  const counts = useMemo(() => {
    const kpi = KPIS.map((k) => allRows.filter((r) => r.confidence === k.confidence && (!k.source || r.source === k.source)).length);
    return { kpi, pending: allRows.filter(isPending).length };
  }, [allRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = allRows.filter((r) => {
      if (onlyMarked && !marked.has(r.key)) return false;
      if (dept && r.lk_dept !== dept) return false;
      if (confidence && r.confidence !== confidence) return false;
      if (source && r.source !== source) return false;
      if (decisionFilter === 'none' && !isPending(r)) return false;
      if (decisionFilter === 'import' && !(r.import_kind === 'sure' && !r.decision)) return false;
      if (decisionFilter && !['none', 'import'].includes(decisionFilter) && r.decision !== decisionFilter) return false;
      if (decider || dateFrom || dateTo) {
        const a = actorOf(r);
        if (decider === 'none' && !isPending(r)) return false;
        if (decider === 'import' && a?.kind !== 'import') return false;
        if (decider.startsWith('user:') && !(a?.kind === 'user' && a.name === decider.slice(5))) return false;
        if (dateFrom && !(a?.at && new Date(a.at) >= new Date(`${dateFrom}T00:00:00`))) return false;
        if (dateTo && !(a?.at && new Date(a.at) <= new Date(`${dateTo}T23:59:59.999`))) return false;
      }
      if (q) {
        const hay = [r.lk_sku, r.lk_desc, r.comp_sku, r.engine_comp_sku, r.corrected_sku, r.comp_desc, r.comp_brand, r.notes, r.decision_note]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (sortKey) {
      const dir = sortDir === 'asc' ? 1 : -1;
      out = [...out].sort((a, b) => {
        const va = a[sortKey], vb = b[sortKey];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
        return String(va).localeCompare(String(vb), 'he', { numeric: true }) * dir;
      });
    }
    return out;
  }, [allRows, search, dept, confidence, source, decisionFilter, decider, dateFrom, dateTo, onlyMarked, marked, sortKey, sortDir]);

  // אפשרויות "הוחלט ע"י": כל מי שקיבל לפחות החלטה ידנית אחת, עם מספר ההחלטות
  const deciderOptions = useMemo(() => {
    const byName = new Map();
    rows.forEach((r) => {
      const a = actorOf(r);
      if (a?.kind === 'user') byName.set(a.name, (byName.get(a.name) || 0) + 1);
    });
    return [...byName.entries()].sort((x, y) => y[1] - x[1]);
  }, [rows]);
  const importCount = useMemo(() => rows.filter((r) => actorOf(r)?.kind === 'import').length, [rows]);

  // כל שינוי בסינון/מיון מחזיר לעמוד הראשון
  useEffect(() => { setPage(0); }, [search, dept, confidence, source, decisionFilter, decider, dateFrom, dateTo, onlyMarked, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const allPageMarked = pageRows.length > 0 && pageRows.every((r) => marked.has(r.key));

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  function toggleMark(key) {
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function togglePageMarks() {
    setMarked((prev) => {
      const next = new Set(prev);
      pageRows.forEach((r) => (allPageMarked ? next.delete(r.key) : next.add(r.key)));
      return next;
    });
  }

  function clearMarks() {
    setMarked(new Set());
    setOnlyMarked(false);
  }

  // "חיפוש לפי מסמך": השרת רק קורא את הקובץ; ההתאמה מול הדוח נעשית כאן (כולל החלטות ושיוכים עדכניים).
  // מק"ט ל.כ -> השורה שלו. מק"ט מתחרה -> שורת ל.כ שמשויכת אליו כרגע, ואם אין - שורת "סיגנט ללא התאמה".
  async function runLookup(file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/dashboard/sku-compare-lookup', { method: 'POST', body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return data.error || 'שגיאה בקריאת הקובץ';

    const lkByNorm = new Map(rows.map((r) => [normSku(r.lk_sku), r.lk_sku]));
    const lkByComp = new Map();
    rows.forEach((r) => {
      const sku = effectiveSku(r);
      if (!sku) return;
      const list = lkByComp.get(normSku(sku)) || [];
      list.push(r.lk_sku);
      lkByComp.set(normSku(sku), list);
    });
    const sigByNorm = new Map(allRows.filter((r) => r.isSig).map((r) => [normSku(r.comp_sku), r.key]));

    const qty = {};
    const hit = {};
    const unknown = [];
    const add = (key, how, q) => {
      hit[key] = hit[key] || how;
      if (q != null) qty[key] = (qty[key] || 0) + q;
      else if (!(key in qty)) qty[key] = null;
    };
    data.lines.forEach((line) => {
      const n = line.code ? normSku(line.code) : null;
      if (n && lkByNorm.has(n)) add(lkByNorm.get(n), 'lk', line.qty);
      else if (n && lkByComp.has(n)) lkByComp.get(n).forEach((k) => add(k, 'comp', line.qty));
      else if (n && sigByNorm.has(n)) add(sigByNorm.get(n), 'comp', line.qty);
      else unknown.push(line);
    });
    const keys = Object.keys(hit);
    setLookup({
      filename: data.filename,
      mode: data.mode,
      total: data.lines.length,
      foundLk: keys.filter((k) => hit[k] === 'lk').length,
      foundComp: keys.filter((k) => hit[k] === 'comp').length,
      unknown,
      qty,
      hit,
    });
    setSearch(''); setDept(''); setConfidence(''); setSource(''); setDecisionFilter(''); setSortKey(null);
    setMarked(new Set(keys));
    setOnlyMarked(keys.length > 0);
    return null;
  }

  function closeLookup() {
    setLookup(null);
    clearMarks();
  }

  // שורה שלא זוהתה -> חיפוש חופשי לפי תחילת התיאור, על כל הטבלה
  function searchByDesc(desc) {
    setOnlyMarked(false);
    setSearch(String(desc).split(/\s+/).slice(0, 2).join(' '));
  }

  function resetFilters() {
    setSearch(''); setDept(''); setConfidence(''); setSource(''); setDecisionFilter(''); setDecider(''); setDateFrom(''); setDateTo(''); setOnlyMarked(false); setSortKey(null);
  }

  const kpiSelected = (k) => confidence === k.confidence && source === k.source;

  function onKpiClick(k) {
    if (k === 'pending') { setDecisionFilter('none'); setConfidence(''); setSource(''); return; }
    if (kpiSelected(k)) { setConfidence(''); setSource(''); return; }
    setConfidence(k.confidence); setSource(k.source); setDecisionFilter('');
  }

  // שיוך משורת "סיגנט ללא התאמה": נשמר כהחלטה "תוקן" על פריט ל.כ
  async function assignLk(sigRow, lkSkuInput, note) {
    const lkSku = lkSkuInput.trim();
    const lkRow = rows.find((r) => r.lk_sku === lkSku) || rows.find((r) => normSku(r.lk_sku) === normSku(lkSku));
    if (!lkRow) { alert(`מק"ט ל.כ ${lkSku} לא נמצא בדוח`); return false; }
    const current = effectiveSku(lkRow);
    if (current && !window.confirm(`לפריט ${lkRow.lk_sku} כבר משויך מק"ט ${current}. להחליף ל-${sigRow.comp_sku}?`)) return false;
    return saveDecision(lkRow.lk_sku, 'corrected', sigRow.comp_sku, note || 'שיוך משורת מתחרה ללא התאמה');
  }

  async function saveDecision(lkSku, decision, correctedSku, note) {
    const res = await fetch('/api/dashboard/sku-compare-decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lkSku, decision, correctedSku, note }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { alert(data.error || 'שגיאה בשמירה'); return false; }
    setRows((prev) => prev.map((r) => (r.lk_sku !== lkSku ? r : {
      ...r,
      decision: data.decision,
      corrected_sku: data.decision ? data.corrected_sku : null,
      decision_note: data.decision ? data.decision_note : null,
      decided_at: data.decision ? data.decided_at : null,
      decided_by_name: data.decision ? data.decided_by_name : null,
    })));
    return true;
  }

  // מסומנים -> רק הם. לא סומן כלום -> כל מה שמוצג כרגע בטבלה (בלי סינון = כל הטבלה).
  async function exportExcel() {
    const keys = marked.size > 0 ? Array.from(marked) : filtered.map((r) => r.key);
    if (keys.length === 0) { alert('אין שורות לייצוא'); return; }
    const lkSkus = keys.filter((k) => !k.startsWith('sig:'));
    const compSkus = keys.filter((k) => k.startsWith('sig:')).map((k) => k.slice(4));
    setExporting(true);
    try {
      const res = await fetch('/api/dashboard/sku-compare-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lkSkus, compSkus,
          quantities: lookup ? Object.fromEntries(keys.map((k) => [k, lookup.qty[k] ?? null])) : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'שגיאה בייצוא');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sku-compare-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setExporting(false);
    }
  }

  const exportLabel = (marked.size > 0 ? `ייצוא ${marked.size} מסומנים לאקסל` : `ייצוא לאקסל (${filtered.length.toLocaleString('he-IL')} שורות)`)
    + (lookup ? ' (כולל כמות)' : '');

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.h1}>השוואת מק"טים</h1>
          <p style={styles.subtext}>
            {lastUpload
              ? `קטלוג ל.כ מול קטלוג מתחרים · קובץ אחרון: ${lastUpload.filename} · הועלה ${fmtDate(lastUpload.uploaded_at)}${lastUpload.uploaded_by_name ? ` ע"י ${lastUpload.uploaded_by_name}` : ''}`
              : 'קטלוג ל.כ מול קטלוג מתחרים'}
            {lastBarcodes && ` · מרובי ברקודים: ${lastBarcodes.filename} (${fmtDate(lastBarcodes.uploaded_at)})`}
          </p>
        </div>
        <div style={styles.headerBtns}>
          {rows.length > 0 && (
            <button onClick={() => setLookupOpen(true)} style={styles.uploadBtn}>🔍 חיפוש לפי מסמך</button>
          )}
          <IfCan permission="skucompare.upload">
            <button onClick={() => router.push('/dashboard/sku-compare-upload')} style={styles.uploadBtn}>
              ⬆ טעינת קבצים
            </button>
          </IfCan>
        </div>
      </div>

      {error && <div style={styles.card}>{error}</div>}
      {!error && !loading && rows.length === 0 && (
        <div style={styles.card}>עדיין לא נטען קובץ תוצאות. יש לטעון את הקובץ שכלי ההשוואה מייצר דרך "טעינת קבצים".</div>
      )}

      {rows.length > 0 && (
        <>
          <div style={styles.kpiGrid}>
            {KPIS.map((k, i) => (
              <button key={k.label} onClick={() => onKpiClick(k)}
                style={{ ...styles.kpi, borderTopColor: k.top, ...(kpiSelected(k) ? styles.kpiSel : {}) }}>
                <span style={styles.kpiLabel}>{k.label}</span>
                <span style={styles.kpiValue}>{counts.kpi[i].toLocaleString('he-IL')}</span>
              </button>
            ))}
            <button onClick={() => onKpiClick('pending')}
              style={{ ...styles.kpi, borderTopColor: '#111827', ...(decisionFilter === 'none' ? styles.kpiSel : {}) }}>
              <span style={styles.kpiLabel}>ממתינים להחלטה</span>
              <span style={styles.kpiValue}>{counts.pending.toLocaleString('he-IL')}</span>
            </button>
          </div>

          {lookup && (
            <LookupPanel lookup={lookup} onShowAll={() => setOnlyMarked(false)} onClose={closeLookup} onSearch={searchByDesc} />
          )}

          <div style={styles.card}>
            <div style={styles.filters}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder='חיפוש חופשי: מק"ט, תיאור, הערה…' style={styles.search} />
              <select value={dept} onChange={(e) => setDept(e.target.value)} style={styles.select}>
                <option value="">כל המחלקות</option>
                {deptOptions.map((d) => <option key={d}>{d}</option>)}
              </select>
              <select value={confidence} onChange={(e) => setConfidence(e.target.value)} style={styles.select}>
                <option value="">כל רמות הביטחון</option>
                {CONFIDENCES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <select value={source} onChange={(e) => setSource(e.target.value)} style={styles.select}>
                <option value="">כל המקורות</option>
                {Object.entries(SOURCE_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              <select value={decisionFilter} onChange={(e) => setDecisionFilter(e.target.value)} style={styles.select}>
                <option value="">כל ההחלטות</option>
                <option value="none">ממתין להחלטה</option>
                <option value="import">יבוא ידני</option>
                <option value="approved">אושר</option>
                <option value="rejected">נדחה</option>
                <option value="corrected">תוקן</option>
              </select>
              <select value={decider} onChange={(e) => setDecider(e.target.value)} style={styles.select}>
                <option value="">הוחלט ע"י: כולם</option>
                {deciderOptions.map(([name, n]) => <option key={name} value={`user:${name}`}>{name} ({n.toLocaleString('he-IL')})</option>)}
                <option value="import">יבוא ידני – מרובי ברקודים ({importCount.toLocaleString('he-IL')})</option>
                <option value="none">ממתין להחלטה</option>
              </select>
              <span style={styles.dateRange} title="תאריך ההחלטה (או תאריך טעינת מרובי הברקודים)">
                תאריך החלטה
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={styles.dateInput} />
                עד
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={styles.dateInput} />
              </span>
              <button onClick={resetFilters} style={styles.resetBtn}>איפוס סינון</button>
            </div>

            <div style={styles.markBar}>
              <span style={styles.markCount}>{marked.size > 0 ? `${marked.size} מסומנים` : 'סמנו שורות בתיבה שבתחילת השורה'}</span>
              <button onClick={() => setOnlyMarked((v) => !v)} disabled={marked.size === 0 && !onlyMarked}
                style={onlyMarked ? styles.toggleOn : { ...styles.resetBtn, opacity: marked.size === 0 ? 0.5 : 1 }}>
                {onlyMarked ? '✓ מוצגים מסומנים בלבד' : 'הצג מסומנים בלבד'}
              </button>
              {marked.size > 0 && <button onClick={clearMarks} style={styles.resetBtn}>נקה סימונים</button>}
              <button onClick={exportExcel} disabled={exporting} style={styles.exportBtn}>
                {exporting ? 'מייצא…' : exportLabel}
              </button>
            </div>

            <div style={styles.tableScroll}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.thCheck}>
                      <input type="checkbox" checked={allPageMarked} onChange={togglePageMarks} title="סימון כל השורות בעמוד" />
                    </th>
                    {lookup && <th style={{ ...styles.th, ...styles.thQty }} title="כמות במסמך">כמות</th>}
                    {COLUMNS.map(([k, label]) => (
                      <th key={k} style={styles.th} onClick={() => toggleSort(k)}>
                        {label} <span style={styles.arrow}>{sortKey === k ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
                      </th>
                    ))}
                    <th style={{ ...styles.th, cursor: 'default' }}>החלטה</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (r.isSig ? (
                    <SigRow key={r.key} r={r} marked={marked.has(r.key)} onMark={() => toggleMark(r.key)}
                      canDecide={canDecide} onAssign={() => setAssignRow(r)} lookup={lookup} />
                  ) : (
                    <Row key={r.key} r={r} marked={marked.has(r.key)} onMark={() => toggleMark(r.key)}
                      canDecide={canDecide} onDecide={saveDecision} onFix={() => setFixRow(r)} lookup={lookup} />
                  )))}
                  {pageRows.length === 0 && (
                    <tr><td colSpan={COLUMNS.length + (lookup ? 3 : 2)} style={styles.empty}>אין שורות שמתאימות לסינון</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={styles.footer}>
              <span>
                {filtered.length.toLocaleString('he-IL')} שורות
                {filtered.length > PAGE_SIZE && ` · מוצגות ${(page * PAGE_SIZE + 1).toLocaleString('he-IL')}–${Math.min((page + 1) * PAGE_SIZE, filtered.length).toLocaleString('he-IL')}`}
              </span>
              {pageCount > 1 && (
                <span style={styles.pager}>
                  <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} style={styles.resetBtn}>→ הקודם</button>
                  <span>עמוד {page + 1} מתוך {pageCount}</span>
                  <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1} style={styles.resetBtn}>הבא ←</button>
                </span>
              )}
              <span style={{ color: '#9ca3af' }}>החלטה ידנית גוברת על "מרובי ברקודים" ועל תוצאת המנוע, ונשמרת גם אחרי טעינת קובץ חדש</span>
            </div>
          </div>
        </>
      )}

      {fixRow && <FixModal row={fixRow} onClose={() => setFixRow(null)}
        onSave={async (sku, note) => { if (await saveDecision(fixRow.lk_sku, 'corrected', sku, note)) setFixRow(null); }} />}
      {assignRow && <AssignModal row={assignRow} onClose={() => setAssignRow(null)}
        onSave={async (lkSku, note) => { if (await assignLk(assignRow, lkSku, note)) setAssignRow(null); }} />}
      {lookupOpen && <LookupModal onClose={() => setLookupOpen(false)}
        onFile={async (file) => { const err = await runLookup(file); if (!err) setLookupOpen(false); return err; }} />}
    </div>
  );
}

// עמודת "כמות במסמך" (רק בזמן "חיפוש לפי מסמך")
function QtyCell({ lookup, rowKey }) {
  if (!lookup) return null;
  const q = lookup.qty[rowKey];
  return <td style={{ ...styles.td, ...styles.qty }}>{q ?? ''}</td>;
}

// מק"ט שנמצא בחיפוש לפי מסמך - מודגש
const hitSku = (lookup, rowKey, how, text) => (
  lookup && lookup.hit[rowKey] === how ? <span style={{ ...styles.sku, ...styles.hit }}>{text}</span> : <span style={styles.sku}>{text}</span>
);

function Row({ r, marked, onMark, canDecide, onDecide, onFix, lookup }) {
  const conf = CONF_STYLE[r.confidence] || CONF_STYLE['לבדיקה'];
  const noMatch = !r.comp_sku;
  return (
    <tr style={{ ...(r.decision === 'rejected' ? { opacity: 0.55 } : {}), ...(marked ? { background: '#fffbeb' } : {}) }}>
      <td style={styles.tdCheck}><input type="checkbox" checked={marked} onChange={onMark} /></td>
      <QtyCell lookup={lookup} rowKey={r.key} />
      <td style={styles.td}>{hitSku(lookup, r.key, 'lk', r.lk_sku)}</td>
      <td style={styles.tdWide}>{r.lk_desc}</td>
      <td style={styles.tdMid}>{r.lk_dept}</td>
      <td style={styles.td}>
        {r.decision === 'corrected' ? (
          <>
            {hitSku(lookup, r.key, 'comp', r.corrected_sku)}
            {r.comp_sku && <span style={styles.orig}>{r.comp_sku} ({r.source === 'barcodes' ? 'ברקודים' : 'מנוע'})</span>}
          </>
        ) : (
          <>
            {hitSku(lookup, r.key, 'comp', r.comp_sku)}
            {r.source === 'barcodes' && r.engine_comp_sku && normSku(r.engine_comp_sku) !== normSku(r.comp_sku)
              && <span style={styles.orig}>{r.engine_comp_sku} (מנוע)</span>}
          </>
        )}
      </td>
      <td style={styles.tdWide}>{r.comp_desc}</td>
      <td style={styles.td}>{r.comp_brand}</td>
      <td style={styles.td}>
        <span style={{ ...styles.badge, background: conf.background, color: conf.color }}>{r.confidence}</span>
        {r.source === 'barcodes' && <span style={styles.chip}>מרובי ברקודים</span>}
      </td>
      <td style={styles.tdNote}>{r.notes}</td>
      <td style={styles.td}>
        {r.catalog_page && <a href={`${CATALOG_URL}${r.catalog_page}/`} target="_blank" rel="noreferrer" style={styles.pageLink}>עמ' {r.catalog_page} ↗</a>}
      </td>
      <td style={styles.td}>{r.comp_price != null ? '₪' + r.comp_price.toLocaleString('he-IL') : ''}</td>
      <td style={styles.td}>
        {r.decision ? (
          <div style={styles.actions}>
            {/* מי החליט ומתי (והערה) - במעבר עכבר, כדי שהעמודה תישאר צרה */}
            <span style={{ ...styles.badge, background: DECISION_STYLE[r.decision], color: '#fff', cursor: 'help' }}
              title={[[r.decided_by_name, fmtDate(r.decided_at)].filter(Boolean).join(' · '), r.decision_note].filter(Boolean).join('\n')}>
              {DECISION_LABELS[r.decision]}{r.decision_note ? ' 💬' : ''}
            </span>
            <span style={styles.who} title={fmtDate(r.decided_at)}>{r.decided_by_name || DELETED_USER}</span>
            {canDecide && <button onClick={() => onDecide(r.lk_sku, null)} style={{ ...styles.act, ...styles.actUndo }}>ביטול</button>}
          </div>
        ) : r.import_kind === 'sure' ? (
          <div style={styles.actions}>
            <span style={{ ...styles.badge, background: IMPORT_STYLE, color: '#fff', cursor: 'help' }}
              title={`נטען ע"י ${r.imported_by_name || DELETED_USER}${r.imported_at ? ` · ${fmtDate(r.imported_at)}` : ''}`}>יבוא ידני</span>
            <span style={styles.who} title={fmtDate(r.imported_at)}>{r.imported_by_name || DELETED_USER}</span>
            {canDecide && <button onClick={() => onDecide(r.lk_sku, 'rejected')} style={{ ...styles.act, ...styles.actRej }}>✗ דחייה</button>}
            {canDecide && <button onClick={onFix} style={{ ...styles.act, ...styles.actFix }}>✎ תיקון</button>}
          </div>
        ) : canDecide ? (
          <div style={styles.actions}>
            {!noMatch && <button onClick={() => onDecide(r.lk_sku, 'approved')} style={{ ...styles.act, ...styles.actOk }}>✓ אישור</button>}
            {!noMatch && <button onClick={() => onDecide(r.lk_sku, 'rejected')} style={{ ...styles.act, ...styles.actRej }}>✗ דחייה</button>}
            <button onClick={onFix} style={{ ...styles.act, ...styles.actFix }}>{noMatch ? '✎ הזנת מק"ט' : '✎ תיקון'}</button>
          </div>
        ) : <span style={{ color: '#9ca3af' }}>—</span>}
      </td>
    </tr>
  );
}

// שורת "סיגנט ללא התאמה": פריט מתחרה שאין לו פריט ל.כ משויך
function SigRow({ r, marked, onMark, canDecide, onAssign, lookup }) {
  const conf = CONF_STYLE[SIG];
  return (
    <tr style={{ background: marked ? '#fffbeb' : '#fafafa' }}>
      <td style={styles.tdCheck}><input type="checkbox" checked={marked} onChange={onMark} /></td>
      <QtyCell lookup={lookup} rowKey={r.key} />
      <td style={{ ...styles.td, color: '#9ca3af' }}>—</td>
      <td style={styles.tdWide} />
      <td style={styles.tdMid}>{r.category}</td>
      <td style={styles.td}>{hitSku(lookup, r.key, 'comp', r.comp_sku)}</td>
      <td style={styles.tdWide}>{r.comp_desc}</td>
      <td style={styles.td}>{r.comp_brand}</td>
      <td style={styles.td}><span style={{ ...styles.badge, ...styles.badgeWrap, background: conf.background, color: conf.color }}>{SIG}</span></td>
      <td style={styles.tdNote} />
      <td style={styles.td}>
        {r.catalog_page && <a href={`${CATALOG_URL}${r.catalog_page}/`} target="_blank" rel="noreferrer" style={styles.pageLink}>עמ' {r.catalog_page} ↗</a>}
      </td>
      <td style={styles.td}>{r.comp_price != null ? '₪' + r.comp_price.toLocaleString('he-IL') : ''}</td>
      <td style={styles.td}>
        {canDecide ? <button onClick={onAssign} style={{ ...styles.act, ...styles.actLink }}>🔗 שיוך מק"ט ל.כ</button>
          : <span style={{ color: '#9ca3af' }}>—</span>}
      </td>
    </tr>
  );
}

// מסגרת התוצאה של "חיפוש לפי מסמך": סיכום + שורות שלא זוהו
function LookupPanel({ lookup, onShowAll, onClose, onSearch }) {
  const n = (x) => x.toLocaleString('he-IL');
  const found = lookup.foundLk + lookup.foundComp;
  const listUnknown = lookup.mode === 'columns' && lookup.unknown.length > 0;
  return (
    <div style={styles.lookupPanel}>
      <div style={styles.lookupTop}>
        <span style={styles.lookupTitle}>📄 {lookup.filename}</span>
        <span style={styles.lookupStat}>
          {lookup.mode === 'columns' ? `נקראו ${n(lookup.total)} שורות` : `נבדקו ${n(lookup.total)} תאים שנראים כמו מק"ט`}
          {` · נמצאו ${n(found)} (${n(lookup.foundLk)} לפי מק"ט ל.כ · ${n(lookup.foundComp)} לפי מק"ט מתחרה)`}
          {lookup.mode === 'columns' && <> · לא זוהו <b style={{ color: '#b45309' }}>{n(lookup.unknown.length)}</b></>}
        </span>
        <span style={styles.lookupBtns}>
          <button onClick={onShowAll} style={styles.resetBtn}>הצג את כל הטבלה</button>
          <button onClick={onClose} style={styles.resetBtn}>✕ סגירת החיפוש</button>
        </span>
      </div>
      {lookup.mode === 'scan' && (
        <div style={styles.lookupHint}>לא נמצאה בקובץ עמודת מק"ט (כותרת "מק"ט" / "קוד" / "פריט"), לכן נבדק כל תא שנראה כמו מק"ט - ואין רשימת "לא זוהו".</div>
      )}
      {listUnknown && (
        <div style={styles.unknownBox}>
          <div style={styles.unknownTitle}>⚠ שורות מהמסמך שלא זוהו בדוח</div>
          <div style={{ maxHeight: 180, overflow: 'auto' }}>
            <table style={styles.unknownTable}>
              <thead>
                <tr><th style={styles.unknownTh}>מק"ט במסמך</th><th style={styles.unknownTh}>תיאור במסמך</th><th style={styles.unknownTh}>כמות</th><th style={styles.unknownTh} /></tr>
              </thead>
              <tbody>
                {lookup.unknown.map((u, i) => (
                  <tr key={i}>
                    <td style={styles.unknownTd}>{u.code ? <span style={styles.sku}>{u.code}</span> : <span style={{ color: '#9ca3af' }}>— אין מק"ט —</span>}</td>
                    <td style={styles.unknownTd}>{u.desc}</td>
                    <td style={{ ...styles.unknownTd, textAlign: 'center' }}>{u.qty ?? ''}</td>
                    <td style={styles.unknownTd}>
                      {u.desc && <button onClick={() => onSearch(u.desc)} style={{ ...styles.act, ...styles.actUndo }}>🔎 חפש בטבלה לפי התיאור</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function LookupModal({ onClose, onFile }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function handle(file) {
    if (!file) return;
    setBusy(true); setError('');
    const err = await onFile(file);
    setBusy(false);
    if (err) setError(err);
  }
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={{ ...styles.modalBox, width: 460 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0, fontSize: 16 }}>🔍 חיפוש לפי מסמך</h3>
        <label style={styles.lookupDrop}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handle(e.dataTransfer.files[0]); }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{busy ? 'קורא את הקובץ…' : 'גרירה או לחיצה לבחירת קובץ'}</span>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>אקסל (xlsx / xls) או CSV</span>
          <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} disabled={busy}
            onChange={(e) => handle(e.target.files[0])} />
        </label>
        {error && <div style={{ fontSize: 12.5, fontWeight: 600, color: '#dc2626' }}>{error}</div>}
        <div style={styles.lookupNote}>
          המערכת מחפשת בקובץ <b>מק"טים של ל.כ ושל המתחרה</b> (בלי תלות באפסים בהתחלה):<br />
          • אם יש שורת כותרות עם עמודה כמו <b>"מק"ט" / "קוד" / "פריט"</b> - נקראת העמודה הזו, וגם <b>"תיאור"/"שם"</b> ו<b>"כמות"</b> אם קיימות.<br />
          • אם אין כותרות - נבדק כל תא שנראה כמו מק"ט.<br />
          השורות שנמצאו <b>מסומנות</b> ומוצגות לבד, עם עמודת <b>"כמות במסמך"</b>. החיפוש זמני - נמחק ביציאה מהמסך.
        </div>
        <div><button onClick={onClose} style={styles.resetBtn}>ביטול</button></div>
      </div>
    </div>
  );
}

function AssignModal({ row, onClose, onSave }) {
  const [lkSku, setLkSku] = useState('');
  const [note, setNote] = useState('');
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0, fontSize: 16 }}>שיוך מק"ט ל.כ לפריט מתחרה</h3>
        <div style={{ fontSize: 12.5, color: '#6b7280' }}>{row.comp_sku} · {row.comp_desc}{row.comp_brand ? ` (${row.comp_brand})` : ''}</div>
        <label style={styles.modalLabel}>מק"ט ל.כ</label>
        <input value={lkSku} onChange={(e) => setLkSku(e.target.value)} placeholder="למשל 1021022" style={styles.modalInput} autoFocus />
        <label style={styles.modalLabel}>הערה (לא חובה)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={styles.modalInput} />
        <div style={{ fontSize: 11.5, color: '#6b7280' }}>יישמר כהחלטה "תוקן" על פריט ל.כ (גובר על המנוע ועל מרובי ברקודים), והשורה תצא מרשימת "{SIG}".</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button onClick={() => (lkSku.trim() ? onSave(lkSku, note) : alert('יש להזין מק"ט ל.כ'))} style={styles.exportBtn}>שמירה</button>
          <button onClick={onClose} style={styles.resetBtn}>ביטול</button>
        </div>
      </div>
    </div>
  );
}

function FixModal({ row, onClose, onSave }) {
  const [sku, setSku] = useState(row.corrected_sku || '');
  const [note, setNote] = useState('');
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{row.comp_sku ? 'תיקון מק"ט מתחרה' : 'הזנת מק"ט מתחרה'}</h3>
        <div style={{ fontSize: 12.5, color: '#6b7280' }}>
          {row.lk_sku} · {row.lk_desc}{row.comp_sku ? ` (${row.source === 'barcodes' ? 'מרובי ברקודים' : 'המנוע'}: ${row.comp_sku})` : ''}
        </div>
        <label style={styles.modalLabel}>מק"ט נכון אצל המתחרה</label>
        <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="למשל 012317" style={styles.modalInput} autoFocus />
        <label style={styles.modalLabel}>הערה (לא חובה)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={styles.modalInput} />
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button onClick={() => (sku.trim() ? onSave(sku.trim(), note) : alert('יש להזין מק"ט'))} style={styles.exportBtn}>שמירה</button>
          <button onClick={onClose} style={styles.resetBtn}>ביטול</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { display: 'flex', flexDirection: 'column', gap: 12, marginTop: -12 },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  who: { flexShrink: 0, fontSize: 10.5, color: '#6b7280', whiteSpace: 'nowrap' },
  dateRange: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' },
  dateInput: { fontSize: 12.5, padding: '6px 6px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff' },
  headerBtns: { display: 'flex', gap: 8, flexShrink: 0 },
  qty: { fontWeight: 700, color: '#0f766e', textAlign: 'center', padding: '5px 4px' },
  thQty: { cursor: 'default', padding: '7px 4px', color: '#0f766e' },
  hit: { background: '#99f6e4', borderRadius: 4, padding: '0 3px' },
  lookupPanel: { background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 12, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 },
  lookupTop: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  lookupTitle: { fontWeight: 700, fontSize: 14, color: '#0f766e' },
  lookupStat: { fontSize: 12.5, color: '#134e4a' },
  lookupBtns: { marginInlineStart: 'auto', display: 'flex', gap: 6 },
  lookupHint: { fontSize: 12, color: '#6b7280' },
  unknownBox: { background: '#fff', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 12px' },
  unknownTitle: { fontSize: 12.5, fontWeight: 700, color: '#92400e', marginBottom: 6 },
  unknownTable: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  unknownTh: { textAlign: 'right', padding: '3px 8px', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #fef3c7' },
  unknownTd: { textAlign: 'right', padding: '3px 8px', borderBottom: '1px solid #fef3c7' },
  lookupDrop: { border: '2px dashed #d1d5db', borderRadius: 12, padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer' },
  lookupNote: { background: '#f9fafb', border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 12px', fontSize: 11.5, color: '#4b5563', lineHeight: 1.7 },
  h1: { margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' },
  subtext: { margin: '2px 0 0', fontSize: 12.5, color: '#6b7280' },
  card: { background: '#fff', border: '1px solid #e9e9ec', borderRadius: 12, padding: '14px 16px' },
  uploadBtn: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#111827', background: '#fff', border: '1px solid #d1d5db', borderRadius: 9, padding: '9px 14px', cursor: 'pointer', whiteSpace: 'nowrap' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 8 },
  kpi: { background: '#fff', border: '1px solid #e9e9ec', borderTop: '3px solid', borderRadius: 10, padding: '6px 10px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, cursor: 'pointer', textAlign: 'right', font: 'inherit', color: 'inherit' },
  kpiSel: { outline: '2px solid #111827' },
  kpiLabel: { fontSize: 11.5, color: '#6b7280', fontWeight: 600, lineHeight: 1.25 },
  kpiValue: { fontSize: 18, fontWeight: 700 },
  filters: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  search: { flex: 1, minWidth: 220, fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db' },
  select: { fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db', minWidth: 150, background: '#fff' },
  resetBtn: { fontSize: 12, padding: '8px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', color: '#374151' },
  toggleOn: { fontSize: 12, padding: '8px 14px', borderRadius: 8, border: '1px solid #111827', background: '#111827', cursor: 'pointer', color: '#fff', fontWeight: 600 },
  exportBtn: { fontSize: 12, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 600 },
  markBar: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTop: '1px solid #f3f4f6' },
  markCount: { fontSize: 12.5, color: '#374151', fontWeight: 600, marginInlineEnd: 'auto' },
  tableScroll: { overflow: 'auto', maxHeight: 'calc(100vh - 300px)', minHeight: 320, marginTop: 10, border: '1px solid #f0f0f0', borderRadius: 8 },
  table: { width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 },
  th: { position: 'sticky', top: 0, zIndex: 2, background: '#f9fafb', textAlign: 'right', padding: '7px 8px', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' },
  thCheck: { position: 'sticky', top: 0, zIndex: 2, background: '#f9fafb', padding: '7px 6px', borderBottom: '1px solid #e5e7eb', width: 28 },
  arrow: { color: '#d1d5db', fontSize: 10 },
  td: { textAlign: 'right', padding: '5px 8px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'top', whiteSpace: 'nowrap' },
  tdCheck: { padding: '5px 6px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'top' },
  tdWide: { textAlign: 'right', padding: '5px 8px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'top', minWidth: 100, maxWidth: 200 },
  tdMid: { textAlign: 'right', padding: '5px 8px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'top', minWidth: 70, maxWidth: 100 },
  tdNote: { textAlign: 'right', padding: '5px 8px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'top', minWidth: 80, maxWidth: 150, color: '#6b7280', fontSize: 11 },
  sku: { fontFamily: 'Consolas, monospace', fontWeight: 700 },
  orig: { display: 'block', textDecoration: 'line-through', color: '#9ca3af', fontSize: 11, fontWeight: 400 },
  badgeWrap: { display: 'inline-block', whiteSpace: 'normal', maxWidth: 70, lineHeight: 1.3, textAlign: 'center' },
  badge: { fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 10, whiteSpace: 'nowrap' },
  pageLink: { color: '#dc2626', fontWeight: 700, textDecoration: 'none' },
  actions: { display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' },
  act: { flexShrink: 0, whiteSpace: 'nowrap', fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '2px 6px', lineHeight: '16px', cursor: 'pointer', border: '1px solid', background: '#fff' },
  actOk: { color: '#15803d', borderColor: '#86efac' },
  actRej: { color: '#b91c1c', borderColor: '#fca5a5' },
  actFix: { color: '#7c3aed', borderColor: '#c4b5fd' },
  actLink: { color: '#0f766e', borderColor: '#5eead4' },
  chip: { display: 'block', width: 'fit-content', marginTop: 3, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8, background: '#ccfbf1', color: '#0f766e' },
  actUndo: { color: '#6b7280', borderColor: '#d1d5db' },
  empty: { textAlign: 'center', color: '#9ca3af', padding: 24 },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, fontSize: 12, color: '#6b7280', marginTop: 10 },
  pager: { display: 'flex', alignItems: 'center', gap: 8 },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  modalBox: { background: '#fff', borderRadius: 12, padding: 24, width: 380, maxWidth: '90vw', direction: 'rtl', display: 'flex', flexDirection: 'column', gap: 10 },
  modalLabel: { fontSize: 12.5, color: '#374151', fontWeight: 600 },
  modalInput: { width: '100%', fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontFamily: 'inherit', boxSizing: 'border-box' },
};
