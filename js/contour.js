// تحويل الأشكال ثنائية الأبعاد إلى مجسمات بحواف ناعمة:
// Marching Squares لاستخراج الحدود من صورة مُنعّمة، ثم تبسيط، ثم تثليث earcut، ثم بثق.
import earcut from '../vendor/earcut.js';

/** يستخرج الحلقات المغلقة عند المستوى iso من حقل قيم w×h */
export function traceLoops(f, w, h, iso = 0.5) {
  const V = (i, j) => (i < 0 || j < 0 || i >= w || j >= h ? 0 : f[j * w + i]);
  const pts = new Map(); // مفتاح الحافة -> [x,y]
  const adj = new Map(); // مفتاح الحافة -> جيران
  const link = (a, b) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b); adj.get(b).push(a);
  };
  const W2 = w + 2;
  // مفاتيح رقمية: أفقية (i,j)->(i+1,j) و عمودية (i,j)->(i,j+1)
  const hk = (i, j) => ((j + 1) * W2 + (i + 1)) * 2;
  const vk = (i, j) => ((j + 1) * W2 + (i + 1)) * 2 + 1;
  const ept = (key, i0, j0, i1, j1) => {
    if (pts.has(key)) return key;
    const a = V(i0, j0), b = V(i1, j1);
    const t = Math.abs(b - a) < 1e-9 ? 0.5 : Math.min(1, Math.max(0, (iso - a) / (b - a)));
    pts.set(key, [i0 + (i1 - i0) * t, j0 + (j1 - j0) * t]);
    return key;
  };
  for (let j = -1; j < h; j++) for (let i = -1; i < w; i++) {
    const tl = V(i, j), tr = V(i + 1, j), br = V(i + 1, j + 1), bl = V(i, j + 1);
    const c = (tl >= iso ? 8 : 0) | (tr >= iso ? 4 : 0) | (br >= iso ? 2 : 0) | (bl >= iso ? 1 : 0);
    if (c === 0 || c === 15) continue;
    const T = () => ept(hk(i, j), i, j, i + 1, j);
    const B = () => ept(hk(i, j + 1), i, j + 1, i + 1, j + 1);
    const L = () => ept(vk(i, j), i, j, i, j + 1);
    const R = () => ept(vk(i + 1, j), i + 1, j, i + 1, j + 1);
    const center = (tl + tr + br + bl) / 4 >= iso;
    switch (c) {
      case 1: link(L(), B()); break;
      case 2: link(B(), R()); break;
      case 3: link(L(), R()); break;
      case 4: link(T(), R()); break;
      case 5: if (center) { link(L(), T()); link(B(), R()); } else { link(L(), B()); link(T(), R()); } break;
      case 6: link(T(), B()); break;
      case 7: link(L(), T()); break;
      case 8: link(L(), T()); break;
      case 9: link(T(), B()); break;
      case 10: if (center) { link(T(), R()); link(L(), B()); } else { link(L(), T()); link(B(), R()); } break;
      case 11: link(T(), R()); break;
      case 12: link(L(), R()); break;
      case 13: link(B(), R()); break;
      case 14: link(L(), B()); break;
    }
  }
  const seen = new Set(), loops = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = []; let prev = -1, cur = start;
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur); loop.push(pts.get(cur));
      const n = adj.get(cur);
      const nxt = n[0] !== prev ? n[0] : n[1];
      prev = cur; cur = nxt;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/** تبسيط Douglas–Peucker لحلقة مغلقة */
