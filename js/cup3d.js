// ميدالية كوب قهوة ثلاثية الأبعاد كاملة (مجسم دوراني): غطاء + كوب + كم + نقش + حلقة تعليق
// كل جزء جسم مغلق مستقل بلونه — مناسب لـ 3MF متعدد الألوان
import { maskedSlab, mergeTris } from './mesh.js';
import { drawText } from './keychain.js';

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
const orient = (t) => { if (signedVol(t) < 0) flip(t); return t; };

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
function decoField(P, Wd, Hd, px, side) {
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
