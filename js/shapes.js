// مجسمات من أبعاد المستخدم: صندوق، أسطوانة، سداسي، قلب، نجمة، هرم، مخروط، كرة، نصف كرة
// + تجويف وغطاء + نقش (صورة بارزة / كتابة / شعار) + حلقة تعليق. كل جزء جسم مغلق بلونه.
import { maskedSlab, mergeTris, boxBlur, dilate } from './mesh.js';
import { fieldToSolid } from './contour.js';
import { grayscale } from './photo.js';
import { revolve, torus, box, orient, decoField } from './cup3d.js';
import { plate, mapT } from './plate.js';
import { TOL } from './tol.js';

export const SHAPES = {
  box: { label: 'صندوق', icon: '📦', flat: true, hollow: true },
  cyl: { label: 'أسطوانة', icon: '🥫', flat: true, hollow: true },
  hex: { label: 'سداسي', icon: '⬡', flat: true, hollow: true },
  heart: { label: 'قلب', icon: '❤️', flat: true, hollow: true },
  star: { label: 'نجمة', icon: '⭐', flat: true, hollow: true },
  pyramid: { label: 'هرم', icon: '🔺', flat: false, hollow: false },
  cone: { label: 'مخروط', icon: '🍦', flat: false, hollow: false, noLoop: true },
  sphere: { label: 'كرة', icon: '⚪', flat: false, hollow: false },
  dome: { label: 'نصف كرة', icon: '🌗', flat: false, hollow: false },
};
const FACES = {
  front: ['front'], top: ['top'], front_back: ['front', 'back'],
  sides4: ['front', 'back', 'left', 'right'], all5: ['front', 'back', 'left', 'right', 'top'],
};