function simplify(loop, tol) {
  if (loop.length < 8) return loop;
  const n = loop.length;
  // نقسم الحلقة عند أبعد نقطتين
  let far = 0, fd = -1;
  for (let k = 1; k < n; k++) { const d = (loop[k][0] - loop[0][0]) ** 2 + (loop[k][1] - loop[0][1]) ** 2; if (d > fd) { fd = d; far = k; } }
  const keep = new Uint8Array(n); keep[0] = keep[far] = 1;
  const tol2 = tol * tol;
  const rec = (a, b) => {
    const stack = [[a, b]];
    while (stack.length) {
      const [s, e] = stack.pop();
      const A = loop[s], B = loop[e % n];
      const dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy || 1e-12;
      let md = -1, mi = -1;
      for (let k = s + 1; k < e; k++) {
        const P = loop[k % n];
        let t = ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L2; t = Math.max(0, Math.min(1, t));
        const d = (A[0] + t * dx - P[0]) ** 2 + (A[1] + t * dy - P[1]) ** 2;
        if (d > md) { md = d; mi = k; }
      }
      if (md > tol2) { keep[mi % n] = 1; stack.push([s, mi], [mi, e]); }
    }
  };
  rec(0, far); rec(far, n);
  const out = [];
  for (let k = 0; k < n; k++) if (keep[k]) out.push(loop[k]);
  return out.length >= 3 ? out : loop;
}

