// تحويل الصور إلى مجسمات: ليثوفين، نقش بارز، قالب كوكيز
import { smoothSlab, dilate, boxBlur, keepLargest, mergeTris } from './mesh.js';
import { fieldToSolid } from './contour.js';

/** يقرأ الصورة كمصفوفة سطوع 0..1 بالدقة المطلوبة */
export function grayscale(img, gw, gh) {
  const c = document.createElement('canvas'); c.width = gw; c.height = gh;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, gw, gh);
  ctx.drawImage(img, 0, 0, gw, gh);
  const d = ctx.getImageData(0, 0, gw, gh).data;
  const g = new Float32Array(gw * gh), a = new Uint8Array(gw * gh);
  for (let k = 0; k < gw * gh; k++) {
    g[k] = (0.299 * d[k * 4] + 0.587 * d[k * 4 + 1] + 0.114 * d[k * 4 + 2]) / 255;
  }
  // قناة الشفافية الأصلية
  const c2 = document.createElement('canvas'); c2.width = gw; c2.height = gh;
  const x2 = c2.getContext('2d', { willReadFrequently: true });
  x2.drawImage(img, 0, 0, gw, gh);
  const d2 = x2.getImageData(0, 0, gw, gh).data;
  let transparent = 0;
  for (let k = 0; k < gw * gh; k++) { a[k] = d2[k * 4 + 3]; if (a[k] < 128) transparent++; }
  return { g, a, hasAlpha: transparent > gw * gh * 0.02 };
}

function adjust(g, contrast, invert) {
  const out = new Float32Array(g.length);
  for (let k = 0; k < g.length; k++) {
    let v = (g[k] - 0.5) * contrast + 0.5;
    v = Math.min(1, Math.max(0, v));
    out[k] = invert ? 1 - v : v;
  }
  return out;
}

export function dims(img, widthMm, res) {
  const gw = Math.max(8, Math.round(widthMm / res) + 1);
  const gh = Math.max(8, Math.round(gw * img.naturalHeight / img.naturalWidth));
  return { gw, gh };
}

/** ليثوفين: الداكن أسمك، الفاتح أرق — يضيء بالصورة عند وضع ضوء خلفه */
export function lithophane(img, P) {
  const { gw, gh } = dims(img, P.width, P.res);
  let { g } = grayscale(img, gw, gh);
  g = boxBlur(adjust(g, P.contrast, P.invert), gw, gh, P.smooth);
  const z = new Float32Array(gw * gh);
  const fr = Math.round(P.frame / P.res);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const k = j * gw + i;
    const inFrame = i < fr || j < fr || i >= gw - fr || j >= gh - fr;
    z[k] = inFrame ? P.maxT + 0.6 : P.minT + (1 - g[k]) * (P.maxT - P.minT);
  }
  return { parts: [{ tris: smoothSlab(z, gw, gh, P.res) }], info: `${gw}×${gh} نقطة` };
}

/** نقش بارز: الفاتح أعلى (أو العكس) فوق قاعدة */
export function relief(img, P) {
  const { gw, gh } = dims(img, P.width, P.res);
  let { g } = grayscale(img, gw, gh);
  g = boxBlur(adjust(g, P.contrast, P.invert), gw, gh, P.smooth);
  const z = new Float32Array(gw * gh);
  for (let k = 0; k < gw * gh; k++) z[k] = P.baseH + g[k] * P.reliefH;
  return { parts: [{ tris: smoothSlab(z, gw, gh, P.res) }], info: `${gw}×${gh} نقطة` };
}

/** قناع الشكل من الصورة (يستخدم الشفافية إن وجدت، وإلا عتبة السطوع) */
export function shapeMask(img, gw, gh, P) {
  const { g, a, hasAlpha } = grayscale(img, gw, gh);
  const m = new Uint8Array(gw * gh);
  for (let k = 0; k < gw * gh; k++) {
    let on = hasAlpha ? a[k] > 127 : g[k] * 255 < P.threshold;
    if (P.invert) on = !on;
    m[k] = on ? 1 : 0;
  }
  return m;
}

/** قالب كوكيز / قاطع عجين من حدود الشكل */
export function cookieCutter(img, P) {
  const pad = Math.ceil((P.flange + P.wall + 2) / P.res);
  const inner = dims(img, P.width, P.res);
  const gw = inner.gw + pad * 2, gh = inner.gh + pad * 2;
  const raw = shapeMask(img, inner.gw, inner.gh, P);
  let m = new Uint8Array(gw * gh);
  for (let j = 0; j < inner.gh; j++) for (let i = 0; i < inner.gw; i++) m[(j + pad) * gw + i + pad] = raw[j * inner.gw + i];
  m = keepLargest(m, gw, gh, 0.15).mask;
  // سد الفجوات الداخلية: نملأ كل ما لا يصل للحافة الخارجية
  const outside = new Uint8Array(gw * gh); const st = [];
  for (let i = 0; i < gw; i++) { st.push(i, (gh - 1) * gw + i); }
  for (let j = 0; j < gh; j++) { st.push(j * gw, j * gw + gw - 1); }
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
  return { parts: [{ tris }], info: `${gw}×${gh} نقطة` };
}
