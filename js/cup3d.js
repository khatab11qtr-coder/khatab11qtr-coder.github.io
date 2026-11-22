// ميدالية كوب قهوة ثلاثية الأبعاد كاملة (مجسم دوراني): غطاء + كوب + كم + نقش + حلقة تعليق
// كل جزء جسم مغلق مستقل بلونه — مناسب لـ 3MF متعدد الألوان
import { maskedSlab, mergeTris, boxBlur } from './mesh.js';
import { drawText } from './keychain.js';
import { fieldToSolid } from './contour.js';

function signedVol(t) {
  let v = 0;
  for (let b = 0; b < t.length; b += 9) {
    v += t[b] * (t[b + 4] * t[b + 8] - t[b + 5] * t[b + 7]) - t[b + 1] * (t[b + 3] * t[b + 8] - t[b + 5] * t[b + 6]) + t[b + 2] * (t[b + 3] * t[b + 7] - t[b + 4] * t[b + 6]);
  }
  return v / 6;
}
function flip(t) {
  for (let b = 0; b < t.length; b += 9) for (let k = 0; k < 3; k++) { const x = t[b + 3 + k]; t[b + 3 + k] = t[b + 6 + k]; t[b + 6 + k] = x; }
}
export const orient = (t) => { if (signedVol(t) < 0) flip(t); return t; };

/** تدوير مقطع (r,z) حول المحور Z. open: يبدأ وينتهي على المحور. loop: حلقة مغلقة لا تلمس المحور */
export function revolve(profile, N, loop = false) {
  const cs = Array.from({ length: N }, (_, k) => [Math.cos((2 * Math.PI * k) / N), Math.sin((2 * Math.PI * k) / N)]);
  const P = (p, k) => { const [c, s] = cs[k % N]; return p[0] === 0 ? [0, 0, p[1]] : [p[0] * c, p[0] * s, p[1]]; };
  const out = [];
  const edges = loop ? profile.length : profile.length - 1;
  for (let i = 0; i < edges; i++) {
    const a = profile[i], b = profile[(i + 1) % profile.length];
    if (a[0] === 0 && b[0] === 0) continue;
    for (let k = 0; k < N; k++) {
      const A = P(a, k), B = P(a, k + 1), C = P(b, k + 1), D = P(b, k);
      if (a[0] === 0) out.push(...A, ...C, ...D);
      else if (b[0] === 0) out.push(...A, ...B, ...C);
      else out.push(...A, ...B, ...C, ...A, ...C, ...D);
    }
  }
  return orient(new Float32Array(out));
}

/** حلقة (طارة) واقفة في مستوى XZ */
export function torus(R, rr, cz, U = 64, V = 24) {
  const pt = (i, j) => {
    const u = (2 * Math.PI * (i % U)) / U, v = (2 * Math.PI * (j % V)) / V;
    const q = R + rr * Math.cos(v);
    return [q * Math.cos(u), rr * Math.sin(v), cz + q * Math.sin(u)];
  };
  const out = [];
  for (let i = 0; i < U; i++) for (let j = 0; j < V; j++) {
    const A = pt(i, j), B = pt(i + 1, j), C = pt(i + 1, j + 1), D = pt(i, j + 1);
    out.push(...A, ...B, ...C, ...A, ...C, ...D);
  }
  return orient(new Float32Array(out));
}

function bean(ctx, cx, cy, rx, ry, rot) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
  // فصل عن الحبة المجاورة
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineWidth = Math.max(0.5, ry * 0.12);
  ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  // الشق
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineWidth = Math.max(0.45, rx * 0.16); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, -ry * 0.82);
  ctx.bezierCurveTo(-rx * 0.55, -ry * 0.3, rx * 0.55, ry * 0.3, 0, ry * 0.82);
  ctx.stroke();
  ctx.restore();
}

