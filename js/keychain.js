// مصمم الميداليات: يرسم التصميم ثنائي الأبعاد على Canvas ثم يحوّله لخريطة ارتفاعات
import { dilate, boxBlur, keepLargest, mergeTris } from './mesh.js';
import { fieldToSolid } from './contour.js';

const isArabic = (s) => /[؀-ۿ]/.test(s);

/** يحسب أكبر حجم خط يناسب الصندوق */
function fitFont(ctx, text, family, maxW, maxH, weight = 800) {
  let size = maxH;
  ctx.font = `${weight} ${size}px "${family}"`;
  const w = ctx.measureText(text).width;
  if (w > maxW) size = size * (maxW / w);
  return Math.max(1, size);
}

function drawText(ctx, text, family, cx, cy, maxW, maxH, weight = 800) {
  if (!text) return;
  ctx.save();
  const size = fitFont(ctx, text, family, maxW, maxH, weight);
  ctx.font = `${weight} ${size}px "${family}"`;
  ctx.direction = isArabic(text) ? 'rtl' : 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // تصحيح المحاذاة العمودية حسب صندوق الحروف الفعلي
  const m = ctx.measureText(text);
  const asc = m.actualBoundingBoxAscent ?? size * 0.5, desc = m.actualBoundingBoxDescent ?? size * 0.5;
  ctx.fillText(text, cx, cy + (asc - desc) / 2);
  ctx.restore();
}

function roundRect(p, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  p.moveTo(x + r, y); p.arcTo(x + w, y, x + w, y + h, r); p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r); p.arcTo(x, y, x + w, y, r); p.closePath();
}

function heartPath(p, cx, top, s) {
  // قلب بعرض s تقريباً
  const w = s, h = s * 0.92;
  p.moveTo(cx, top + h * 0.28);
  p.bezierCurveTo(cx, top + h * 0.05, cx - w * 0.5, top - h * 0.02, cx - w * 0.5, top + h * 0.3);
  p.bezierCurveTo(cx - w * 0.5, top + h * 0.58, cx - w * 0.1, top + h * 0.78, cx, top + h);
  p.bezierCurveTo(cx + w * 0.1, top + h * 0.78, cx + w * 0.5, top + h * 0.58, cx + w * 0.5, top + h * 0.3);
  p.bezierCurveTo(cx + w * 0.5, top - h * 0.02, cx, top + h * 0.05, cx, top + h * 0.28);
  p.closePath();
}

const circle = (p, x, y, r) => { p.moveTo(x + r, y); p.arc(x, y, r, 0, Math.PI * 2); p.closePath(); };

/**
 * كل قالب يرجع: W,H بالمم، base(Path2D)، holes[]، raised(ctx) يرسم الخطوط/الحدود البارزة، text(ctx) يرسم النص
 */
