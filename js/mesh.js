// محرك توليد المجسمات: يحوّل خرائط الارتفاع إلى مجسمات مغلقة (watertight) جاهزة للطباعة
// كل الوحدات بالمليمتر.

/**
 * مجسم "عمودي" من خلايا: لكل خلية قاع (bottom) وسطح (top).
 * الخلية الفارغة: top <= bottom. ينتج مجسماً مغلقاً بدون ثقوب.
 * @returns {Float32Array} مثلثات غير مفهرسة (9 أرقام لكل مثلث)
 */
export function voxelColumns(top, bottom, w, h, px) {
  const filled = (i, j) => i >= 0 && j >= 0 && i < w && j < h && top[j * w + i] > (bottom ? bottom[j * w + i] : 0);
  const B = (k) => (bottom ? bottom[k] : 0);

  // الدفعة الأولى: عدّ المثلثات
  let tris = 0;
  const walls = (i, j, b, t, cb) => {
    const dirs = [[1, 0], [-1, 0], [0, -1], [0, 1]];
    for (let d = 0; d < 4; d++) {
      const ni = i + dirs[d][0], nj = j + dirs[d][1];
      if (!filled(ni, nj)) { cb(d, b, t); continue; }
      const nk = nj * w + ni, nb = B(nk), nt = top[nk];
      if (nb > b) cb(d, b, Math.min(t, nb));
      if (nt < t) cb(d, Math.max(b, nt), t);
    }
  };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i;
    if (!filled(i, j)) continue;
    tris += 4;
    walls(i, j, B(k), top[k], () => { tris += 2; });
  }

  const out = new Float32Array(tris * 9);
  let o = 0;
  const v = (x, y, z) => { out[o++] = x; out[o++] = y; out[o++] = z; };
  const quad = (a, b, c, d) => { v(...a); v(...b); v(...c); v(...a); v(...c); v(...d); };

  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i;
    if (!filled(i, j)) continue;
    const x0 = i * px, x1 = x0 + px;
    const y0 = (h - 1 - j) * px, y1 = y0 + px;
    const b = B(k), t = top[k];
    quad([x0, y0, t], [x1, y0, t], [x1, y1, t], [x0, y1, t]); // سطح علوي
    quad([x0, y0, b], [x0, y1, b], [x1, y1, b], [x1, y0, b]); // قاع
    walls(i, j, b, t, (d, zl, zh) => {
      if (d === 0) quad([x1, y0, zl], [x1, y1, zl], [x1, y1, zh], [x1, y0, zh]);      // +X
      else if (d === 1) quad([x0, y1, zl], [x0, y0, zl], [x0, y0, zh], [x0, y1, zh]); // -X
      else if (d === 2) quad([x1, y1, zl], [x0, y1, zl], [x0, y1, zh], [x1, y1, zh]); // +Y (صف أعلى)
      else quad([x0, y0, zl], [x1, y0, zl], [x1, y0, zh], [x0, y0, zh]);              // -Y
    });
  }
  return out;
}

/**
 * سطح ناعم (لليثوفين والنقش البارز): شبكة رؤوس w×h بارتفاعات، مع قاع مسطح وجدران.
 * @param {Float32Array} z ارتفاع كل رأس (>0)
 */
export function smoothSlab(z, w, h, px) {
  const per = 2 * (w - 1) * (h - 1) + 2 * 2 * ((w - 1) + (h - 1)) + 2 * ((w - 1) + (h - 1));
  const out = new Float32Array(per * 9);
  let o = 0;
  const v = (x, y, zz) => { out[o++] = x; out[o++] = y; out[o++] = zz; };
  const X = (i) => i * px, Y = (j) => (h - 1 - j) * px, Z = (i, j) => z[j * w + i];

  // السطح العلوي
  for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) {
    const a = [X(i), Y(j + 1), Z(i, j + 1)], b = [X(i + 1), Y(j + 1), Z(i + 1, j + 1)];
    const c = [X(i + 1), Y(j), Z(i + 1, j)], d = [X(i), Y(j), Z(i, j)];
    v(...a); v(...b); v(...c); v(...a); v(...c); v(...d);
  }
  // المحيط بترتيب عكس عقارب الساعة (منظور من الأعلى)
  const per_ = [];
  for (let i = 0; i < w - 1; i++) per_.push([i, h - 1]);       // الحافة السفلية يساراً→يميناً
  for (let j = h - 1; j > 0; j--) per_.push([w - 1, j]);        // اليمنى للأعلى
  for (let i = w - 1; i > 0; i--) per_.push([i, 0]);            // العلوية يميناً→يساراً
  for (let j = 0; j < h - 1; j++) per_.push([0, j]);            // اليسرى للأسفل
  const cx = X(w - 1) / 2, cy = Y(0) / 2;
  for (let n = 0; n < per_.length; n++) {
    const [i0, j0] = per_[n], [i1, j1] = per_[(n + 1) % per_.length];
    const p0 = [X(i0), Y(j0)], p1 = [X(i1), Y(j1)];
    // جدار للخارج
    v(p0[0], p0[1], 0); v(p1[0], p1[1], 0); v(p1[0], p1[1], Z(i1, j1));
    v(p0[0], p0[1], 0); v(p1[0], p1[1], Z(i1, j1)); v(p0[0], p0[1], Z(i0, j0));
    // قاع (مروحة من المركز، معكوسة للأسفل)
    v(cx, cy, 0); v(p1[0], p1[1], 0); v(p0[0], p0[1], 0);
  }
  return out.subarray(0, o);
}