/** يرسم محتوى النقش على مستطيل مسطح (مم) ويرجع حقل بكسلات */
export function decoField(P, Wd, Hd, px, side) {
  const w = Math.ceil(Wd / px) + 1, h = Math.ceil(Hd / px) + 1;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.scale(1 / px, 1 / px); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
  const content = side === 'front' ? P.content : P.backContent;
  const text1 = side === 'front' ? P.text1 : P.backText;
  const text2 = side === 'front' ? P.text2 : '';
  if (content === 'beans') {
    const ry = Hd * 0.36, rx = ry * 0.66;
    bean(ctx, Wd / 2 - rx * 0.95, Hd / 2 - ry * 0.12, rx, ry, -0.55);
    bean(ctx, Wd / 2 + rx * 0.95, Hd / 2 + ry * 0.12, rx, ry, -0.55);
  } else if (content === 'text') {
    if (text2) {
      drawText(ctx, text1, P.font, Wd / 2, Hd * 0.4, Wd * 0.96, Hd * 0.5);
      drawText(ctx, text2, P.font, Wd / 2, Hd * 0.82, Wd * 0.9, Hd * 0.2, 700);
    } else drawText(ctx, text1, P.font, Wd / 2, Hd / 2, Wd * 0.96, Hd * 0.62);
  } else if (content === 'logo' && P.logoStencil) {
    const st = P.logoStencil, s = Math.min((Wd * 0.92) / st.width, (Hd * 0.86) / st.height);
    ctx.drawImage(st, (Wd - st.width * s) / 2, (Hd - st.height * s) / 2, st.width * s, st.height * s);
  } else if (content === 'beans_text') {
    const ry = Hd * 0.22, rx = ry * 0.66;
    bean(ctx, Wd / 2 - rx * 0.95, Hd * 0.27, rx, ry, -0.55);
    bean(ctx, Wd / 2 + rx * 0.95, Hd * 0.33, rx, ry, -0.55);
    drawText(ctx, text1, P.font, Wd / 2, Hd * 0.76, Wd * 0.96, Hd * 0.36);
  }
  const d = ctx.getImageData(0, 0, w, h).data;
  const mask = new Uint8Array(w * h);
  let any = 0;
  for (let k = 0; k < w * h; k++) if (d[k * 4 + 3] >= 128) { mask[k] = 1; any++; }
  return { mask, w, h, any };
}

/**
 * يبني كل أجزاء الكوب. P.height = ارتفاع الكوب مع الغطاء (بدون الحلقة)
 * يرجع { parts: [{key,name,tris}], info }
 */
export function buildCup(P) {
  const H = P.height, N = P.segments || 128;
  const Hb = H * 0.78;                 // ارتفاع جسم الكوب
  const rt = H * 0.28, rb = H * 0.225; // نصف القطر أعلى/أسفل
  const rAt = (z) => rb + ((rt - rb) * z) / Hb;
  const parts = [];

  // جسم الكوب (قاعدة مشطوفة قليلاً)
  const ch = Math.min(0.6, H * 0.015);
  parts.push({ key: 'cup', name: 'الكوب', tris: revolve([[0, 0], [rb - ch, 0], [rAt(ch), ch], [rt, Hb], [0, Hb]], N) });

  // الغطاء: حافة بشطفة 45° (بدون دعامات) + جزء علوي + تجويف
  const e = H * 0.05;
  const lid = [
    [0, Hb], [rt, Hb], [rt + e, Hb + e], [rt + e, Hb + H * 0.09],
    [rt + e - H * 0.012, Hb + H * 0.103], [rt * 0.9, Hb + H * 0.11],
    [rt * 0.84, Hb + H * 0.205], [rt * 0.8, Hb + H * 0.215], [rt * 0.64, Hb + H * 0.215],
    [rt * 0.6, Hb + H * 0.195], [0, Hb + H * 0.195],
  ];
  parts.push({ key: 'lid', name: 'الغطاء', tris: revolve(lid, N) });
  const zTop = Hb + H * 0.195;

  // الكم
  const z1 = H * 0.2, z2 = H * 0.56, t = P.sleeve ? Math.max(0.8, H * 0.028) : 0;
  if (P.sleeve) {
    const sl = [[rAt(z1), z1], [rAt(z1 + t) + t, z1 + t], [rAt(z2) + t, z2], [rAt(z2), z2]];
    parts.push({ key: 'sleeve', name: 'الكم', tris: revolve(sl, N, true) });
  }

  // النقش على الكم (أمام وخلف)
  const depth = Math.max(0.6, H * 0.02), embed = 0.15;
  const zb = z1 + t + H * 0.02, zt = z2 - H * 0.025;
  const Hd = zt - zb;
  const Rref = rAt((zb + zt) / 2) + t;
  const Wd = Rref * (P.content === 'text' || P.content === 'beans_text' ? 1.65 : 1.5);
  const px = Math.max(0.08, H / 450);
  const decos = [];
  for (const [side, th0] of [['front', 0], ['back', Math.PI]]) {
    if (side === 'back' && (P.backContent === 'none' || (P.backContent === 'text' && !P.backText))) continue;
    if (side === 'front' && P.content === 'none') continue;
    const F = decoField(P, side === 'back' ? Rref * 1.65 : Wd, Hd, px, side);
    if (!F.any) continue;
    const z = new Float32Array(F.w * F.h).fill(depth);
    const flat = maskedSlab(z, F.mask, F.w, F.h, px);
    const W0 = ((F.w - 1) * px) / 2;
    for (let k = 0; k < flat.length; k += 3) {
      const s = flat[k] - W0, zz = zb + flat[k + 1], dz = flat[k + 2];
      const th = s / Rref + th0;
      const r = rAt(zz) + t - embed + (dz * (depth + embed)) / depth;
      flat[k] = Math.sin(th) * r; flat[k + 1] = -Math.cos(th) * r; flat[k + 2] = zz;
    }
    decos.push(flat);
  }
  if (decos.length) parts.push({ key: 'deco', name: 'النقش', tris: mergeTris(decos) });

  // حلقة التعليق
  if (P.loop) {
    const hole = Math.max(4, P.hole || 4.5);
    const rr = Math.max(1.3, H * 0.04), R = hole / 2 + rr;
    parts.push({ key: 'loop', name: 'الحلقة', tris: torus(R, rr, zTop - 1.2 + R + rr - rr, 72, 24) });
  }
  return { parts, info: { Hb, rt, rb, zTop, colorZ: Hb } };
}

