// تحويل الصور إلى مجسمات: ليثوفين (مسطح/دائري/قلب/منحني)، نقش بارز، نقش وجه، قالب كوكيز
import { smoothSlab, maskedSlab, bendCylinder, dilate, boxBlur, keepLargest, mergeTris } from './mesh.js';
import { fieldToSolid } from './contour.js';

const iw = (img) => img.naturalWidth || img.width;
const ih = (img) => img.naturalHeight || img.height;

/** إزالة الخلفية تلقائياً (للخلفيات السادة): تعبئة من الحواف بالألوان القريبة من لون الإطار */
export function removeBackground(img, tol = 42) {
  const s = Math.min(1, 1000 / Math.max(iw(img), ih(img)));
  const c = document.createElement('canvas'); c.width = Math.round(iw(img) * s); c.height = Math.round(ih(img) * s);
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, c.width, c.height);
  const W = c.width, H = c.height, im = x.getImageData(0, 0, W, H), d = im.data;
  // لون الخلفية = وسيط ألوان الإطار
  const border = [];
  for (let i = 0; i < W; i += 2) border.push(i, (H - 1) * W + i);
  for (let j = 0; j < H; j += 2) border.push(j * W, j * W + W - 1);
  const med = [0, 1, 2].map((ch) => { const v = border.map((k) => d[k * 4 + ch]).sort((a, b) => a - b); return v[v.length >> 1]; });
  const dist = (k) => Math.hypot(d[k * 4] - med[0], d[k * 4 + 1] - med[1], d[k * 4 + 2] - med[2]);
  const bg = new Uint8Array(W * H), st = [];
  for (const k of border) if (d[k * 4 + 3] < 30 || dist(k) < tol) st.push(k);
  while (st.length) {
    const k = st.pop(); if (bg[k]) continue;
    if (d[k * 4 + 3] >= 30 && dist(k) >= tol) continue;
    bg[k] = 1;
    const i = k % W, j = (k / W) | 0;
    if (i > 0) st.push(k - 1); if (i < W - 1) st.push(k + 1); if (j > 0) st.push(k - W); if (j < H - 1) st.push(k + W);
  }
  let removed = 0;
  for (let k = 0; k < W * H; k++) if (bg[k]) { d[k * 4 + 3] = 0; removed++; }
  x.putImageData(im, 0, 0);
  c.removedFrac = removed / (W * H);
  return c;
}

export function grayscale(img, gw, gh) {
  const c = document.createElement('canvas'); c.width = gw; c.height = gh;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, gw, gh);
  const d = ctx.getImageData(0, 0, gw, gh).data;
  const g = new Float32Array(gw * gh), a = new Float32Array(gw * gh);
  let transparent = 0;
  for (let k = 0; k < gw * gh; k++) {
    const al = d[k * 4 + 3] / 255;
    // نركّب على خلفية بيضاء
    g[k] = ((0.299 * d[k * 4] + 0.587 * d[k * 4 + 1] + 0.114 * d[k * 4 + 2]) / 255) * al + (1 - al);
    a[k] = al; if (al < 0.5) transparent++;
  }
  return { g, a, hasAlpha: transparent > gw * gh * 0.02 };
}

function adjust(g, contrast, invert) {
  const out = new Float32Array(g.length);
  for (let k = 0; k < g.length; k++) {
    const v = Math.min(1, Math.max(0, (g[k] - 0.5) * contrast + 0.5));
    out[k] = invert ? 1 - v : v;
  }
  return out;
}

export function dims(img, widthMm, res) {
  const gw = Math.max(8, Math.round(widthMm / res) + 1);
  const gh = Math.max(8, Math.round(gw * ih(img) / iw(img)));
  return { gw, gh };
}

/** قناع رؤوس الشبكة حسب الشكل المختار (null = مستطيل كامل) */
function shapeMaskV(shape, gw, gh) {
  if (shape === 'rect' || shape === 'curved') return null;
  const m = new Uint8Array(gw * gh);
  const cx = (gw - 1) / 2, cy = (gh - 1) / 2, R = Math.min(gw, gh) / 2 - 1;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    let on;
    if (shape === 'circle') on = (i - cx) ** 2 + (j - cy) ** 2 <= R * R;
    else { // قلب
      const x = (i - cx) / R * 1.15, y = -(j - cy) / R * 1.15 + 0.15;
      on = (x * x + y * y - 1) ** 3 - x * x * y * y * y <= 0;
    }
    m[j * gw + i] = on ? 1 : 0;
  }
  return m;
}

/** يطبق الإطار والشكل ويبني المجسم */
function slab(z, gw, gh, P, frameZ) {
  const mask = shapeMaskV(P.shape, gw, gh);
  const fr = Math.round(P.frame / P.res);
  if (fr > 0) {
    let band;
    if (mask) {
      const out = new Uint8Array(gw * gh); for (let k = 0; k < out.length; k++) out[k] = mask[k] ? 0 : 1;
      band = dilate(out, gw, gh, fr);
    }
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const k = j * gw + i;
      const edge = i < fr || j < fr || i >= gw - fr || j >= gh - fr;
      if (mask ? band[k] : edge) z[k] = frameZ;
    }
  }
  if (P.shape === 'curved') return bendCylinder(maskedSlab(z, new Uint8Array(gw * gh).fill(1), gw, gh, P.res), (gw - 1) * P.res, P.curve);
  if (mask) return maskedSlab(z, mask, gw, gh, P.res);
  return smoothSlab(z, gw, gh, P.res);
}

