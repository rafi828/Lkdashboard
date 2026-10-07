// ==========================================================
// "הזמנות רכש לפי עצי מוצר" - החישוב (רץ בדפדפן, בלי גישה ל-DB). העברה של הלוגיקה מהכלי המקורי (HTML):
// - צריכה של פריט = מכירה ישירה + (כמות ליחידה × צריכת כל פריט אב), רקורסיבי (רכיב בתוך רכיב).
// - ממוצע חודשי = צריכה / מספר חודשי התקופה. חודשי מלאי = יתרה / ממוצע חודשי.
// - מומלץ להזמין = יעד חודשי מלאי × ממוצע חודשי - יתרה - מוזמן מספק (לא פחות מ-0).
// - מגשים עם אותו מספר ושם דומה (ישן/חדש) מאוחדים לשורת מכלול אחת.
// ==========================================================

function buildGraph(edges) {
  const childrenOf = {};
  const parentsOf = {};
  const universe = new Set();
  edges.forEach((e) => {
    (childrenOf[e.parent] = childrenOf[e.parent] || []).push({ code: e.child, qty: e.qty });
    (parentsOf[e.child] = parentsOf[e.child] || []).push({ code: e.parent, qty: e.qty });
    universe.add(e.parent);
    universe.add(e.child);
  });
  return { childrenOf, parentsOf, universe: Array.from(universe) };
}

// ---- איחוד מגשים ישנים/חדשים ----
const TRAY_STOPWORDS = new Set(['מגש', 'מס', 'קומפלט', 'עם', 'ללא', 'כלים', 'יח', 'יחידות', 'עבור', 'כלי']);
const GROUP_HUES = [206, 28, 150, 340, 48, 265, 12, 180, 95, 320, 10, 230];

