// גרפים משותפים לעמודי המגמות (SVG פשוט, בלי ספריה חיצונית).
// ציר הזמן מימין לשמאל (RTL): הפריט הראשון (ינואר / רבעון 1) בצד ימין.

const W = 760;
const PAD_L = 12, PAD_R = 76, PAD_T = 14, PAD_B = 30;

export function fmtMoney(n) {
  return '₪' + Math.round(n).toLocaleString('he-IL');
}

// קיצור לתוויות ציר: ₪1.2M / ₪350K
function fmtShort(n) {
  const a = Math.abs(n);
  if (a >= 1e6) return '₪' + (n / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
  if (a >= 1e3) return '₪' + Math.round(n / 1e3) + 'K';
  return '₪' + Math.round(n);
}

// מקסימום "עגול" לציר Y
function niceMax(v) {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => f <= x);
  return nice * exp;
}

function Frame({ height, labels, max, tickFormat, xOf, children, refLine }) {
  const plotH = height - PAD_T - PAD_B;
  const yOf = (v) => PAD_T + plotH - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" style={{ display: 'block', overflow: 'visible', fontFamily: 'inherit', direction: 'ltr' }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD_L} x2={W - PAD_R} y1={yOf(t)} y2={yOf(t)} stroke="#f0f0f2" />
          <text x={W - PAD_R + 8} y={yOf(t) + 4} fontSize="11" fill="#9ca3af" textAnchor="start">{tickFormat(t)}</text>
        </g>
      ))}
      {refLine && refLine.value <= max && (
        <g>
          <line x1={PAD_L} x2={W - PAD_R} y1={yOf(refLine.value)} y2={yOf(refLine.value)} stroke="#111827" strokeDasharray="4 4" strokeWidth="1.2" />
          <text x={PAD_L + 2} y={yOf(refLine.value) - 5} fontSize="11" fill="#111827" textAnchor="start">{refLine.label}</text>
        </g>
      )}
      {labels.map((l, i) => (
        <text key={i} x={xOf(i)} y={height - 8} fontSize="11" fill="#6b7280" textAnchor="middle">{l}</text>
      ))}
      {children(yOf)}
    </svg>
  );
}

export function Legend({ series }) {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#374151' }}>
      {series.map((s) => (
        <span key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: s.type === 'line' ? 3 : 10, borderRadius: 2, background: s.color, opacity: s.dashed ? 0.7 : 1 }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

// גרף קווים. series: [{ name, color, values: [number|null], dashed }]. null = אין נתון (הקו נקטע).
export function LineChart({ labels, series, height = 220, format = fmtMoney, tickFormat = fmtShort, refLine, minMax = 0 }) {
  const n = labels.length;
  const plotW = W - PAD_L - PAD_R;
  const xOf = (i) => W - PAD_R - (n > 1 ? (i * plotW) / (n - 1) : plotW / 2);
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  const max = niceMax(Math.max(minMax, refLine ? refLine.value * 1.1 : 0, ...all));
  return (
    <Frame height={height} labels={labels} max={max} tickFormat={tickFormat} xOf={xOf} refLine={refLine}>
      {(yOf) => series.map((s) => {
        // קטעים רציפים בלבד (מדלגים על null)
        const runs = [];
        let cur = [];
        s.values.forEach((v, i) => {
          if (v == null) { if (cur.length) runs.push(cur); cur = []; }
          else cur.push(`${xOf(i)},${yOf(v)}`);
        });
        if (cur.length) runs.push(cur);
        return (
          <g key={s.name}>
            {runs.map((r, k) => (
              <polyline key={k} points={r.join(' ')} fill="none" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dashed ? '6 5' : undefined} />
            ))}
            {s.values.map((v, i) => v != null && (
              <circle key={i} cx={xOf(i)} cy={yOf(v)} r={s.dashed ? 3 : 4} fill={s.color}>
                <title>{`${s.name} · ${labels[i]}: ${format(v)}`}</title>
              </circle>
            ))}
          </g>
        );
      })}
    </Frame>
  );
}

// גרף עמודות מקובצות. series: [{ name, color, values: [number|null] }].
export function BarChart({ labels, series, height = 220, format = fmtMoney, tickFormat = fmtShort }) {
  const n = labels.length;
  const plotW = W - PAD_L - PAD_R;
  const groupW = plotW / n;
  const xOf = (i) => W - PAD_R - groupW * (i + 0.5);
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  const max = niceMax(Math.max(...all, 0));
  const barW = Math.min(36, (groupW * 0.7) / series.length);
  return (
    <Frame height={height} labels={labels} max={max} tickFormat={tickFormat} xOf={xOf}>
      {(yOf) => labels.map((_, i) => series.map((s, k) => {
        const v = s.values[i];
        if (v == null) return null;
        // הסדרה הראשונה בצד ימין של הקבוצה (RTL)
        const x = xOf(i) + (series.length * barW) / 2 - (k + 1) * barW;
        return (
          <rect key={`${i}-${k}`} x={x + 1} y={yOf(v)} width={barW - 2} height={Math.max(0, yOf(0) - yOf(v))} rx="3" fill={s.color}>
            <title>{`${s.name} · ${labels[i]}: ${format(v)}`}</title>
          </rect>
        );
      }))}
    </Frame>
  );
}