/** ليثوفين: الداكن أسمك والفاتح أرق — يظهر بالصورة مع ضوء خلفي */
export function lithophane(img, P) {
  const { gw, gh } = dims(img, P.width, P.res);
  let { g } = grayscale(img, gw, gh);
  g = boxBlur(adjust(g, P.contrast, P.invert), gw, gh, P.smooth);
  const z = new Float32Array(gw * gh);
  for (let k = 0; k < gw * gh; k++) z[k] = P.minT + (1 - g[k]) * (P.maxT - P.minT);
  return { parts: [{ tris: slab(z, gw, gh, P, P.maxT + 0.6) }], z, gw, gh };
}

/** نقش بارز: الفاتح أعلى فوق قاعدة */
export function relief(img, P) {
  const { gw, gh } = dims(img, P.width, P.res);
  let { g } = grayscale(img, gw, gh);
  g = boxBlur(adjust(g, P.contrast, P.invert), gw, gh, P.smooth);
  const z = new Float32Array(gw * gh);
  for (let k = 0; k < gw * gh; k++) z[k] = P.baseH + g[k] * P.reliefH;
  return { parts: [{ tris: slab(z, gw, gh, P, P.baseH + P.reliefH) }] };
}

/** نقش وجه/بورتريه: يفصل الشخص عن الخلفية ويعطيه حجماً منحنياً + تفاصيل السطوع */
export function faceRelief(img, P) {
  const { gw, gh } = dims(img, P.width, P.res);
  const { g, a, hasAlpha } = grayscale(img, gw, gh);
  const lum = boxBlur(adjust(g, P.contrast, P.invert), gw, gh, Math.max(1, P.smooth));
  let m = new Float32Array(gw * gh);
  for (let k = 0; k < m.length; k++) m[k] = hasAlpha ? a[k] : 1;
  // حجم وسادي: تنعيم متكرر للقناع
  const r = Math.max(2, Math.round(Math.min(gw, gh) * 0.06));
  let pillow = boxBlur(boxBlur(m, gw, gh, r), gw, gh, r);
  const ms = boxBlur(m, gw, gh, 1);
  const z = new Float32Array(gw * gh);
  for (let k = 0; k < z.length; k++) {
    const shape = Math.sqrt(Math.max(0, pillow[k] * m[k]));
    z[k] = P.baseH + ms[k] * P.reliefH * (0.6 * shape + 0.4 * lum[k] * m[k]);
  }
  return { parts: [{ tris: slab(z, gw, gh, P, P.baseH + P.reliefH * 0.5) }] };
}

/** قناع الشكل من الصورة */
export function shapeMask(img, gw, gh, P) {
  const { g, a, hasAlpha } = grayscale(img, gw, gh);
  const m = new Uint8Array(gw * gh);
  for (let k = 0; k < gw * gh; k++) {
    let on = hasAlpha ? a[k] > 0.5 : g[k] * 255 < P.threshold;
    if (P.invert) on = !on;
    m[k] = on ? 1 : 0;
  }
  return m;
}

/** قالب كوكيز من حدود الشكل */
export function cookieCutter(img, P) {
  const pad = Math.ceil((P.flange + P.wall + 2) / P.res);
  const inner = dims(img, P.width, P.res);
  const gw = inner.gw + pad * 2, gh = inner.gh + pad * 2;
  const raw = shapeMask(img, inner.gw, inner.gh, P);
  let m = new Uint8Array(gw * gh);
  for (let j = 0; j < inner.gh; j++) for (let i = 0; i < inner.gw; i++) m[(j + pad) * gw + i + pad] = raw[j * inner.gw + i];
  m = keepLargest(m, gw, gh, 0.15).mask;
  const outside = new Uint8Array(gw * gh); const st = [];
  for (let i = 0; i < gw; i++) st.push(i, (gh - 1) * gw + i);
  for (let j = 0; j < gh; j++) st.push(j * gw, j * gw + gw - 1);
  while (st.length) {
    const c = st.pop(); if (outside[c] || m[c]) continue; outside[c] = 1;
    const i = c % gw, j = (c / gw) | 0;
    if (i > 0) st.push(c - 1); if (i < gw - 1) st.push(c + 1); if (j > 0) st.push(c - gw); if (j < gh - 1) st.push(c + gw);
  }
  for (let k = 0; k < gw * gh; k++) if (!outside[k]) m[k] = 1;
  const wall = dilate(m, gw, gh, Math.max(1, Math.round(P.wall / P.res)));
  const flange = dilate(m, gw, gh, Math.round((P.wall + P.flange) / P.res));
  const N = gw * gh, wf = new Float32Array(N), ff = new Float32Array(N);
  for (let k = 0; k < N; k++) { if (m[k]) continue; if (wall[k]) wf[k] = 1; if (flange[k]) ff[k] = 1; }
  const tris = mergeTris([
    fieldToSolid(boxBlur(wf, gw, gh, 1), gw, gh, P.res, 0, P.height),
    fieldToSolid(boxBlur(ff, gw, gh, 1), gw, gh, P.res, 0, P.flangeH),
  ]);
  return { parts: [{ tris }] };
}