/** دمج عدة مصفوفات مثلثات */
export function mergeTris(list) {
  const n = list.reduce((s, a) => s + a.length, 0);
  const out = new Float32Array(n);
  let o = 0;
  for (const a of list) { out.set(a, o); o += a.length; }
  return out;
}

/** تصدير STL ثنائي */
export function toSTL(tris, name = 'model') {
  const n = tris.length / 9;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  const header = `Q3D ${name}`.slice(0, 79);
  for (let i = 0; i < header.length; i++) dv.setUint8(i, header.charCodeAt(i) & 0x7f);
  dv.setUint32(80, n, true);
  let p = 84;
  for (let t = 0; t < n; t++) {
    const b = t * 9;
    const ux = tris[b + 3] - tris[b], uy = tris[b + 4] - tris[b + 1], uz = tris[b + 5] - tris[b + 2];
    const vx = tris[b + 6] - tris[b], vy = tris[b + 7] - tris[b + 1], vz = tris[b + 8] - tris[b + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    dv.setFloat32(p, nx / l, true); dv.setFloat32(p + 4, ny / l, true); dv.setFloat32(p + 8, nz / l, true);
    p += 12;
    for (let k = 0; k < 9; k++) { dv.setFloat32(p, tris[b + k], true); p += 4; }
    dv.setUint16(p, 0, true); p += 2;
  }
  return new Blob([buf], { type: 'model/stl' });
}

/** حجم المجسم (مم³) عبر مبرهنة التباعد — يعمل لأي مجسم مغلق */
export function volumeOf(tris) {
  let vol = 0;
  for (let b = 0; b < tris.length; b += 9) {
    const ax = tris[b], ay = tris[b + 1], az = tris[b + 2];
    const bx = tris[b + 3], by = tris[b + 4], bz = tris[b + 5];
    const cx = tris[b + 6], cy = tris[b + 7], cz = tris[b + 8];
    vol += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return Math.abs(vol / 6);
}

export function bboxOf(tris) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tris.length; i++) {
    const a = i % 3;
    if (tris[i] < mn[a]) mn[a] = tris[i];
    if (tris[i] > mx[a]) mx[a] = tris[i];
  }
  return { min: mn, max: mx, size: mx.map((x, i) => x - mn[i]) };
}

/** توسيع قناع ثنائي بنصف قطر r خلية (دائري تقريبي) */
export function dilate(mask, w, h, r) {
  if (r <= 0) return mask.slice();
  let cur = mask.slice();
  // تمرير متكرر بنصف قطر 1 بشكل 8-اتجاهات/4-اتجاهات بالتناوب يعطي شكلاً قريباً من الدائرة
  for (let s = 0; s < r; s++) {
    const nxt = cur.slice();
    const diag = s % 2 === 1;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (cur[j * w + i]) continue;
      let hit = (i > 0 && cur[j * w + i - 1]) || (i < w - 1 && cur[j * w + i + 1]) ||
        (j > 0 && cur[(j - 1) * w + i]) || (j < h - 1 && cur[(j + 1) * w + i]);
      if (!hit && diag) hit = (i > 0 && j > 0 && cur[(j - 1) * w + i - 1]) || (i < w - 1 && j > 0 && cur[(j - 1) * w + i + 1]) ||
        (i > 0 && j < h - 1 && cur[(j + 1) * w + i - 1]) || (i < w - 1 && j < h - 1 && cur[(j + 1) * w + i + 1]);
      if (hit) nxt[j * w + i] = 1;
    }
    cur = nxt;
  }
  return cur;
}

/** تنعيم صندوقي سريع لمصفوفة رمادية */
export function boxBlur(src, w, h, r) {
  if (r <= 0) return src;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let s = 0, c = 0;
    for (let d = -r; d <= r; d++) { const x = i + d; if (x >= 0 && x < w) { s += src[j * w + x]; c++; } }
    tmp[j * w + i] = s / c;
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let s = 0, c = 0;
    for (let d = -r; d <= r; d++) { const y = j + d; if (y >= 0 && y < h) { s += tmp[y * w + i]; c++; } }
    out[j * w + i] = s / c;
  }
  return out;
}

/** إزالة الجزر الصغيرة غير المتصلة بالجسم الأكبر (تمنع قطع تطير أثناء الطباعة) */
export function keepLargest(mask, w, h, minFrac = 0.02) {
  const lab = new Int32Array(w * h).fill(-1);
  const sizes = [];
  const stack = [];
  for (let k = 0; k < w * h; k++) {
    if (!mask[k] || lab[k] >= 0) continue;
    const id = sizes.length; let n = 0;
    stack.push(k); lab[k] = id;
    while (stack.length) {
      const c = stack.pop(); n++;
      const i = c % w, j = (c / w) | 0;
      const nb = [i > 0 ? c - 1 : -1, i < w - 1 ? c + 1 : -1, j > 0 ? c - w : -1, j < h - 1 ? c + w : -1];
      for (const q of nb) if (q >= 0 && mask[q] && lab[q] < 0) { lab[q] = id; stack.push(q); }
    }
    sizes.push(n);
  }
  const max = Math.max(0, ...sizes);
  const out = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) if (mask[k] && sizes[lab[k]] >= max * minFrac) out[k] = 1;
  return { mask: out, islands: sizes.filter((s) => s >= max * minFrac).length };
}