/** مسار الشكل في الإحداثيات المتمركزة (Y للأعلى) */
function shapePath(ctx, shape, w, d, corner) {
  ctx.beginPath();
  if (shape === 'box') {
    const r = Math.min(corner, w / 2, d / 2), x = -w / 2, y = -d / 2;
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + d, r); ctx.arcTo(x + w, y + d, x, y + d, r);
    ctx.arcTo(x, y + d, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  } else if (shape === 'cyl') ctx.ellipse(0, 0, w / 2, d / 2, 0, 0, Math.PI * 2);
  else if (shape === 'hex') for (let k = 0; k < 6; k++) { const a = (Math.PI / 3) * k; k ? ctx.lineTo((w / 2) * Math.cos(a), (d / 2) * Math.sin(a)) : ctx.moveTo(w / 2, 0); }
  else if (shape === 'star') for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (Math.PI / 5) * k, r = k % 2 ? 0.45 : 1; const x = (w / 2) * r * Math.cos(a), y = (d / 2) * r * Math.sin(a); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  else if (shape === 'heart') for (let k = 0; k <= 120; k++) {
    const t = (k / 120) * Math.PI * 2, hx = 16 * Math.sin(t) ** 3, hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    const x = (hx / 16) * (w / 2), y = ((hy + 2.5) / 14.5) * (d / 2); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

/** حقل ألفا للبصمة (Footprint) — الصف 0 = الأعلى (Y الأكبر) */
function footprint(shape, w, d, corner, px) {
  const m = 2, cw = Math.ceil((w + m * 2) / px), ch = Math.ceil((d + m * 2) / px);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.setTransform(1 / px, 0, 0, -1 / px, cw / 2, ch / 2); x.fillStyle = '#fff';
  shapePath(x, shape, w, d, corner); x.fill();
  const dd = x.getImageData(0, 0, cw, ch).data, f = new Float32Array(cw * ch);
  for (let k = 0; k < f.length; k++) f[k] = dd[k * 4 + 3] / 255;
  return { f, cw, ch, off: [cw * px / 2, (ch - 1) * px / 2] };
}
/** انكماش القناع بنصف قطر mm (لجدار موحّد السماكة) */
function erode(f, cw, ch, px, mm) {
  const bin = new Uint8Array(f.length); for (let k = 0; k < f.length; k++) bin[k] = f[k] < 0.5 ? 1 : 0;
  const out = dilate(bin, cw, ch, Math.max(1, Math.round(mm / px)));
  const r = new Float32Array(f.length); for (let k = 0; k < f.length; k++) r[k] = out[k] ? 0 : 1;
  return boxBlur(r, cw, ch, 1);
}
const shift = (t, dx, dy, dz = 0) => { for (let k = 0; k < t.length; k += 3) { t[k] -= dx; t[k + 1] -= dy; t[k + 2] += dz; } return t; };
const solid = (F, f, z0, z1) => shift(fieldToSolid(f, F.cw, F.ch, F.px, z0, z1), F.off[0], F.off[1]);

/** مجسمات الدوران: هرم/مخروط/كرة/نصف كرة */
function loft(P) {
  const { shape, w, d, h } = P, R = w / 2, arc = (a0, a1, n, fn) => Array.from({ length: n + 1 }, (_, i) => fn(a0 + ((a1 - a0) * i) / n));
  let t;
  if (shape === 'pyramid') { t = revolve([[0, 0], [R * Math.SQRT2, 0], [0, h]], 4); for (let k = 0; k < t.length; k += 3) { const x = t[k], y = t[k + 1]; t[k] = (x - y) * Math.SQRT1_2; t[k + 1] = (x + y) * Math.SQRT1_2; } }
  else if (shape === 'cone') t = revolve([[0, 0], [R, 0], [0, h]], 128);
  else if (shape === 'dome') t = revolve([[0, 0], [R, 0], ...arc(0.0001, Math.PI / 2, 48, (a) => [R * Math.cos(a), h * Math.sin(a)]).slice(0, -1), [0, h]], 128);
  else { // كرة بقاعدة مسطحة (قطع 20% من الأسفل)
    const s0 = -0.8, z = (a) => ((Math.sin(a) - s0) / (1 - s0)) * h, a0 = Math.asin(s0);
    t = revolve([[0, 0], [R * Math.cos(a0), 0], ...arc(a0, Math.PI / 2, 64, (a) => [R * Math.cos(a), z(a)]).slice(1, -1), [0, h]], 128);
  }
  if (d !== w) for (let k = 1; k < t.length; k += 3) t[k] *= d / w;
  return orient(t);
}

/** حقل النقش لوجه بمقاس Wd×Hd: يرجع { z, mask, w, h, px } (z بالمم فوق السطح) */
function faceField(P, Wd, Hd) {
  const c = P.content, depth = P.depth;
  if (c === 'photo' && P.photo) {
    const ar = (P.photo.naturalWidth || P.photo.width) / (P.photo.naturalHeight || P.photo.height);
    let fw = Wd, fh = Wd / ar; if (fh > Hd) { fh = Hd; fw = Hd * ar; }
    const px = Math.max(0.2, Math.max(fw, fh) / 220), gw = Math.max(8, Math.round(fw / px) + 1), gh = Math.max(8, Math.round(fh / px) + 1);
    const { g, a, hasAlpha } = grayscale(P.photo, gw, gh);
    const z = new Float32Array(gw * gh), mask = new Uint8Array(gw * gh), bl = boxBlur(g, gw, gh, 1);
    for (let k = 0; k < z.length; k++) {
      let v = Math.min(1, Math.max(0, (bl[k] - 0.5) * P.contrast + 0.5)); if (P.invert) v = 1 - v;
      z[k] = 0.35 + v * depth; mask[k] = hasAlpha ? (a[k] > 0.5 ? 1 : 0) : 1;
    }
    return { z, mask, w: gw, h: gh, px };
  }
  const px = Math.max(0.1, Math.max(Wd, Hd) / 420);
  const F = decoField({ content: c === 'photo' ? 'none' : c, text1: P.text1, text2: P.text2, font: P.font, logoStencil: P.logoStencil }, Wd, Hd, px, 'front');
  if (!F.any) return null;
  return { z: new Float32Array(F.w * F.h).fill(0.35 + depth), mask: F.mask, w: F.w, h: F.h, px };
}

/** يضع حقل النقش على وجه. place(lx, ly, t) → [X,Y,Z] */
export function deco(P, Wd, Hd, place) {
  if (Wd < 4 || Hd < 4) return null;
  const F = faceField(P, Wd, Hd); if (!F) return null;
  const flat = maskedSlab(F.z, F.mask, F.w, F.h, F.px), W0 = ((F.w - 1) * F.px) / 2, H0 = ((F.h - 1) * F.px) / 2;
  for (let k = 0; k < flat.length; k += 3) {
    const o = place(flat[k] - W0, flat[k + 1] - H0, flat[k + 2] - 0.2);
    flat[k] = o[0]; flat[k + 1] = o[1]; flat[k + 2] = o[2];
  }
  return orient(flat);
}

export function buildShape(P) {
  const { shape, w, d, h } = P, S = SHAPES[shape], parts = [];
  const hollow = S.hollow && P.hollow, lid = hollow && P.lid, T = P.wall, clr = P.clearance + TOL.lid;
  const px = Math.max(0.18, Math.max(w, d) / 450);
  let body, lidT = null, lipH = 0, lidZ0 = 0, lidX = 0;
  const bodyParts = [];
  if (!S.flat) bodyParts.push(loft(P));
  else if (shape === 'box' && !P.corner && !hollow) bodyParts.push(box(-w / 2, -d / 2, 0, w / 2, d / 2, h));
  else {
    const F = footprint(shape, w, d, P.corner, px); F.px = px;
    if (!hollow) bodyParts.push(solid(F, F.f, 0, h));
    else {
      const inner = erode(F.f, F.cw, F.ch, px, T), ring = new Float32Array(F.f.length);
      for (let k = 0; k < ring.length; k++) ring[k] = Math.max(0, F.f[k] - inner[k]);
      // طرق تثبيت الغطاء (للصندوق والأسطوانة فقط)
      const can = shape === 'box' || shape === 'cyl', fasten = lid && can ? P.fasten || 'friction' : 'friction';
      const lipHh = Math.min(4, h * 0.3), screws = fasten === 'screws', snap = fasten === 'snap' && h >= T + lipHh + 6;
      const scr = P.screw || 3, OD = scr + 4.2, r = OD / 2;
      const posts = [];
      if (screws) {
        if (shape === 'box') { const Ri = Math.max(0, Math.min(P.corner, w / 2, d / 2) - T), a = Math.max(r, Ri); for (const sx of [-1, 1]) for (const sy of [-1, 1]) posts.push([sx * (w / 2 - T - a), sy * (d / 2 - T - a)]); }
        else for (const g of [45, 135, 225, 315]) posts.push([(w / 2 - T - r) * Math.cos((g * Math.PI) / 180), (d / 2 - T - r) * Math.sin((g * Math.PI) / 180)]);
      }
      const carveC = (f, cx0, cy0, rad) => {
        const ci = (cx0 + F.off[0]) / px, cj = F.ch - 1 - (cy0 + F.off[1]) / px, rp = rad / px;
        for (let j = Math.max(0, Math.floor(cj - rp - 1)); j <= Math.min(F.ch - 1, Math.ceil(cj + rp + 1)); j++) for (let i = Math.max(0, Math.floor(ci - rp - 1)); i <= Math.min(F.cw - 1, Math.ceil(ci + rp + 1)); i++) if ((i - ci) ** 2 + (j - cj) ** 2 <= rp * rp) f[j * F.cw + i] = 0;
      };
      const carveR = (f, x0, y0, x1, y1) => {
        const i0 = Math.max(0, Math.floor((x0 + F.off[0]) / px)), i1 = Math.min(F.cw - 1, Math.ceil((x1 + F.off[0]) / px));
        const j0 = Math.max(0, Math.floor(F.ch - 1 - (y1 + F.off[1]) / px)), j1 = Math.min(F.ch - 1, Math.ceil(F.ch - 1 - (y0 + F.off[1]) / px));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) f[j * F.cw + i] = 0;
      };
      bodyParts.push(solid(F, F.f, 0, T));
      if (snap) { // نوافذ بالجدار الأمامي والخلفي ليدخل فيها خطاف الغطاء
        const wz1 = h - lipHh + 2.1, wz0 = wz1 - 2.5 - TOL.hole, mid = ring.slice();
        for (const sg of [-1, 1]) carveR(mid, -5 - TOL.hole / 2, sg < 0 ? -d / 2 - 1 : d / 2 - T - 0.8, 5 + TOL.hole / 2, sg < 0 ? -d / 2 + T + 0.8 : d / 2 + 1);
        bodyParts.push(solid(F, ring, T - 0.02, wz0 + 0.02), solid(F, mid, wz0, wz1 + 0.02), solid(F, ring, wz1, h));
      } else bodyParts.push(solid(F, ring, T - 0.02, h));
      for (const [px0, py0] of posts) bodyParts.push(revolve([[scr * 0.42 + TOL.hole / 2, T - 0.05], [r, T - 0.05], [r, h], [scr * 0.42 + TOL.hole / 2, h]], 40, true).map((v, k) => v + (k % 3 === 0 ? px0 : k % 3 === 1 ? py0 : 0)));
      if (lid) {
        const lip = erode(F.f, F.cw, F.ch, px, T + clr), plateF = F.f.slice(); lipH = lipHh;
        for (const [px0, py0] of posts) { carveC(lip, px0, py0, r + 0.5); carveC(plateF, px0, py0, (scr + 0.5 + TOL.hole) / 2); }
        const lidPlate = 2.4, ox = w / 2 + 8 + w / 2;
        const lidParts = [solid(F, lip, 0, lipH + 0.02), solid(F, plateF, lipH, lipH + lidPlate)];
        if (snap) {
          const hw = 8, yl = d / 2 - T - clr, hook = () => plate(2, 2.2, hw, (x) => { x.beginPath(); x.moveTo(-0.8, 0); x.lineTo(0, 0); x.lineTo(1.2, 2); x.lineTo(-0.8, 2); x.closePath(); x.fill(); }, 0.05);
          lidParts.push(mapT(hook(), (u, v, t) => [t - hw / 2, -yl - u, v]), mapT(hook(), (u, v, t) => [t - hw / 2, yl + u, v]));
        }
        lidT = mergeTris(lidParts);
        for (let k = 0; k < lidT.length; k += 3) lidT[k] += ox;
        lidZ0 = lipH + lidPlate; lidX = ox;
      }
    }
  }
  body = mergeTris(bodyParts);
  parts.push({ key: 'body', tris: body });
  if (lidT) parts.push({ key: 'lid', tris: lidT });
  // النقش
  const decos = [];
  if (P.content !== 'none' && S.flat) {
    const faces = FACES[P.faces] || FACES.front, m = 0.88;
    const rc = Math.min(P.corner, w / 2, d / 2) * 0.5, zc = h / 2, Hs = h * m - (hollow ? 0 : 0);
    for (const f of faces) {
      let t = null;
      if (shape === 'box') {
        if (f === 'front') t = deco(P, w - 2 * rc - 4, Hs, (x, y, o) => [x, -d / 2 - o, zc + y]);
        else if (f === 'back') t = deco(P, w - 2 * rc - 4, Hs, (x, y, o) => [-x, d / 2 + o, zc + y]);
        else if (f === 'right') t = deco(P, d - 2 * rc - 4, Hs, (x, y, o) => [w / 2 + o, x, zc + y]);
        else if (f === 'left') t = deco(P, d - 2 * rc - 4, Hs, (x, y, o) => [-w / 2 - o, -x, zc + y]);
        else if (f === 'top' && (!hollow || lid)) t = deco(P, w - 2 * rc - 4, d - 2 * rc - 4, (x, y, o) => [x + (hollow ? lidX : 0), y, (hollow ? lidZ0 : h) + o]);
      } else if (shape === 'cyl' && w === d) {
        const R = w / 2;
        if (f === 'front') t = deco(P, Math.min(R * 1.6, w * 0.85), Hs, (x, y, o) => { const th = x / R; return [Math.sin(th) * (R + o), -Math.cos(th) * (R + o), zc + y]; });
        else if (f === 'back') t = deco(P, Math.min(R * 1.6, w * 0.85), Hs, (x, y, o) => { const th = x / R + Math.PI; return [Math.sin(th) * (R + o), -Math.cos(th) * (R + o), zc + y]; });
        else if (f === 'top' && (!hollow || lid)) t = deco(P, w * 0.7, d * 0.7, (x, y, o) => [x + (hollow ? lidX : 0), y, (hollow ? lidZ0 : h) + o]);
      } else if (f === 'top' && (!hollow || lid)) {
        const k = shape === 'heart' ? 0.55 : shape === 'star' ? 0.5 : 0.6;
        t = deco(P, w * k, d * k, (x, y, o) => [x + (hollow ? lidX : 0), y + (shape === 'heart' ? d * 0.06 : 0), (hollow ? lidZ0 : h) + o]);
      }
      if (t) decos.push(t);
    }
  }
  if (decos.length) parts.push({ key: 'deco', tris: mergeTris(decos) });
  // حلقة التعليق
  if (P.loop && !S.noLoop && !hollow) {
    const rr = 1.6, R = P.hole / 2 + rr, cz = h + R + rr - 1.4;
    parts.push({ key: 'loop', tris: torus(R, rr, cz) });
  }
  return parts.filter((p) => p.tris && p.tris.length);
}