export const TEMPLATES = {
  cup: {
    label: 'كوب قهوة تيك أواي', icon: '☕', sizeLabel: 'الارتفاع',
    build(P) {
      const u = P.size / 60, W = 40 * u, H = 60 * u;
      const base = new Path2D();
      circle(base, 20 * u, 5 * u, 5 * u);
      roundRect(base, 8 * u, 7.5 * u, 24 * u, 6 * u, 2 * u);        // قبة الغطاء
      roundRect(base, 3 * u, 12 * u, 34 * u, 5.5 * u, 1.6 * u);      // حافة الغطاء
      const body = new Path2D();
      body.moveTo(5 * u, 17 * u); body.lineTo(35 * u, 17 * u);
      body.lineTo(31.5 * u, 57 * u); body.quadraticCurveTo(31.3 * u, 59 * u, 29.5 * u, 59 * u);
      body.lineTo(10.5 * u, 59 * u); body.quadraticCurveTo(8.7 * u, 59 * u, 8.5 * u, 57 * u); body.closePath();
      base.addPath(body);
      const xAt = (y) => [5 + (y - 17) * (3.5 / 40), 35 - (y - 17) * (3.5 / 40)].map((v) => v * u);
      return {
        W, H, base, hole: [20 * u, 5 * u],
        raised(ctx, lw) {
          ctx.lineWidth = lw; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(3 * u, 17.3 * u); ctx.lineTo(37 * u, 17.3 * u); ctx.stroke();
          if (P.decor) {
            for (const y of [28, 47]) { const [a, b] = xAt(y); ctx.beginPath(); ctx.moveTo(a, y * u); ctx.lineTo(b, y * u); ctx.stroke(); }
          }
        },
        text(ctx) {
          const [a, b] = xAt(37.5);
          drawText(ctx, P.text1, P.font, (a + b) / 2, 37.5 * u, (b - a) - 5 * u, 11 * u);
          const [c, d] = xAt(53);
          drawText(ctx, P.text2, P.font, (c + d) / 2, 52.8 * u, (d - c) - 6 * u, 4.6 * u, 700);
          if (P.decor) drawText(ctx, '☕', 'sans-serif', 20 * u, 22.6 * u, 8 * u, 5 * u, 400);
        },
      };
    },
  },
  iced: {
    label: 'كوب آيس مع شفاطة', icon: '🧋', sizeLabel: 'الارتفاع',
    build(P) {
      const u = P.size / 64, W = 40 * u, H = 64 * u;
      const base = new Path2D();
      circle(base, 24 * u, 5 * u, 5 * u);                              // حلقة في رأس الشفاطة
      base.moveTo(21.6 * u, 6 * u); base.lineTo(25.4 * u, 8 * u); base.lineTo(22.4 * u, 18 * u); base.lineTo(18.6 * u, 16.5 * u); base.closePath();
      base.moveTo(6 * u, 21 * u); base.bezierCurveTo(6 * u, 9 * u, 34 * u, 9 * u, 34 * u, 21 * u); base.closePath(); // غطاء قبة
      roundRect(base, 3.5 * u, 20 * u, 33 * u, 4 * u, 1.4 * u);
      const body = new Path2D();
      body.moveTo(5.5 * u, 24 * u); body.lineTo(34.5 * u, 24 * u); body.lineTo(30.5 * u, 61 * u);
      body.quadraticCurveTo(30.2 * u, 63 * u, 28.4 * u, 63 * u); body.lineTo(11.6 * u, 63 * u);
      body.quadraticCurveTo(9.8 * u, 63 * u, 9.5 * u, 61 * u); body.closePath();
      base.addPath(body);
      const xAt = (y) => [5.5 + (y - 24) * (4 / 37), 34.5 - (y - 24) * (4 / 37)].map((v) => v * u);
      return {
        W, H, base, hole: [24 * u, 5 * u],
        raised(ctx, lw) {
          ctx.lineWidth = lw; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(3.5 * u, 24.2 * u); ctx.lineTo(36.5 * u, 24.2 * u); ctx.stroke();
          if (P.decor) {
            const [a, b] = xAt(32);
            ctx.beginPath(); ctx.moveTo(a + 1 * u, 32 * u);
            for (let x = a + 1 * u; x <= b - 1 * u; x += 0.5 * u) ctx.lineTo(x, 32 * u + Math.sin((x - a) / (2.2 * u)) * 1.1 * u);
            ctx.stroke();
            ctx.strokeRect(14 * u, 53 * u, 4.5 * u, 4.5 * u); ctx.strokeRect(21 * u, 54 * u, 4 * u, 4 * u);
          }
        },
        text(ctx) {
          const [a, b] = xAt(41);
          drawText(ctx, P.text1, P.font, 20 * u, 41 * u, (b - a) - 5 * u, 10.5 * u);
          drawText(ctx, P.text2, P.font, 20 * u, 47.5 * u, 20 * u, 3.8 * u, 700);
        },
      };
    },
  },
  mug: {
    label: 'كوب مج مع بخار', icon: '🍵', sizeLabel: 'الارتفاع',
    build(P) {
      const u = P.size / 54, W = 52 * u, H = 54 * u;
      const base = new Path2D();
      roundRect(base, 4 * u, 16 * u, 32 * u, 36 * u, 4 * u);
      circle(base, 41 * u, 32 * u, 10 * u);   // المقبض (فتحته هي مكان الحلقة)
      return {
        W, H, base, hole: [42 * u, 32 * u], holeR: 5.6 * u, holeFixed: true,
        extraBase(ctx) {
          ctx.lineWidth = 2.4 * u; ctx.lineCap = 'round';
          for (const x of [12, 20, 28]) {
            ctx.beginPath(); ctx.moveTo(x * u, 17 * u);
            ctx.bezierCurveTo((x - 4) * u, 12 * u, (x + 4) * u, 9 * u, x * u, 3 * u);
            ctx.stroke();
          }
        },
        raised(ctx, lw) {
          ctx.lineWidth = lw;
          ctx.beginPath(); ctx.moveTo(4 * u, 20.5 * u); ctx.lineTo(36 * u, 20.5 * u); ctx.stroke();
          if (P.decor) { ctx.beginPath(); ctx.moveTo(8 * u, 47 * u); ctx.lineTo(32 * u, 47 * u); ctx.stroke(); }
        },
        text(ctx) {
          drawText(ctx, P.text1, P.font, 19 * u, 33 * u, 24 * u, 12 * u);
          drawText(ctx, P.text2, P.font, 19 * u, 42.5 * u, 23 * u, 4.2 * u, 700);
        },
      };
    },
  },
  tag: {
    label: 'ميدالية اسم', icon: '🏷️', sizeLabel: 'العرض',
    build(P) {
      const W = P.size, H = P.size * 0.36;
      const base = new Path2D();
      roundRect(base, 0, 0, W, H, H * 0.3);
      const hx = H * 0.32;
      return {
        W, H, base, hole: [hx, H / 2],
        raised() {},
        text(ctx) {
          const left = hx * 2;
          if (P.text2) {
            drawText(ctx, P.text1, P.font, (left + W) / 2, H * 0.4, W - left - H * 0.25, H * 0.5);
            drawText(ctx, P.text2, P.font, (left + W) / 2, H * 0.78, W - left - H * 0.3, H * 0.18, 700);
          } else drawText(ctx, P.text1, P.font, (left + W) / 2, H / 2, W - left - H * 0.25, H * 0.62);
        },
      };
    },
  },
  circle: {
    label: 'دائرية / عملة', icon: '🪙', sizeLabel: 'القطر',
    build(P) {
      const W = P.size, R = W / 2, H = W + R * 0.3;
      const cy = R * 0.3 + R;
      const base = new Path2D();
      circle(base, R, cy, R);
      circle(base, R, R * 0.3 + 0.5, R * 0.28);
      return {
        W, H, base, hole: [R, R * 0.3 + 0.5],
        raised(ctx, lw) { if (P.decor) { ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(R, cy, R * 0.78, 0, Math.PI * 2); ctx.stroke(); } },
        text(ctx) {
          drawText(ctx, P.text1, P.font, R, cy - (P.text2 ? R * 0.12 : 0), R * 1.3, R * 0.55);
          drawText(ctx, P.text2, P.font, R, cy + R * 0.38, R * 1.0, R * 0.2, 700);
        },
      };
    },
  },
  heart: {
    label: 'قلب', icon: '❤️', sizeLabel: 'العرض',
    build(P) {
      const W = P.size, top = W * 0.14, H = top + W * 0.92;
      const base = new Path2D();
      heartPath(base, W / 2, top, W);
      circle(base, W / 2, top + W * 0.08, W * 0.12);
      return {
        W, H, base, hole: [W / 2, top + W * 0.08],
        raised() {},
        text(ctx) {
          drawText(ctx, P.text1, P.font, W / 2, top + W * 0.45, W * 0.62, W * 0.24);
          drawText(ctx, P.text2, P.font, W / 2, top + W * 0.66, W * 0.4, W * 0.09, 700);
        },
      };
    },
  },
  qr: {
    label: 'باركود QR (منيو/انستقرام)', icon: '🔳', sizeLabel: 'العرض',
    build(P) {
      const W = P.size, pad = W * 0.08, textH = P.text1 ? W * 0.2 : 0;
      const H = W + textH + W * 0.14;
      const top = W * 0.14;
      const base = new Path2D();
      roundRect(base, 0, top, W, W + textH, W * 0.1);
      circle(base, W / 2, top + 0.5, W * 0.12);
      let qr = null;
      try {
        // eslint-disable-next-line no-undef
        qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
        // eslint-disable-next-line no-undef
        qr = qrcode(0, 'M'); qr.addData(P.qr || 'https://example.com'); qr.make();
      } catch (e) { qr = null; }
      const n = qr ? qr.getModuleCount() : 0;
      const cell = (W - pad * 2) / Math.max(n, 1);
      return {
        W, H, base, hole: [W / 2, top + 0.5], holeR: Math.min(P.hole / 2, W * 0.07),
        qrCell: cell,
        raised() {},
        text(ctx) {
          if (qr) {
            for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) {
              ctx.fillRect(pad + c * cell - 0.01, top + pad + r * cell - 0.01, cell + 0.02, cell + 0.02);
            }
          }
          if (P.text1) drawText(ctx, P.text1, P.font, W / 2, top + W + textH * 0.35, W - pad * 2, textH * 0.7);
        },
      };
    },
  },
  logo: {
    label: 'شعار من صورة', icon: '🖼️', sizeLabel: 'العرض',
    build(P) {
      const img = P.logoImage;
      const W = P.size;
      const ar = img ? img.height / img.width : 1;
      const top = W * 0.12;
      const H = top + W * ar + 2;
      return {
        W, H, base: new Path2D(), hole: [W / 2, top * 0.75], pixelLogo: { img, x: 0, y: top, w: W, h: W * ar },
        raised() {}, text() {},
      };
    },
  },
};