function traySignature(name) {
  const s = String(name || '').replace(/ /g, ' ').trim().replace(/CARBON/gi, ' ');
  const m = s.match(/מגש\s*מס['׳]?\s*(\d+)/);
  const trayNum = m ? parseInt(m[1], 10) : null;
  const tokens = s.replace(/['׳"״]/g, '').split(/[^A-Za-z0-9א-ת]+/).filter(Boolean)
    .filter((t) => !TRAY_STOPWORDS.has(t) && t !== String(trayNum))
    .map((t) => t.toUpperCase().replace(/ו/g, ''));
  return { trayNum, tokens };
}

function jaccard(a, b) {
  if (!a.length && !b.length) return 1;
  const A = new Set(a);
  const inter = b.filter((t) => A.has(t)).length;
  const union = new Set([...a, ...b]).size;
  return union ? inter / union : 1;
}

function buildGroups(items, byCode, childrenOf, roots) {
  const byNum = {};
  items.filter((it) => childrenOf[it.code] && /מגש\s*מס/.test(it.name)).forEach((it) => {
    const sig = traySignature(it.name);
    if (sig.trayNum != null) (byNum[sig.trayNum] = byNum[sig.trayNum] || []).push({ it, sig });
  });

  const groups = [];
  const used = new Set();
  Object.keys(byNum).map(Number).sort((a, b) => a - b).forEach((trayNum) => {
    const arr = byNum[trayNum];
    const parent = arr.map((_, i) => i);
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        if (jaccard(arr[i].sig.tokens, arr[j].sig.tokens) > 0.75) parent[find(i)] = find(j);
      }
    }
    const clusters = {};
    arr.forEach((x, i) => (clusters[find(i)] = clusters[find(i)] || []).push(x.it.code));
    Object.values(clusters).forEach((members) => {
      groups.push({ trayNum, members, label: 'מגש ' + trayNum, merged: members.length > 1 });
      members.forEach((c) => used.add(c));
    });
  });
  roots.forEach((r) => {
    if (!used.has(r)) {
      groups.push({ trayNum: null, members: [r], label: byCode[r].name, merged: false });
      used.add(r);
    }
  });

  groups.sort((a, b) => {
    if (a.trayNum != null && b.trayNum != null) return a.trayNum - b.trayNum;
    if (a.trayNum != null) return -1;
    if (b.trayNum != null) return 1;
    return byCode[b.members[0]].monthlyAvg - byCode[a.members[0]].monthlyAvg;
  });
  groups.forEach((g, i) => {
    const hue = GROUP_HUES[i % GROUP_HUES.length];
    g.key = 'grp:' + g.members.join(',');
    g.color = `hsl(${hue},62%,52%)`;
    g.bg = `hsl(${hue},68%,96%)`;
  });

  // לכל פריט - המכלול הראשון שהוא נמצא בעץ שלו (לצביעה ולעמודת "שייך למכלול")
  const groupOf = {};
  groups.forEach((g) => {
    const stack = g.members.slice();
    const seen = new Set();
    while (stack.length) {
      const code = stack.pop();
      if (seen.has(code)) continue;
      seen.add(code);
      if (!groupOf[code]) groupOf[code] = g;
      (childrenOf[code] || []).forEach((c) => stack.push(c.code));
    }
  });
  return { groups, groupOf };
}

// data = { edges, names, sales, stock, orders } (מ-/api/dashboard/bom-orders). settings = { months, targetMonths }
function computeBom(data, settings) {
  const { childrenOf, parentsOf, universe } = buildGraph(data.edges);
  const sales = Object.fromEntries(data.sales.map((r) => [r.code, r]));
  const stock = Object.fromEntries(data.stock.map((r) => [r.code, r]));
  const orders = Object.fromEntries(data.orders.map((r) => [r.code, r]));
  const salesQty = (c) => (sales[c] && sales[c].qty) || 0;

  const memo = {};
  const visiting = new Set();
  function consumption(code) {
    if (code in memo) return memo[code];
    if (visiting.has(code)) return 0; // הגנה ממעגל בעץ
    visiting.add(code);
    let total = salesQty(code);
    (parentsOf[code] || []).forEach((p) => { total += p.qty * consumption(p.code); });
    visiting.delete(code);
    memo[code] = total;
    return total;
  }

  const { months, targetMonths } = settings;
  const items = universe.map((code) => {
    const name = data.names[code] || sales[code]?.name || stock[code]?.name || orders[code]?.name || code;
    const direct = salesQty(code);
    const total = consumption(code);
    const level2 = (parentsOf[code] || []).reduce((s, p) => s + p.qty * salesQty(p.code), 0);
    const monthlyAvg = months > 0 ? total / months : 0;
    const st = stock[code] || { total: 0, production: 0 };
    const monthsOfStock = monthlyAvg > 0 ? st.total / monthlyAvg : st.total > 0 ? Infinity : null;
    const bySuppliers = orders[code]?.by_suppliers || 0;
    return {
      code, name, direct, level2, level3plus: Math.max(0, total - direct - level2), total, monthlyAvg,
      stockTotal: st.total, stockProd: st.production, stockNoProd: st.total - st.production, monthsOfStock,
      bySuppliers, byCustomers: orders[code]?.by_customers || 0,
      recommended: Math.max(0, Math.round(targetMonths * monthlyAvg - st.total - bySuppliers)),
      isRoot: !parentsOf[code], isLeaf: !childrenOf[code],
      saleNoQty: !!(sales[code] && !sales[code].has_qty && sales[code].amount),
    };
  });
  const byCode = Object.fromEntries(items.map((it) => [it.code, it]));
  const roots = universe.filter((c) => !parentsOf[c]);
  const { groups, groupOf } = buildGroups(items, byCode, childrenOf, roots);
  return { items, byCode, childrenOf, groups, groupOf };
}

// שורת סיכום למכלול (סכום הפריטים המאוחדים)
function aggregateGroup(group, byCode) {
  const m = group.members.map((c) => byCode[c]);
  const sum = (f) => m.reduce((s, x) => s + (x[f] || 0), 0);
  const stockTotal = sum('stockTotal');
  const monthlyAvg = sum('monthlyAvg');
  return {
    code: group.members.join(' / '),
    name: group.merged ? `${group.label}  (${m.map((x) => x.code + ' — ' + x.name).join('  +  ')})` : m[0].name,
    direct: sum('direct'), level2: sum('level2'), level3plus: sum('level3plus'), total: sum('total'), monthlyAvg,
    stockTotal, stockProd: sum('stockProd'), stockNoProd: sum('stockNoProd'),
    monthsOfStock: monthlyAvg > 0 ? stockTotal / monthlyAvg : stockTotal > 0 ? Infinity : null,
    bySuppliers: sum('bySuppliers'), byCustomers: sum('byCustomers'), recommended: sum('recommended'),
    isRoot: true, isLeaf: false, saleNoQty: m.some((x) => x.saleNoQty),
  };
}

// שורות תצוגת העץ. passes(item) = האם הפריט עובר את הסינון; ענף מוצג אם יש בו לפחות פריט אחד שעובר.
// isOpen(key, defaultOpen) - מצב פתיחה; fullyExpand = הכל פתוח (לייצוא).
function treeRows(model, passes, isOpen, fullyExpand) {
  const { byCode, childrenOf, groups } = model;
  const memo = {};
  function subtreePasses(code, path) {
    if (code in memo) return memo[code];
    if (path.has(code)) return false;
    path.add(code);
    const r = passes(byCode[code]) || (childrenOf[code] || []).some((c) => subtreePasses(c.code, path));
    path.delete(code);
    memo[code] = r;
    return r;
  }

  const rows = [];
  function walk(code, depth, group, path) {
    if (path.has(code) || !subtreePasses(code, new Set())) return;
    const kids = childrenOf[code] || [];
    const open = fullyExpand || isOpen(code, false);
    rows.push({ type: 'item', key: code, depth, it: byCode[code], group, hasKids: kids.length > 0, open });
    if (open) {
      const next = new Set(path).add(code);
      kids.forEach((c) => walk(c.code, depth + 1, group, next));
    }
  }
  groups.forEach((g) => {
    if (!g.members.some((c) => subtreePasses(c, new Set()))) return;
    const open = fullyExpand || isOpen(g.key, true);
    rows.push({ type: 'group', key: g.key, depth: 0, it: aggregateGroup(g, byCode), group: g, hasKids: true, open });
    if (open) {
      const path = new Set(g.members);
      g.members.forEach((m) => (childrenOf[m] || []).forEach((c) => walk(c.code, 1, g, path)));
    }
  });
  return rows;
}

module.exports = { computeBom, aggregateGroup, treeRows, traySignature };