/* =====================================================================
 * مجسمات 3D إضافية: كوب آيس، مج، فنجان، دلة، حروف واقفة، حامل جوال، حامل بطاقات
 * ===================================================================== */

/** حلقة طارة في مستوى محدد: 'xz' (تواجه الأمام) أو 'yz' (تواجه الجانب) */
function torusAt(R, rr, c, plane = 'xz', U = 64, V = 20) {
  const pt = (i, j) => {
    const u = (2 * Math.PI * (i % U)) / U, v = (2 * Math.PI * (j % V)) / V;
    const q = R + rr * Math.cos(v), a = q * Math.cos(u), b = rr * Math.sin(v), h = q * Math.sin(u);
    return plane === 'xz' ? [c[0] + a, c[1] + b, c[2] + h] : [c[0] + b, c[1] + a, c[2] + h];
  };
  const out = [];
  for (let i = 0; i < U; i++) for (let j = 0; j < V; j++) {
    const A = pt(i, j), B = pt(i + 1, j), C = pt(i + 1, j + 1), D = pt(i, j + 1);
    out.push(...A, ...B, ...C, ...A, ...C, ...D);
  }
  return orient(new Float32Array(out));
}

/** أنبوب على مسار (بنصف قطر متغير) بأغطية مغلقة */
function tube(path, radii, M = 20) {
  const n = path.length, rings = [];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };
  let prevN = null;
  for (let i = 0; i < n; i++) {
    const t = norm(sub(path[Math.min(n - 1, i + 1)], path[Math.max(0, i - 1)]));
    let nn = prevN ? norm(cross(cross(t, prevN), t)) : norm(cross(t, Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
    if (!isFinite(nn[0])) nn = [1, 0, 0];
    prevN = nn;
    const bb = cross(t, nn), r = radii[i], ring = [];
    for (let k = 0; k < M; k++) {
      const a = (2 * Math.PI * k) / M, c = Math.cos(a) * r, s = Math.sin(a) * r;
      ring.push([path[i][0] + nn[0] * c + bb[0] * s, path[i][1] + nn[1] * c + bb[1] * s, path[i][2] + nn[2] * c + bb[2] * s]);
    }
    rings.push(ring);
  }
  const out = [];
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < M; k++) {
    const A = rings[i][k], B = rings[i][(k + 1) % M], C = rings[i + 1][(k + 1) % M], D = rings[i + 1][k];
    out.push(...A, ...B, ...C, ...A, ...C, ...D);
  }
  for (const [ri, dir] of [[0, -1], [n - 1, 1]]) {
    const c = path[ri];
    for (let k = 0; k < M; k++) {
      const A = rings[ri][k], B = rings[ri][(k + 1) % M];
      if (dir < 0) out.push(...c, ...B, ...A); else out.push(...c, ...A, ...B);
    }
  }
  return orient(new Float32Array(out));
}
const bez = (p0, p1, p2, p3, n) => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, u = 1 - t;
  return [0, 1, 2].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]);
});

