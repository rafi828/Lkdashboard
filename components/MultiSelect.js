import { useEffect, useMemo, useRef, useState } from 'react';

const MAX_SHOWN = 300; // רשימות ארוכות (למשל לקוחות) - מציגים עד 300 תוצאות; החיפוש מצמצם

// בחירה מרובה עם חיפוש. options: [{ value, label }], value: מערך הערכים שנבחרו ([] = הכל).
export default function MultiSelect({ options, value, onChange, allLabel = 'הכל', minWidth = 170 }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const selected = useMemo(() => new Set(value), [value]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => String(o.label).toLowerCase().includes(q)) : options;
  }, [options, query]);

  function toggle(v) {
    onChange(selected.has(v) ? value.filter((x) => x !== v) : [...value, v]);
  }

  const buttonText = value.length === 0
    ? allLabel
    : value.length === 1
      ? options.find((o) => o.value === value[0])?.label ?? '1 נבחר'
      : `${value.length} נבחרו`;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ ...styles.button, minWidth, ...(value.length ? styles.buttonActive : null) }}>
        <span style={styles.buttonText}>{buttonText}</span>
        <span style={{ color: '#9ca3af', fontSize: 10 }}>▼</span>
      </button>
      {open && (
        <div style={styles.pop}>
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש..." style={styles.search} />
          <div style={styles.list}>
            {filtered.length === 0 && <div style={styles.empty}>אין תוצאות</div>}
            {filtered.slice(0, MAX_SHOWN).map((o) => (
              <label key={o.value} style={styles.item}>
                <input type="checkbox" checked={selected.has(o.value)} onChange={() => toggle(o.value)} />
                <span>{o.label}</span>
              </label>
            ))}
            {filtered.length > MAX_SHOWN && <div style={styles.empty}>ועוד {filtered.length - MAX_SHOWN} - הקלד לחיפוש</div>}
          </div>
          <div style={styles.actions}>
            <button type="button" style={styles.link} onClick={() => onChange([...new Set([...value, ...filtered.map((o) => o.value)])])}>
              {query.trim() ? 'בחר את כל התוצאות' : 'בחר הכל'}
            </button>
            <button type="button" style={styles.link} onClick={() => onChange([])}>נקה</button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  button: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', color: '#111827', maxWidth: 240 },
  buttonActive: { borderColor: '#dc2626', background: '#fef2f2' },
  buttonText: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  pop: { position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 30, background: '#fff', border: '1px solid #d1d5db', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', width: 280, padding: 8 },
  search: { width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '6px 9px', borderRadius: 7, border: '1px solid #d1d5db', marginBottom: 6 },
  list: { maxHeight: 260, overflowY: 'auto' },
  item: { display: 'flex', alignItems: 'center', gap: 7, padding: '4px 2px', fontSize: 13, cursor: 'pointer' },
  empty: { fontSize: 12, color: '#9ca3af', padding: '6px 2px' },
  actions: { display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f0f0f0', marginTop: 6, paddingTop: 6 },
  link: { background: 'none', border: 'none', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 },
};