/** يرسم القالب على مستوى البكسل ويرجع حقول الأشكال وطبقات البثق */
export function rasterize(P) {
  const T = TEMPLATES[P.template].build(P);
  const px = P.res;                // مم لكل بكسل
  const m = 1.0;                   // هامش
  const w = Math.ceil((T.W + m * 2) / px), h = Math.ceil((T.H + m * 2) / px);
  const N = w * h;
  const mk = () => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.scale(1 / px, 1 / px); ctx.translate(m, m);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
    return { c, ctx };
  };
  const read = ({ ctx }) => {
    const d = ctx.getImageData(0, 0, w, h).data;
    const a = new Float32Array(N);
    for (let k = 0; k < N; k++) a[k] = d[k * 4 + 3] / 255;
    return a;
  };
  const fromBin = (b) => { const f = new Float32Array(N); for (let k = 0; k < N; k++) f[k] = b[k]; return boxBlur(f, w, h, 1); };

  // القاعدة
  const B = mk();
  B.ctx.fill(T.base);
  if (T.extraBase) T.extraBase(B.ctx);
  let baseF = read(B);
  let logoF = null;
  if (T.pixelLogo && T.pixelLogo.img) {
    const L = mk();
    const { img, x, y, w: lw, h: lh } = T.pixelLogo;
    L.ctx.drawImage(img, x, y, lw, lh);
    const d = L.ctx.getImageData(0, 0, w, h).data;
    let logoMask = new Uint8Array(N);
    for (let k = 0; k < N; k++) {
      const a = d[k * 4 + 3];
      if (a < 20) continue;
      const lum = 0.299 * d[k * 4] + 0.587 * d[k * 4 + 1] + 0.114 * d[k * 4 + 2];
      let on = P.logoHasAlpha ? a > 127 : lum < P.threshold;
      if (P.invertLogo) on = !on;
      if (on) logoMask[k] = 1;
    }
    logoMask = keepLargest(logoMask, w, h, 0.004).mask; // إزالة النقاط العشوائية
    // خلفية الشعار = الشعار موسّع لضمان اتصال كل الأجزاء
    const back = dilate(logoMask, w, h, Math.max(1, Math.round(P.logoOutline / px)));
    const solid = keepLargest(back, w, h, 0.05).mask;
    let topY = h;
    const ci = Math.round((T.W / 2 + m) / px);
    for (let j = 0; j < h && topY === h; j++) for (let di = -3; di <= 3; di++) if (solid[j * w + ci + di]) { topY = j; break; }
    const ty = topY * px - m;
    const r = Math.max(P.hole / 2 + 2, 4);
    T.hole = [T.W / 2, ty - r * 0.35];
    const tab = mk(); tab.ctx.beginPath();
    tab.ctx.arc(T.hole[0], T.hole[1], r, 0, Math.PI * 2); tab.ctx.fill();
    tab.ctx.fillRect(T.hole[0] - r * 0.7, T.hole[1], r * 1.4, r * 1.2);
    const tf = read(tab);
    baseF = fromBin(back);
    for (let k = 0; k < N; k++) baseF[k] = Math.max(baseF[k], tf[k]);
    for (let k = 0; k < N; k++) if (!back[k]) logoMask[k] = 0;
    logoF = fromBin(logoMask);
  }

  // الثقب
  const Hh = mk();
  const holeR = T.holeFixed ? T.holeR : Math.min(P.hole / 2, T.holeR ?? Infinity);
  Hh.ctx.beginPath(); Hh.ctx.arc(T.hole[0], T.hole[1], holeR, 0, Math.PI * 2); Hh.ctx.fill();
  const holeF = read(Hh);

  // البارز: إطار + خطوط ديكور
  const Rr = mk();
  if (P.border && !logoF) {
    Rr.ctx.save(); Rr.ctx.clip(T.base);
    Rr.ctx.lineWidth = P.borderW * 2; Rr.ctx.stroke(T.base);
    Rr.ctx.restore();
  }
  Rr.ctx.save(); Rr.ctx.clip(T.base); T.raised(Rr.ctx, P.lineW); Rr.ctx.restore();
  if (P.border) { Rr.ctx.lineWidth = P.borderW; Rr.ctx.beginPath(); Rr.ctx.arc(T.hole[0], T.hole[1], holeR + P.borderW / 2, 0, Math.PI * 2); Rr.ctx.stroke(); }
  const raisedF = read(Rr);

  // النص
  const X = mk();
  T.text(X.ctx);
  const textF = logoF || read(X);

  // حقول نهائية
  const solidF = new Float32Array(N), accF = new Float32Array(N), engF = new Float32Array(N);
  const engraved = P.textMode === 'engraved';
  for (let k = 0; k < N; k++) {
    const s = Math.min(baseF[k], 1 - holeF[k]);
    solidF[k] = s;
    const shrink = Math.min(s, 1); // البارز يبقى داخل القاعدة
    if (engraved) {
      engF[k] = Math.min(shrink, textF[k]);
      accF[k] = Math.min(shrink, raisedF[k], 1 - textF[k]);
    } else accF[k] = Math.min(shrink, Math.max(raisedF[k], textF[k]));
  }
  const depth = Math.min(P.raiseH, P.baseH - 0.6);
  const layers = [];
  if (engraved) {
    const upper = new Float32Array(N);
    for (let k = 0; k < N; k++) upper[k] = Math.min(solidF[k], 1 - engF[k]);
    layers.push({ f: solidF, z0: 0, z1: P.baseH - depth, part: 'base' });
    layers.push({ f: upper, z0: P.baseH - depth, z1: P.baseH, part: 'base' });
  } else layers.push({ f: solidF, z0: 0, z1: P.baseH, part: 'base' });
  layers.push({ f: accF, z0: P.baseH, z1: P.baseH + P.raiseH, part: 'accent' });

  return { layers, w, h, px, W: T.W, H: T.H, solidF, accF, engF, warnQR: T.qrCell && T.qrCell < 0.9, qrCell: T.qrCell };
}

/** يبني المجسمات: {base, accent} كل منها مغلق */
export function buildSolids(R) {
  const out = { base: [], accent: [] };
  for (const L of R.layers) {
    const t = fieldToSolid(L.f, R.w, R.h, R.px, L.z0, L.z1);
    if (t.length) out[L.part].push(t);
  }
  return { base: mergeTris(out.base), accent: mergeTris(out.accent) };
}