export function box(x0, y0, z0, x1, y1, z1) {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return orient(new Float32Array(f.flatMap((t) => t.flatMap((i) => v[i]))));
}

/** نقش ملفوف على سطح دوراني: rOf(z) نصف القطر عند الارتفاع z */
function wrapDeco(P, { zb, zt, rOf, wF = 1.55, H }) {
  const depth = Math.max(0.6, H * 0.02), embed = 0.15, Hd = zt - zb;
  const Rref = rOf((zb + zt) / 2), px = Math.max(0.08, H / 450), decos = [];
  for (const [side, th0] of [['front', 0], ['back', Math.PI]]) {
    if (side === 'back' && (P.backContent === 'none' || !P.backContent || (P.backContent === 'text' && !P.backText))) continue;
    if (side === 'front' && P.content === 'none') continue;
    const Wd = Rref * (side === 'back' || ['text', 'beans_text'].includes(P.content) ? wF + 0.15 : wF);
    const F = decoField(P, Wd, Hd, px, side);
    if (!F.any) continue;
    const flat = maskedSlab(new Float32Array(F.w * F.h).fill(depth), F.mask, F.w, F.h, px);
    const W0 = ((F.w - 1) * px) / 2;
    for (let k = 0; k < flat.length; k += 3) {
      const s = flat[k] - W0, zz = zb + flat[k + 1], dz = flat[k + 2];
      const th = s / Rref + th0, r = rOf(zz) - embed + (dz * (depth + embed)) / depth;
      flat[k] = Math.sin(th) * r; flat[k + 1] = -Math.cos(th) * r; flat[k + 2] = zz;
    }
    decos.push(flat);
  }
  return decos.length ? mergeTris(decos) : null;
}

/** نقش على وجه مسطح يواجه الأمام (-Y) عند y = yFace */
function planeDeco(P, { Wd, Hd, cx, zb, yFace, H }) {
  if (P.content === 'none') return null;
  const depth = Math.max(0.8, H * 0.012), embed = 0.15, px = Math.max(0.08, Math.max(Wd, Hd) / 600);
  const F = decoField(P, Wd, Hd, px, 'front');
  if (!F.any) return null;
  const flat = maskedSlab(new Float32Array(F.w * F.h).fill(depth), F.mask, F.w, F.h, px);
  const W0 = ((F.w - 1) * px) / 2;
  for (let k = 0; k < flat.length; k += 3) {
    const x = flat[k] - W0, z = flat[k + 1], d = flat[k + 2];
    flat[k] = cx + x; flat[k + 1] = yFace + embed - (d * (depth + embed)) / depth; flat[k + 2] = zb + z;
  }
  return orient(flat);
}

/** مقطع جانبي مرسوم على Canvas يُبثق بعرض محدد: draw(ctx) بإحداثيات (عمق Y, ارتفاع Z للأعلى) */
function extrudeProfile(Dmm, Hmm, width, draw, px = 0.25) {
  const m = 2, w = Math.ceil((Dmm + m * 2) / px), h = Math.ceil((Hmm + m * 2) / px);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.setTransform(1 / px, 0, 0, -1 / px, m / px, h - m / px); // Z للأعلى
  x.fillStyle = '#fff'; draw(x);
  const d = x.getImageData(0, 0, w, h).data, f = new Float32Array(w * h);
  for (let k = 0; k < w * h; k++) f[k] = d[k * 4 + 3] / 255;
  const t = fieldToSolid(f, w, h, px, 0, width);
  // (عمق, ارتفاع, بثق) → (X=بثق−العرض/2, Y=عمق, Z=ارتفاع)
  for (let k = 0; k < t.length; k += 3) {
    const a = t[k] - m, b = t[k + 1] - m, e = t[k + 2];
    t[k] = e - width / 2; t[k + 1] = a; t[k + 2] = b;
  }
  return orient(t);
}