const area = (p) => { let a = 0; for (let k = 0, n = p.length; k < n; k++) { const q = p[k], r = p[(k + 1) % n]; a += q[0] * r[1] - r[0] * q[1]; } return a / 2; };
function inside(pt, poly) {
  let c = false;
  for (let k = 0, n = poly.length, l = n - 1; k < n; l = k++) {
    const a = poly[k], b = poly[l];
    if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

/** حذف النقاط المكررة والواقعة على خط مستقيم (earcut يحذفها داخلياً فتسبب فجوات مع الجدران) */
function dropCollinear(p) {
  let changed = true;
  while (changed && p.length > 3) {
    changed = false;
    const out = [];
    for (let k = 0, n = p.length; k < n; k++) {
      const a = out.length ? out[out.length - 1] : p[(k - 1 + n) % n], b = p[k], c = p[(k + 1) % n];
      const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (Math.abs(cr) < 1e-9 || (b[0] === a[0] && b[1] === a[1])) { changed = true; continue; }
      out.push(b);
    }
    p = out;
  }
  return p;
}

/** يجمع الحلقات إلى مضلعات (خارجي + ثقوب) بالإحداثيات العالمية (مم، Y للأعلى) */
export function polygonsFromField(f, w, h, px, { iso = 0.5, tol = 0.35, minArea = 0.6 } = {}) {
  const raw = traceLoops(f, w, h, iso);
  const loops = [];
  for (const l of raw) {
    const tf = ([x, y]) => [(x + 0.5) * px, (h - (y + 0.5)) * px];
    const s = dropCollinear(simplify(l, tol).map(tf));
    if (s.length < 3) continue;
    const rawP = dropCollinear(l.map(tf));
    const a = area(s);
    if (Math.abs(a) < minArea * px * px) continue;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of s) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    loops.push({ p: s, raw: rawP.length >= 3 ? rawP : s, abs: Math.abs(a), bb: [x0, y0, x1, y1], parent: -1, depth: 0, holes: [], rawHoles: [] });
  }
  loops.sort((a, b) => b.abs - a.abs);
  for (let k = 0; k < loops.length; k++) {
    const L = loops[k];
    // أصغر حلقة تحتويه (من الأكبر منه)
    for (let m = k - 1; m >= 0; m--) {
      const O = loops[m];
      if (L.bb[0] < O.bb[0] || L.bb[1] < O.bb[1] || L.bb[2] > O.bb[2] || L.bb[3] > O.bb[3]) continue;
      // نقطة منتصف أول ضلع لتجنب التطابق على الحدود
      const q = [(L.p[0][0] + L.p[1][0]) / 2, (L.p[0][1] + L.p[1][1]) / 2];
      if (inside(q, O.p)) { L.parent = m; L.depth = O.depth + 1; break; }
    }
  }
  const polys = [];
  loops.forEach((L) => {
    if (L.depth % 2 === 0) { if (area(L.p) < 0) L.p.reverse(); if (area(L.raw) < 0) L.raw.reverse(); polys.push(L); }
  });
  loops.forEach((L) => {
    if (L.depth % 2 === 1) {
      if (area(L.p) > 0) L.p.reverse(); if (area(L.raw) > 0) L.raw.reverse();
      loops[L.parent].holes.push(L.p); loops[L.parent].rawHoles.push(L.raw);
    }
  });
  return polys.map((P) => ({ outer: P.p, holes: P.holes, rawOuter: P.raw, rawHoles: P.rawHoles }));
}

/** تثليث مع التحقق: كل ضلع حدودي يجب أن يظهر مرة واحدة وكل ضلع داخلي مرتين بعكس الاتجاه */
function triangulate(ring) {
  const flat = [], holeIdx = [], starts = [];
  for (let r = 0; r < ring.length; r++) {
    starts.push(flat.length / 2);
    if (r > 0) holeIdx.push(flat.length / 2);
    for (const [x, y] of ring[r]) flat.push(x, y);
  }
  const idx = earcut(flat, holeIdx.length ? holeIdx : null, 2);
  const E = new Map(); const key = (a, b) => a * 1e7 + b;
  for (let t = 0; t < idx.length; t += 3) {
    let a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const cr = (flat[b * 2] - flat[a * 2]) * (flat[c * 2 + 1] - flat[a * 2 + 1]) - (flat[b * 2 + 1] - flat[a * 2 + 1]) * (flat[c * 2] - flat[a * 2]);
    if (cr < 0) { [b, c] = [c, b]; idx[t + 1] = b; idx[t + 2] = c; }
    for (const [u, v] of [[a, b], [b, c], [c, a]]) E.set(key(u, v), (E.get(key(u, v)) || 0) + 1);
  }
  let ok = true;
  const ringEdge = new Set();
  for (let r = 0; r < ring.length && ok; r++) {
    const n = ring[r].length, s0 = starts[r];
    for (let k = 0; k < n; k++) {
      const u = s0 + k, v = s0 + (k + 1) % n;
      ringEdge.add(key(u, v));
      if (E.get(key(u, v)) !== 1 || E.has(key(v, u))) { ok = false; break; }
    }
  }
  if (ok) for (const [k, n] of E) {
    if (n !== 1) { ok = false; break; }
    if (ringEdge.has(k)) continue;
    const u = Math.floor(k / 1e7), v = k - u * 1e7;
    if (E.get(key(v, u)) !== 1) { ok = false; break; }
  }
  return { flat, idx, ok };
}

/** بثق مضلعات بين z0 و z1 إلى مجسم مغلق */
export function extrude(polys, z0, z1) {
  const out = [];
  const push = (...v) => { for (const x of v) out.push(x); };
  for (const poly of polys) {
    let ring = [poly.outer, ...poly.holes];
    let T = triangulate(ring);
    if (!T.ok && poly.rawOuter) {
      // التبسيط سبّب تقاطعاً — نرجع للحدود الأصلية
      const ring2 = [poly.rawOuter, ...poly.rawHoles];
      const T2 = triangulate(ring2);
      if (T2.ok || !T.ok) { ring = ring2; T = T2; }
    }
    const { flat, idx } = T;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      push(flat[a * 2], flat[a * 2 + 1], z1, flat[b * 2], flat[b * 2 + 1], z1, flat[c * 2], flat[c * 2 + 1], z1);
      push(flat[a * 2], flat[a * 2 + 1], z0, flat[c * 2], flat[c * 2 + 1], z0, flat[b * 2], flat[b * 2 + 1], z0);
    }
    for (const loop of ring) {
      for (let k = 0, n = loop.length; k < n; k++) {
        const [x0, y0] = loop[k], [x1, y1] = loop[(k + 1) % n];
        push(x0, y0, z0, x1, y1, z0, x1, y1, z1);
        push(x0, y0, z0, x1, y1, z1, x0, y0, z1);
      }
    }
  }
  return new Float32Array(out);
}

/** اختصار: حقل -> مجسم */
export function fieldToSolid(f, w, h, px, z0, z1, opts) {
  return extrude(polygonsFromField(f, w, h, px, opts), z0, z1);
}