/** حقل نص بحروف متصلة: يوصل النقاط والحروف المنفصلة بأعمدة رفيعة للأسفل */
function lettersField(P, Hmm, px) {
  const font = P.font || 'Cairo';
  const meas = document.createElement('canvas').getContext('2d');
  meas.font = `900 100px "${font}"`;
  const tw = Math.max(10, meas.measureText(P.text1 || 'A').width);
  const Wmm = (Hmm * 1.6 * tw) / 100 + Hmm * 0.4;
  const w = Math.ceil(Wmm / px), h = Math.ceil((Hmm * 1.7) / px);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.scale(1 / px, 1 / px); x.fillStyle = '#fff';
  drawText(x, P.text1 || 'A', font, Wmm / 2, Hmm * 0.85, Wmm, Hmm, 900);
  const d = x.getImageData(0, 0, w, h).data;
  let m = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) m[k] = d[k * 4 + 3] > 127 ? 1 : 0;
  // أسفل نقطة في النص
  let bottom = -1, x0 = w, x1 = 0;
  for (let k = 0; k < w * h; k++) if (m[k]) { const j = (k / w) | 0, i = k % w; bottom = Math.max(bottom, j); x0 = Math.min(x0, i); x1 = Math.max(x1, i); }
  if (bottom < 0) return null;
  const strut = Math.max(2, Math.round(Math.max(0.9, Hmm * 0.035) / px));
  if (P.bridge !== false) {
    // مكونات متصلة
    for (let iter = 0; iter < 40; iter++) {
      const lab = new Int32Array(w * h).fill(-1); const comps = [];
      for (let k = 0; k < w * h; k++) {
        if (!m[k] || lab[k] >= 0) continue;
        const id = comps.length, st = [k]; lab[k] = id; let lo = -1, loX = 0, grounded = false;
        while (st.length) {
          const q = st.pop(), i = q % w, j = (q / w) | 0;
          if (j > lo) { lo = j; loX = i; }
          if (j >= bottom - 1) grounded = true;
          for (const nb of [i > 0 ? q - 1 : -1, i < w - 1 ? q + 1 : -1, j > 0 ? q - w : -1, j < h - 1 ? q + w : -1]) if (nb >= 0 && m[nb] && lab[nb] < 0) { lab[nb] = id; st.push(nb); }
        }
        comps.push({ lo, loX, grounded, id });
      }
      const floating = comps.filter((cc) => !cc.grounded);
      if (!floating.length) break;
      for (const cc of floating) {
        // عمود من أسفل المكوّن للأسفل حتى يلمس جزءاً آخر أو القاعدة
        let j = cc.lo + 1;
        const hit = (jj) => { for (let di = -strut; di <= strut; di++) { const i = cc.loX + di; if (i >= 0 && i < w && m[jj * w + i] && lab[jj * w + i] !== cc.id) return true; } return false; };
        while (j <= bottom && !hit(j)) j++;
        for (let jj = cc.lo - 1; jj <= Math.min(j, bottom); jj++) for (let di = -(strut >> 1); di <= strut >> 1; di++) { const i = cc.loX + di; if (i >= 0 && i < w) m[jj * w + i] = 1; }
      }
    }
  }
  // شريط سفلي يربط كل الحروف
  const band = Math.max(2, Math.round((Hmm * 0.06) / px));
  for (let j = bottom - band; j <= bottom; j++) for (let i = x0; i <= x1; i++) m[j * w + i] = 1;
  const f = new Float32Array(w * h); for (let k = 0; k < w * h; k++) f[k] = m[k];
  return { f: boxBlur(f, w, h, 1), w, h, bottomMm: (h - bottom - 1) * px, x0mm: x0 * px, x1mm: x1 * px };
}

export const MODELS = {
  takeaway: {
    label: 'كوب تيك أواي', icon: '🥤', def: 40, min: 25, max: 90, deco: true, back: true,
    parts: [['lid', 'الغطاء', '#3a2a22'], ['cup', 'الكوب', '#f1e6cf'], ['sleeve', 'الكم', '#8a5a36'], ['deco', 'النقش', '#6b4226'], ['loop', 'الحلقة', '#d4a017']],
    build: (P) => buildCup({ ...P, height: P.size, sleeve: P.sleeve !== false, loop: P.loop !== false }).parts,
  },
  iced: {
    label: 'كوب آيس', icon: '🧋', def: 45, min: 25, max: 90, deco: true, back: true,
    parts: [['lid', 'الغطاء', '#f4f1ea'], ['cup', 'المشروب', '#a87b56'], ['straw', 'الشفاطة', '#1f6b45'], ['deco', 'النقش', '#ffffff'], ['loop', 'الحلقة', '#d4a017']],
    build(P) {
      const H = P.size, N = P.segments || 128, Hb = H * 0.74, rt = H * 0.25, rb = H * 0.18;
      const rAt = (z) => rb + ((rt - rb) * z) / Hb, ch = Math.min(0.6, H * 0.015), parts = [];
      parts.push({ key: 'cup', tris: revolve([[0, 0], [rb - ch, 0], [rAt(ch), ch], [rt, Hb], [0, Hb]], N) });
      const e = H * 0.035, dome = [];
      for (let i = 0; i <= 10; i++) { const a = (i / 10) * (Math.PI / 2); dome.push([rt * Math.cos(a), Hb + H * 0.04 + H * 0.17 * Math.sin(a)]); }
      dome[dome.length - 1][0] = 0;
      parts.push({ key: 'lid', tris: revolve([[0, Hb], [rt, Hb], [rt + e, Hb + e], [rt + e, Hb + H * 0.04], ...dome], N) });
      const sr = Math.max(1.6, H * 0.045), sTop = Hb + H * 0.4;
      parts.push({ key: 'straw', tris: revolve([[0, Hb - 1], [sr, Hb - 1], [sr, sTop], [0, sTop]], 48) });
      const d = wrapDeco(P, { zb: H * 0.14, zt: H * 0.6, rOf: rAt, H });
      if (d) parts.push({ key: 'deco', tris: d });
      if (P.loop !== false) { const rr = Math.max(1.3, H * 0.035), R = Math.max(4, P.hole || 4.5) / 2 + rr; parts.push({ key: 'loop', tris: torusAt(R, rr, [0, 0, sTop - 1 + R], 'xz', 56, 20) }); }
      return parts;
    },
  },
  mug: {
    label: 'مج بمقبض', icon: '☕', def: 36, min: 22, max: 80, deco: true, back: false,
    parts: [['cup', 'المج', '#ffffff'], ['coffee', 'القهوة', '#5a3a22'], ['handle', 'المقبض', '#ffffff'], ['deco', 'النقش', '#3b2a20']],
    build(P) {
      const H = P.size, N = P.segments || 128, r = H * 0.38, Hb = H, t = Math.max(1.2, H * 0.04), ch = Math.min(0.8, H * 0.02), parts = [];
      parts.push({ key: 'cup', tris: revolve([[0, 0], [r - ch, 0], [r, ch], [r, Hb], [r - t, Hb], [r - t, Hb - H * 0.06], [0, Hb - H * 0.06]], N) });
      parts.push({ key: 'coffee', tris: revolve([[0, Hb - H * 0.06], [r - t, Hb - H * 0.06], [r - t, Hb - H * 0.025], [0, Hb - H * 0.025]], N) });
      const Rh = H * 0.27, rr = Math.max(1.6, H * 0.075);
      parts.push({ key: 'handle', tris: torusAt(Rh, rr, [r + Rh - rr * 1.2, 0, Hb * 0.5], 'xz', 64, 22) });
      const d = wrapDeco(P, { zb: H * 0.18, zt: H * 0.8, rOf: () => r, wF: 1.45, H });
      if (d) parts.push({ key: 'deco', tris: d });
      return parts;
    },
  },
  finjan: {
    label: 'فنجان عربي', icon: '🍵', def: 32, min: 20, max: 70, deco: true, back: false,
    parts: [['cup', 'الفنجان', '#fbf7ef'], ['coffee', 'القهوة', '#c9a227'], ['band', 'الحزام', '#c9a227'], ['saucer', 'الصحن', '#fbf7ef'], ['deco', 'النقش', '#1e4d3a'], ['loop', 'الحلقة', '#c9a227']],
    build(P) {
      const H = P.size, N = P.segments || 128, parts = [];
      parts.push({ key: 'saucer', tris: revolve([[0, 0], [H * 0.58, 0], [H * 0.64, H * 0.07], [H * 0.52, H * 0.085], [0, H * 0.065]], N) });
      const z0 = H * 0.06, zr = H * 0.78, rr0 = H * 0.24, rim = H * 0.5;
      const rOf = (z) => rr0 + (rim - rr0) * Math.pow(Math.max(0, (z - z0 - H * 0.04) / (zr - z0 - H * 0.04)), 0.6);
      const prof = [[0, z0], [H * 0.22, z0], [rr0, z0 + H * 0.04]];
      for (let i = 1; i <= 12; i++) { const z = z0 + H * 0.04 + ((zr - z0 - H * 0.04) * i) / 12; prof.push([rOf(z), z]); }
      const wall = Math.max(1.2, H * 0.04);
      prof.push([rim - wall, zr], [rim - wall, zr - H * 0.07], [0, zr - H * 0.07]);
      parts.push({ key: 'cup', tris: revolve(prof, N) });
      parts.push({ key: 'coffee', tris: revolve([[0, zr - H * 0.07], [rim - wall, zr - H * 0.07], [rim - wall, zr - H * 0.03], [0, zr - H * 0.03]], N) });
      const b1 = zr - H * 0.14, b2 = zr - H * 0.08, bt = Math.max(0.6, H * 0.018);
      parts.push({ key: 'band', tris: revolve([[rOf(b1), b1], [rOf(b1) + bt, b1 + bt], [rOf(b2) + bt, b2], [rOf(b2), b2]], N, true) });
      const d = wrapDeco(P, { zb: z0 + H * 0.14, zt: b1 - H * 0.04, rOf, wF: 1.3, H });
      if (d) parts.push({ key: 'deco', tris: d });
      if (P.loop !== false) { const rr = Math.max(1.2, H * 0.04), R = Math.max(4, P.hole || 4.5) / 2 + rr; parts.push({ key: 'loop', tris: torusAt(R, rr, [0, rim - wall / 2, zr - 1 + R], 'yz', 56, 20) }); }
      return parts;
    },
  },
  dallah: {
    label: 'دلة 3D', icon: '🫖', def: 50, min: 30, max: 100, deco: true, back: false,
    parts: [['cup', 'الجسم', '#c9a227'], ['lid', 'الغطاء', '#b8901e'], ['handle', 'المقبض والمصب', '#b8901e'], ['deco', 'النقش', '#5a3a22'], ['loop', 'الحلقة', '#c9a227']],
    build(P) {
      const H = P.size, N = P.segments || 128, parts = [];
      const body = [[0, 0], [0.22, 0], [0.23, 0.03], [0.2, 0.055], [0.26, 0.12], [0.295, 0.2], [0.29, 0.27], [0.25, 0.34], [0.18, 0.41], [0.13, 0.47], [0.145, 0.54], [0.17, 0.6], [0, 0.6]].map(([a, b]) => [a * H, b * H]);
      const prof = body.slice(0, -1);
      const rOf = (z) => { for (let i = 3; i < prof.length - 1; i++) if (z >= prof[i][1] && z <= prof[i + 1][1]) { const t = (z - prof[i][1]) / (prof[i + 1][1] - prof[i][1]); return prof[i][0] + t * (prof[i + 1][0] - prof[i][0]); } return prof[4][0]; };
      parts.push({ key: 'cup', tris: revolve(body, N) });
      const lid = [[0, 0.6], [0.17, 0.6], [0.19, 0.615], [0.19, 0.64], [0.15, 0.68], [0.09, 0.715], [0.045, 0.735], [0.04, 0.755], [0.06, 0.775], [0.055, 0.8], [0.03, 0.815], [0, 0.82]].map(([a, b]) => [a * H, b * H]);
      parts.push({ key: 'lid', tris: revolve(lid, N) });
      const spout = bez([-0.2 * H, 0, 0.28 * H], [-0.36 * H, 0, 0.36 * H], [-0.42 * H, 0, 0.55 * H], [-0.5 * H, 0, 0.7 * H], 24);
      const sR = spout.map((_, i) => H * (0.065 - 0.03 * (i / 24)));
      const handle = bez([0.13 * H, 0, 0.54 * H], [0.36 * H, 0, 0.6 * H], [0.42 * H, 0, 0.32 * H], [0.24 * H, 0, 0.2 * H], 28);
      parts.push({ key: 'handle', tris: mergeTris([tube(spout, sR, 22), tube(handle, handle.map(() => H * 0.03), 18)]) });
      const d = wrapDeco(P, { zb: 0.12 * H, zt: 0.31 * H, rOf, wF: 1.25, H });
      if (d) parts.push({ key: 'deco', tris: d });
      if (P.loop !== false) { const rr = Math.max(1.2, H * 0.025), R = Math.max(4, P.hole || 4.5) / 2 + rr; parts.push({ key: 'loop', tris: torusAt(R, rr, [0, 0, 0.82 * H - 1 + R], 'xz', 56, 20) }); }
      return parts;
    },
  },
  letters: {
    label: 'حروف واقفة', icon: '🔤', def: 30, min: 12, max: 80, deco: false, letters: true, sizeLabel: 'ارتفاع الحروف',
    parts: [['letters', 'الحروف', '#f2a541'], ['base', 'القاعدة', '#2a1d13']],
    build(P) {
      const H = P.size, px = Math.max(0.1, H / 300), depth = P.depth || Math.max(6, H * 0.3);
      const L = lettersField({ ...P, text1: P.text1 || 'Bean' }, H, px);
      if (!L) return [];
      const baseH = P.base !== false ? Math.max(3, H * 0.15) : 0, lift = baseH ? baseH - 0.4 : 0;
      const t = fieldToSolid(L.f, L.w, L.h, px, 0, depth);
      const cx = (L.x0mm + L.x1mm) / 2;
      for (let k = 0; k < t.length; k += 3) { const a = t[k], b = t[k + 1], e = t[k + 2]; t[k] = a - cx; t[k + 1] = e - depth / 2; t[k + 2] = b - L.bottomMm + lift; }
      const parts = [{ key: 'letters', tris: orient(t) }];
      if (baseH) {
        const half = (L.x1mm - L.x0mm) / 2 + H * 0.25, dd = depth / 2 + Math.max(4, H * 0.2);
        parts.push({ key: 'base', tris: box(-half, -dd, 0, half, dd, baseH) });
      }
      return parts;
    },
  },
  phonestand: {
    label: 'حامل جوال', icon: '📱', def: 70, min: 50, max: 110, deco: true, back: false, sizeLabel: 'العرض',
    parts: [['stand', 'الحامل', '#2a1d13'], ['deco', 'النقش', '#f2a541']],
    build(P) {
      const W = P.size;
      const stand = extrudeProfile(90, 96, W, (x) => {
        x.beginPath(); x.roundRect(0, 0, 88, 6, 2); x.fill();
        x.beginPath(); x.roundRect(2, 0, 9, 18, 2); x.fill();
        x.beginPath(); x.moveTo(24, 0); x.lineTo(34, 0); x.lineTo(78, 92); x.lineTo(70, 95); x.closePath(); x.fill();
        x.beginPath(); x.moveTo(48, 0); x.lineTo(88, 0); x.lineTo(88, 8); x.lineTo(66, 58); x.closePath(); x.fill();
      });
      const parts = [{ key: 'stand', tris: stand }];
      const d = planeDeco(P, { Wd: W * 0.86, Hd: 12, cx: 0, zb: 3, yFace: 2, H: W });
      if (d) parts.push({ key: 'deco', tris: d });
      return parts;
    },
  },
  cardholder: {
    label: 'حامل بطاقات', icon: '💳', def: 100, min: 96, max: 140, deco: true, back: false, sizeLabel: 'العرض',
    parts: [['holder', 'الحامل', '#f1e6cf'], ['deco', 'النقش', '#3b2a20']],
    build(P) {
      const W = P.size, Dp = 34, wall = 3, Hf = 24, Hb = 42, parts = [];
      const prof = extrudeProfile(Dp, Hb, W, (x) => {
        x.beginPath(); x.roundRect(0, 0, Dp, wall, 1); x.fill();
        x.beginPath(); x.roundRect(0, 0, wall, Hf, 1); x.fill();
        x.beginPath(); x.moveTo(Dp - wall - 6, 0); x.lineTo(Dp, 0); x.lineTo(Dp, Hb); x.lineTo(Dp - wall, Hb); x.closePath(); x.fill();
      });
      parts.push({ key: 'holder', tris: mergeTris([prof, box(-W / 2, 0, 0, -W / 2 + wall, Dp, Hf), box(W / 2 - wall, 0, 0, W / 2, Dp, Hf)]) });
      const d = planeDeco(P, { Wd: W * 0.82, Hd: Hf - 8, cx: 0, zb: 4, yFace: 0, H: W });
      if (d) parts.push({ key: 'deco', tris: d });
      return parts;
    },
  },
};

export function buildModel(P) {
  const M = MODELS[P.model] || MODELS.takeaway;
  return M.build(P).filter((p) => p.tris && p.tris.length);
}
