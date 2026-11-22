// مصمم الميداليات: يرسم التصميم ثنائي الأبعاد على Canvas ثم يحوّله لحقول أشكال وطبقات بثق
import { dilate, boxBlur, keepLargest, mergeTris } from './mesh.js';
import { fieldToSolid } from './contour.js';

const isArabic = (s) => /[؀-ۿ]/.test(s);

function fitFont(ctx, text, family, maxW, maxH, weight = 800) {
  let size = maxH;
  ctx.font = `${weight} ${size}px "${family}"`;
  const w = ctx.measureText(text).width;
  if (w > maxW) size = size * (maxW / w);
  return Math.max(0.5, size);
}

export function drawText(ctx, text, family, cx, cy, maxW, maxH, weight = 800) {
  if (!text) return;
  ctx.save();
  const size = fitFont(ctx, text, family, maxW, maxH, weight);
  ctx.font = `${weight} ${size}px "${family}"`;
  ctx.direction = isArabic(text) ? 'rtl' : 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
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
  const w = s, h = s * 0.92;
  p.moveTo(cx, top + h * 0.28);
  p.bezierCurveTo(cx, top + h * 0.05, cx - w * 0.5, top - h * 0.02, cx - w * 0.5, top + h * 0.3);
  p.bezierCurveTo(cx - w * 0.5, top + h * 0.58, cx - w * 0.1, top + h * 0.78, cx, top + h);
  p.bezierCurveTo(cx + w * 0.1, top + h * 0.78, cx + w * 0.5, top + h * 0.58, cx + w * 0.5, top + h * 0.3);
  p.bezierCurveTo(cx + w * 0.5, top - h * 0.02, cx, top + h * 0.05, cx, top + h * 0.28);
  p.closePath();
}
const circle = (p, x, y, r) => { p.moveTo(x + r, y); p.arc(x, y, r, 0, Math.PI * 2); p.closePath(); };
function star(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
}

/** يرسم QR داخل مربع ويرجع حجم المربع الصغير بالمم */
export function drawQR(ctx, text, x, y, size) {
  let qr;
  try {
    // eslint-disable-next-line no-undef
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    // eslint-disable-next-line no-undef
    qr = qrcode(0, 'M'); qr.addData(text || 'https://example.com'); qr.make();
  } catch { return 0; }
  const n = qr.getModuleCount(), cell = size / n;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) {
    ctx.fillRect(x + c * cell - 0.01, y + r * cell - 0.01, cell + 0.02, cell + 0.02);
  }
  return cell;
}

/**
 * كل قالب يرجع: W,H (مم)، base(Path2D)، hole [x,y] أو noHole، raised(ctx,lw,H)، text(ctx,H)
 * logoBox: مكان الشعار كزخرفة، backBox: مكان النص/QR على الوجه الخلفي
 * H.name(cx,cy,w,h) يرسم الاسم (أو الشعار إن اختار المستخدم وضعه مكان الاسم)
 */
export const TEMPLATES = {
  cup: {
    label: 'كوب تيك أواي', icon: '☕', sizeLabel: 'الارتفاع', group: 'coffee', def: 55,
    build(P) {
      const u = P.size / 60, W = 40 * u, H = 60 * u;
      const base = new Path2D();
      circle(base, 20 * u, 5 * u, 5 * u);
      roundRect(base, 8 * u, 7.5 * u, 24 * u, 6 * u, 2 * u);
      roundRect(base, 3 * u, 12 * u, 34 * u, 5.5 * u, 1.6 * u);
      const body = new Path2D();
      body.moveTo(5 * u, 17 * u); body.lineTo(35 * u, 17 * u);
      body.lineTo(31.5 * u, 57 * u); body.quadraticCurveTo(31.3 * u, 59 * u, 29.5 * u, 59 * u);
      body.lineTo(10.5 * u, 59 * u); body.quadraticCurveTo(8.7 * u, 59 * u, 8.5 * u, 57 * u); body.closePath();
      base.addPath(body);
      const xAt = (y) => [5 + (y - 17) * (3.5 / 40), 35 - (y - 17) * (3.5 / 40)].map((v) => v * u);
      return {
        W, H, base, hole: [20 * u, 5 * u],
        logoBox: [13 * u, 19 * u, 14 * u, 7.5 * u],
        backBox: { cx: 20 * u, cy: 38 * u, w: 22 * u, h: 30 * u },
        raised(ctx, lw) {
          ctx.lineWidth = lw; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(3 * u, 17.3 * u); ctx.lineTo(37 * u, 17.3 * u); ctx.stroke();
          if (P.decor) for (const y of [28, 47]) { const [a, b] = xAt(y); ctx.beginPath(); ctx.moveTo(a, y * u); ctx.lineTo(b, y * u); ctx.stroke(); }
        },
        text(ctx, Hh) {
          const [a, b] = xAt(37.5);
          Hh.name((a + b) / 2, 37.5 * u, (b - a) - 5 * u, 11 * u);
          const [c, d] = xAt(53);
          Hh.sub((c + d) / 2, 52.8 * u, (d - c) - 6 * u, 4.6 * u);
          if (P.decor && !Hh.decorLogo) drawText(ctx, '☕', 'sans-serif', 20 * u, 22.6 * u, 8 * u, 5 * u, 400);
        },
      };
    },
  },
  iced: {
    label: 'كوب آيس بشفاطة', icon: '🧋', sizeLabel: 'الارتفاع', group: 'coffee', def: 58,
    build(P) {
      const u = P.size / 64, W = 40 * u, H = 64 * u;
      const base = new Path2D();
      circle(base, 24 * u, 5 * u, 5 * u);
      base.moveTo(21.6 * u, 6 * u); base.lineTo(25.4 * u, 8 * u); base.lineTo(22.4 * u, 18 * u); base.lineTo(18.6 * u, 16.5 * u); base.closePath();
      base.moveTo(6 * u, 21 * u); base.bezierCurveTo(6 * u, 9 * u, 34 * u, 9 * u, 34 * u, 21 * u); base.closePath();
      roundRect(base, 3.5 * u, 20 * u, 33 * u, 4 * u, 1.4 * u);
      const body = new Path2D();
      body.moveTo(5.5 * u, 24 * u); body.lineTo(34.5 * u, 24 * u); body.lineTo(30.5 * u, 61 * u);
      body.quadraticCurveTo(30.2 * u, 63 * u, 28.4 * u, 63 * u); body.lineTo(11.6 * u, 63 * u);
      body.quadraticCurveTo(9.8 * u, 63 * u, 9.5 * u, 61 * u); body.closePath();
      base.addPath(body);
      const xAt = (y) => [5.5 + (y - 24) * (4 / 37), 34.5 - (y - 24) * (4 / 37)].map((v) => v * u);
      return {
        W, H, base, hole: [24 * u, 5 * u],
        logoBox: [12 * u, 51.5 * u, 16 * u, 8.5 * u],
        backBox: { cx: 20 * u, cy: 43 * u, w: 22 * u, h: 30 * u },
        raised(ctx, lw, Hh) {
          ctx.lineWidth = lw; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(3.5 * u, 24.2 * u); ctx.lineTo(36.5 * u, 24.2 * u); ctx.stroke();
          if (P.decor) {
            const [a, b] = xAt(32);
            ctx.beginPath(); ctx.moveTo(a + 1 * u, 32 * u);
            for (let x = a + 1 * u; x <= b - 1 * u; x += 0.5 * u) ctx.lineTo(x, 32 * u + Math.sin((x - a) / (2.2 * u)) * 1.1 * u);
            ctx.stroke();
            if (!Hh.decorLogo) { ctx.strokeRect(14 * u, 53 * u, 4.5 * u, 4.5 * u); ctx.strokeRect(21 * u, 54 * u, 4 * u, 4 * u); }
          }
        },
        text(ctx, Hh) {
          const [a, b] = xAt(41);
          Hh.name(20 * u, 41 * u, (b - a) - 5 * u, 10.5 * u);
          Hh.sub(20 * u, 47.5 * u, 20 * u, 3.8 * u);
        },
      };
    },
  },
  mug: {
    label: 'مج ببخار', icon: '🍵', sizeLabel: 'الارتفاع', group: 'coffee', def: 50,
    build(P) {
      const u = P.size / 54, W = 52 * u, H = 54 * u;
      const base = new Path2D();
      roundRect(base, 4 * u, 16 * u, 32 * u, 36 * u, 4 * u);
      circle(base, 41 * u, 32 * u, 10 * u);
      return {
        W, H, base, hole: [42 * u, 32 * u], holeR: 5.6 * u, holeFixed: true,
        logoBox: [12 * u, 44.2 * u, 14 * u, 5.6 * u],
        backBox: { cx: 19 * u, cy: 35 * u, w: 26 * u, h: 26 * u },
        extraBase(ctx) {
          ctx.lineWidth = 2.4 * u; ctx.lineCap = 'round';
          for (const x of [12, 20, 28]) {
            ctx.beginPath(); ctx.moveTo(x * u, 17 * u);
            ctx.bezierCurveTo((x - 4) * u, 12 * u, (x + 4) * u, 9 * u, x * u, 3 * u);
            ctx.stroke();
          }
        },
        raised(ctx, lw, Hh) {
          ctx.lineWidth = lw;
          ctx.beginPath(); ctx.moveTo(4 * u, 20.5 * u); ctx.lineTo(36 * u, 20.5 * u); ctx.stroke();
          if (P.decor && !Hh.decorLogo) { ctx.beginPath(); ctx.moveTo(8 * u, 47 * u); ctx.lineTo(32 * u, 47 * u); ctx.stroke(); }
        },
        text(ctx, Hh) {
          Hh.name(19 * u, 33 * u, 24 * u, 12 * u);
          Hh.sub(19 * u, 41.5 * u, 23 * u, 4.2 * u);
        },
      };
    },
  },
  bean: {
    label: 'حبة قهوة', icon: '🫘', sizeLabel: 'العرض', group: 'coffee', def: 55,
    build(P) {
      const W = P.size, H0 = W * 0.66, tab = W * 0.16, H = H0 + tab;
      const cx = W / 2, cy = tab + H0 / 2;
      const base = new Path2D();
      base.ellipse(cx, cy, W / 2, H0 / 2, 0, 0, Math.PI * 2); base.closePath();
      circle(base, cx, tab * 0.75, W * 0.1);
      const groove = (ctx) => {
        ctx.beginPath(); ctx.moveTo(W * 0.1, cy);
        ctx.bezierCurveTo(W * 0.36, cy - H0 * 0.13, W * 0.64, cy + H0 * 0.13, W * 0.9, cy);
        ctx.stroke();
      };
      return {
        W, H, base, hole: [cx, tab * 0.75],
        logoBox: [cx - W * 0.14, cy + H0 * 0.1, W * 0.28, H0 * 0.26],
        backBox: { cx, cy, w: W * 0.6, h: H0 * 0.5 },
        raised(ctx, lw) { ctx.lineWidth = lw * 1.4; ctx.lineCap = 'round'; groove(ctx); },
        text(ctx, Hh) {
          Hh.name(cx, cy - H0 * 0.23, W * 0.56, H0 * 0.22);
          if (!Hh.decorLogo) Hh.sub(cx, cy + H0 * 0.24, W * 0.5, H0 * 0.11);
        },
      };
    },
  },
  dallah: {
    label: 'دلة عربية', icon: '🫖', sizeLabel: 'الارتفاع', group: 'coffee', def: 60,
    build(P) {
      const u = P.size / 60, W = 48 * u, H = 60 * u;
      const s = (v) => v * u;
      const base = new Path2D();
      circle(base, s(25), s(5), s(4.5));
      base.rect(s(23), s(8), s(4), s(4));
      base.moveTo(s(17), s(16)); base.bezierCurveTo(s(17), s(9.5), s(33), s(9.5), s(33), s(16)); base.closePath();
      roundRect(base, s(15), s(15.5), s(20), s(3), s(1));
      base.moveTo(s(18), s(18.5)); base.lineTo(s(32), s(18.5));
      base.bezierCurveTo(s(31), s(24), s(29), s(26), s(30), s(30));
      base.bezierCurveTo(s(40), s(36), s(40), s(50), s(34), s(55));
      base.lineTo(s(16), s(55));
      base.bezierCurveTo(s(10), s(50), s(10), s(36), s(20), s(30));
      base.bezierCurveTo(s(21), s(26), s(19), s(24), s(18), s(18.5)); base.closePath();
      roundRect(base, s(14.5), s(54), s(21), s(4.5), s(1.6));
      base.moveTo(s(1.5), s(17)); base.lineTo(s(7.5), s(19)); base.lineTo(s(5), s(23.5)); base.closePath();
      return {
        W, H, base, hole: [s(25), s(5)], holeR: s(2.6),
        logoBox: [s(19), s(31.5), s(12), s(5.5)],
        backBox: { cx: s(25), cy: s(43), w: s(18), h: s(16) },
        extraBase(ctx) {
          ctx.lineCap = 'round';
          ctx.lineWidth = s(4); ctx.beginPath(); ctx.moveTo(s(17), s(42)); ctx.quadraticCurveTo(s(7), s(37), s(4.5), s(20)); ctx.stroke();
          ctx.lineWidth = s(3); ctx.beginPath(); ctx.moveTo(s(31), s(21)); ctx.bezierCurveTo(s(46), s(21), s(46), s(44), s(37), s(46)); ctx.stroke();
        },
        raised(ctx, lw) {
          ctx.lineWidth = lw;
          ctx.beginPath(); ctx.moveTo(s(15), s(17)); ctx.lineTo(s(35), s(17)); ctx.stroke();
          if (P.decor) { ctx.beginPath(); ctx.moveTo(s(19), s(29.6)); ctx.lineTo(s(31), s(29.6)); ctx.stroke(); }
        },
        text(ctx, Hh) {
          Hh.name(s(25), s(42), s(19), s(9));
          Hh.sub(s(25), s(50.5), s(15), s(3.4));
        },
      };
    },
  },
  finjan: {
    label: 'فنجان عربي', icon: '🍶', sizeLabel: 'العرض', group: 'coffee', def: 50,
    build(P) {
      const u = P.size / 44, W = 44 * u, H = 38 * u;
      const s = (v) => v * u;
      const base = new Path2D();
      circle(base, s(22), s(5.5), s(5));
      roundRect(base, s(2), s(9), s(40), s(3), s(1.4));
      base.moveTo(s(3), s(10)); base.lineTo(s(41), s(10));
      base.bezierCurveTo(s(40), s(24), s(34), s(32), s(28), s(33.5)); base.lineTo(s(16), s(33.5));
      base.bezierCurveTo(s(10), s(32), s(4), s(24), s(3), s(10)); base.closePath();
      roundRect(base, s(2), s(33), s(40), s(4), s(2));
      return {
        W, H, base, hole: [s(22), s(5.5)],
        logoBox: [s(15), s(12.6), s(14), s(4.4)],
        backBox: { cx: s(22), cy: s(22), w: s(26), h: s(14) },
        raised(ctx, lw, Hh) {
          ctx.lineWidth = lw; ctx.lineJoin = 'round';
          if (P.decor && !Hh.decorLogo) {
            ctx.beginPath(); ctx.moveTo(s(8), s(15));
            for (let x = 8, k = 0; x <= 36; x += 2, k++) ctx.lineTo(s(x), s(k % 2 ? 13 : 15.5));
            ctx.stroke();
          }
        },
        text(ctx, Hh) {
          Hh.name(s(22), s(22), s(27), s(8));
          Hh.sub(s(22), s(29.2), s(14), s(2.8));
        },
      };
    },
  },
  v60: {
    label: 'V60 تقطير', icon: '🔻', sizeLabel: 'الارتفاع', group: 'coffee', def: 45,
    build(P) {
      const u = P.size / 40, W = 51 * u, H = 40 * u;
      const s = (v) => v * u;
      const base = new Path2D();
      roundRect(base, s(4), s(2), s(36), s(4), s(1.5));
      base.moveTo(s(6), s(6)); base.lineTo(s(38), s(6)); base.lineTo(s(27), s(34)); base.lineTo(s(17), s(34)); base.closePath();
      roundRect(base, s(10), s(33.5), s(24), s(5.5), s(2));
      circle(base, s(43), s(10), s(7));
      return {
        W, H, base, hole: [s(43), s(10)], holeR: s(3.8), holeFixed: true,
        logoBox: [s(17), s(22.5), s(10), s(8)],
        backBox: { cx: s(22), cy: s(16), w: s(20), h: s(14) },
        raised(ctx, lw, Hh) {
          ctx.lineWidth = lw; ctx.lineCap = 'round';
          if (P.decor && !Hh.decorLogo) for (const [x0, x1] of [[17.5, 19.5], [22, 22], [26.5, 24.5]]) {
            ctx.beginPath(); ctx.moveTo(s(x0), s(23)); ctx.lineTo(s(x1), s(31.5)); ctx.stroke();
          }
        },
        text(ctx, Hh) {
          Hh.name(s(22), s(14.5), s(23), s(7));
          Hh.sub(s(22), s(36.3), s(18), s(3));
        },
      };
    },
  },
  espresso: {
    label: 'مكينة إسبريسو', icon: '⚙️', sizeLabel: 'الارتفاع', group: 'coffee', def: 55,
    build(P) {
      const u = P.size / 52, W = 44 * u, H = 52 * u;
      const s = (v) => v * u;
      const base = new Path2D();
      circle(base, s(22), s(5), s(5));
      roundRect(base, s(4), s(9), s(36), s(12), s(2.5));
      base.rect(s(4), s(19), s(7), s(28));
      base.rect(s(33), s(19), s(7), s(28));
      base.rect(s(11), s(19), s(22), s(6));
      roundRect(base, s(16), s(24), s(12), s(4), s(1));
      roundRect(base, s(14), s(28), s(16), s(3), s(1));
      roundRect(base, s(29), s(28.3), s(13), s(2.4), s(1.2));
      roundRect(base, s(16.5), s(37), s(11), s(8.5), s(1.6));
      roundRect(base, s(2), s(45), s(40), s(5.5), s(2));
      return {
        W, H, base, hole: [s(22), s(5)],
        logoBox: [s(17.5), s(38.2), s(9), s(6)],
        backBox: { cx: s(22), cy: s(15), w: s(30), h: s(9) },
        extraBase(ctx) {
          ctx.lineWidth = s(1.1);
          for (const x of [20, 24]) { ctx.beginPath(); ctx.moveTo(s(x), s(30)); ctx.lineTo(s(x), s(38)); ctx.stroke(); }
        },
        raised(ctx, lw) {
          ctx.lineWidth = lw;
          if (P.decor) for (const x of [7.5, 36.5]) { ctx.beginPath(); ctx.arc(s(x), s(24), s(2), 0, Math.PI * 2); ctx.stroke(); }
        },
        text(ctx, Hh) {
          Hh.name(s(22), s(15), s(31), s(7.5));
          Hh.sub(s(22), s(47.8), s(27), s(2.4));
        },
      };
    },
  },
  tag: {
    label: 'ميدالية اسم', icon: '🏷️', sizeLabel: 'العرض', group: 'general', def: 60,
    build(P) {
      const W = P.size, H = P.size * 0.36;
      const base = new Path2D();
      roundRect(base, 0, 0, W, H, H * 0.3);
      const hx = H * 0.32;
      const logoW = P._hasDecorLogo ? H * 0.8 : 0;
      return {
        W, H, base, hole: [hx, H / 2],
        logoBox: [W - H * 0.12 - logoW, H * 0.1, logoW, H * 0.8],
        backBox: { cx: W / 2 + hx, cy: H / 2, w: W - hx * 3, h: H * 0.55 },
        raised() {},
        text(ctx, Hh) {
          const left = hx * 2, right = W - logoW - (logoW ? H * 0.15 : 0);
          if (P.text2) {
            Hh.name((left + right) / 2, H * 0.4, right - left - H * 0.25, H * 0.5);
            Hh.sub((left + right) / 2, H * 0.78, right - left - H * 0.3, H * 0.18);
          } else Hh.name((left + right) / 2, H / 2, right - left - H * 0.25, H * 0.62);
        },
      };
    },
  },
  circle: {
    label: 'دائرية', icon: '🪙', sizeLabel: 'القطر', group: 'general', def: 45,
    build(P) {
      const W = P.size, R = W / 2, H = W + R * 0.3;
      const cy = R * 0.3 + R;
      const base = new Path2D();
      circle(base, R, cy, R);
      circle(base, R, R * 0.3 + 0.5, R * 0.28);
      return {
        W, H, base, hole: [R, R * 0.3 + 0.5],
        logoBox: [R - R * 0.3, cy - R * 0.7, R * 0.6, R * 0.32],
        backBox: { cx: R, cy, w: R * 1.3, h: R * 1.1 },
        raised(ctx, lw) { if (P.decor) { ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(R, cy, R * 0.8, 0, Math.PI * 2); ctx.stroke(); } },
        text(ctx, Hh) {
          Hh.name(R, cy - (P.text2 ? R * 0.1 : 0), R * 1.25, R * 0.5);
          Hh.sub(R, cy + R * 0.38, R * 0.95, R * 0.19);
        },
      };
    },
  },
  heart: {
    label: 'قلب', icon: '❤️', sizeLabel: 'العرض', group: 'general', def: 50,
    build(P) {
      const W = P.size, top = W * 0.14, H = top + W * 0.92;
      const base = new Path2D();
      heartPath(base, W / 2, top, W);
      circle(base, W / 2, top + W * 0.08, W * 0.12);
      return {
        W, H, base, hole: [W / 2, top + W * 0.08],
        logoBox: [W * 0.4, top + W * 0.6, W * 0.2, W * 0.13],
        backBox: { cx: W / 2, cy: top + W * 0.45, w: W * 0.55, h: W * 0.3 },
        raised() {},
        text(ctx, Hh) {
          Hh.name(W / 2, top + W * 0.45, W * 0.62, W * 0.24);
          if (!Hh.decorLogo) Hh.sub(W / 2, top + W * 0.66, W * 0.4, W * 0.09);
        },
      };
    },
  },
  qr: {
    label: 'ميدالية QR', icon: '🔳', sizeLabel: 'العرض', group: 'general', def: 40,
    build(P) {
      const W = P.size, pad = W * 0.08, textH = P.text1 ? W * 0.2 : 0;
      const top = W * 0.14, H = top + W + textH;
      const base = new Path2D();
      roundRect(base, 0, top, W, W + textH, W * 0.1);
      circle(base, W / 2, top + 0.5, W * 0.12);
      const T = {
        W, H, base, hole: [W / 2, top + 0.5], holeR: Math.min(P.hole / 2, W * 0.07),
        backBox: { cx: W / 2, cy: top + (W + textH) / 2, w: W * 0.8, h: W * 0.5 },
        raised() {},
        text(ctx, Hh) {
          T.qrCell = drawQR(ctx, P.qr, pad, top + pad, W - pad * 2);
          if (P.text1) drawText(ctx, P.text1, P.font, W / 2, top + W + textH * 0.35, W - pad * 2, textH * 0.7);
        },
      };
      return T;
    },
  },
  logo: {
    label: 'شكل الشعار', icon: '🖼️', sizeLabel: 'العرض', group: 'general', def: 50,
    build(P) {
      const st = P.logoShape || P.logoStencil;
      const W = P.size;
      const ar = st ? st.height / st.width : 1;
      const top = W * 0.12;
      const H = top + W * ar + 2;
      return {
        W, H, base: new Path2D(), hole: [W / 2, top * 0.75], pixelLogo: { x: 0, y: top, w: W, h: W * ar },
        backBox: { cx: W / 2, cy: top + W * ar / 2, w: W * 0.6, h: W * ar * 0.4 },
        raised() {}, text() {},
      };
    },
  },
  crescent: {
    label: 'هلال رمضان', icon: '🌙', sizeLabel: 'العرض', group: 'occasion', def: 55,
    build(P) {
      const W = P.size, R = W * 0.32, cx = W * 0.48, cy = W * 0.36;
      const py = cy + R * 0.55, ph = W * 0.34;
      const tab = [cx - 0.72 * R, cy - 0.72 * R];
      const base = new Path2D();
      circle(base, cx, cy, R);
      roundRect(base, W * 0.06, py, W * 0.88, ph, W * 0.08);
      circle(base, tab[0], tab[1], W * 0.085);
      const plaque = new Path2D(); roundRect(plaque, W * 0.06, py, W * 0.88, ph, W * 0.08);
      return {
        W, H: py + ph + 1, base, hole: tab, holeR: W * 0.045,
        logoBox: [W * 0.7, py + ph * 0.1, W * 0.18, ph * 0.3],
        backBox: { cx: W / 2, cy: py + ph / 2, w: W * 0.7, h: ph * 0.5 },
        extraBase(ctx) {
          ctx.save(); ctx.globalCompositeOperation = 'destination-out';
          ctx.beginPath(); ctx.arc(cx + R * 0.4, cy - R * 0.2, R * 0.8, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          ctx.fill(plaque);
          ctx.beginPath(); ctx.arc(tab[0], tab[1], W * 0.085, 0, Math.PI * 2); ctx.fill();
        },
        raised(ctx) { if (P.decor) star(ctx, cx - R * 0.72, cy + R * 0.18, R * 0.16); },
        text(ctx, Hh) {
          Hh.name(W / 2, py + ph * 0.4, W * 0.74, ph * 0.46);
          Hh.sub(W / 2, py + ph * 0.8, W * 0.6, ph * 0.18);
        },
      };
    },
  },
  lantern: {
    label: 'فانوس', icon: '🏮', sizeLabel: 'الارتفاع', group: 'occasion', def: 60,
    build(P) {
      const u = P.size / 60, s = (v) => v * u, W = s(36), H = s(60);
      const base = new Path2D();
      circle(base, s(18), s(5), s(4.5));
      base.rect(s(16), s(8.5), s(4), s(3));
      base.moveTo(s(10), s(16)); base.lineTo(s(26), s(16)); base.lineTo(s(18), s(9)); base.closePath();
      roundRect(base, s(7), s(15), s(22), s(3), s(1));
      base.moveTo(s(8), s(18)); base.lineTo(s(28), s(18)); base.lineTo(s(31), s(30)); base.lineTo(s(28), s(46)); base.lineTo(s(8), s(46)); base.lineTo(s(5), s(30)); base.closePath();
      roundRect(base, s(7), s(45.5), s(22), s(3), s(1));
      base.moveTo(s(12), s(48.5)); base.lineTo(s(24), s(48.5)); base.lineTo(s(18), s(55.5)); base.closePath();
      circle(base, s(18), s(56.5), s(2));
      return {
        W, H, base, hole: [s(18), s(5)], holeR: s(2.6),
        logoBox: [s(13), s(37), s(10), s(6)],
        backBox: { cx: s(18), cy: s(31), w: s(16), h: s(14) },
        raised(ctx, lw) {
          ctx.lineWidth = lw;
          ctx.beginPath(); roundRect(ctx, s(10), s(21), s(16), s(22), s(2)); ctx.stroke();
          if (P.decor) { ctx.beginPath(); ctx.moveTo(s(10), s(21)); ctx.quadraticCurveTo(s(18), s(16.5), s(26), s(21)); ctx.stroke(); }
        },
        text(ctx, Hh) {
          Hh.name(s(18), s(28.5), s(14.5), s(7));
          if (!Hh.decorLogo) Hh.sub(s(18), s(37.5), s(13), s(4));
        },
      };
    },
  },
  qatar: {
    label: 'علم قطر', icon: '🇶🇦', sizeLabel: 'العرض', group: 'occasion', def: 60,
    build(P) {
      const W = P.size, H = W * 0.5, x0 = W * 0.26, dp = W * 0.08;
      const base = new Path2D(); roundRect(base, 0, 0, W, H, W * 0.05);
      return {
        W, H, base, hole: [W * 0.1, H / 2], holeR: Math.min(P.hole / 2, H * 0.14),
        logoBox: [W * 0.78, H * 0.08, W * 0.16, H * 0.26],
        backBox: { cx: W / 2, cy: H / 2, w: W * 0.7, h: H * 0.5 },
        raised(ctx) {
          // الشريط الأبيض بتسعة رؤوس مسننة
          ctx.beginPath(); ctx.moveTo(-1, -1); ctx.lineTo(x0, -1);
          for (let i = 0; i < 9; i++) { ctx.lineTo(x0 + dp, ((i + 0.5) * H) / 9); ctx.lineTo(x0, ((i + 1) * H) / 9); }
          ctx.lineTo(-1, H + 1); ctx.closePath(); ctx.fill();
        },
        text(ctx, Hh) {
          const L = x0 + dp + W * 0.04, cx = (L + W) / 2;
          Hh.name(cx, H * 0.42, W - L - W * 0.06, H * 0.42);
          Hh.sub(cx, H * 0.78, W - L - W * 0.08, H * 0.14);
        },
      };
    },
  },
  gradcap: {
    label: 'قبعة تخرّج', icon: '🎓', sizeLabel: 'العرض', group: 'occasion', def: 55,
    build(P) {
      const W = P.size, H = W * 0.84;
      const base = new Path2D();
      base.moveTo(W / 2, 0); base.lineTo(W, W * 0.2); base.lineTo(W / 2, W * 0.4); base.lineTo(0, W * 0.2); base.closePath();
      base.rect(W * 0.24, W * 0.26, W * 0.52, W * 0.24);
      roundRect(base, W * 0.06, W * 0.48, W * 0.88, W * 0.34, W * 0.08);
      return {
        W, H, base, hole: [W / 2, W * 0.17], holeR: Math.min(P.hole / 2, W * 0.05),
        logoBox: [W * 0.4, W * 0.7, W * 0.2, W * 0.1],
        backBox: { cx: W / 2, cy: W * 0.65, w: W * 0.74, h: W * 0.24 },
        extraBase(ctx) {
          ctx.lineWidth = W * 0.025; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(W * 0.8, W * 0.24); ctx.lineTo(W * 0.86, W * 0.27); ctx.lineTo(W * 0.86, W * 0.48); ctx.stroke();
        },
        raised(ctx, lw) {
          if (!P.decor) return;
          ctx.lineWidth = lw; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(W / 2, W * 0.2); ctx.lineTo(W * 0.8, W * 0.24); ctx.stroke();
        },
        text(ctx, Hh) {
          Hh.name(W / 2, W * 0.61, W * 0.76, W * 0.15);
          if (!Hh.decorLogo) Hh.sub(W / 2, W * 0.745, W * 0.66, W * 0.06);
        },
      };
    },
  },
  rings: {
    label: 'خاتمين (زواج)', icon: '💍', sizeLabel: 'العرض', group: 'occasion', def: 55,
    build(P) {
      const W = P.size, o = W * 0.05, r = W * 0.2, lw = W * 0.07;
      const c1 = [W * 0.37, o + W * 0.27], c2 = [W * 0.63, o + W * 0.27];
      const py = o + W * 0.47, ph = W * 0.3, H = py + ph + 1;
      const base = new Path2D();
      roundRect(base, W * 0.08, py, W * 0.84, ph, W * 0.08);
      const dy = c2[1] - r - lw / 2;
      base.moveTo(c2[0], dy - W * 0.05); base.lineTo(c2[0] + W * 0.045, dy); base.lineTo(c2[0], dy + W * 0.03); base.lineTo(c2[0] - W * 0.045, dy); base.closePath();
      const clip = new Path2D(base); circle(clip, c1[0], c1[1], r + lw / 2); circle(clip, c2[0], c2[1], r + lw / 2);
      return {
        W, H, base, clipPath: clip, noHole: true,
        logoBox: [W * 0.42, py + ph * 0.66, W * 0.16, ph * 0.26],
        backBox: { cx: W / 2, cy: py + ph / 2, w: W * 0.7, h: ph * 0.6 },
        extraBase(ctx) {
          ctx.lineWidth = lw;
          for (const [x, y] of [c1, c2]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }
        },
        raised() {},
        text(ctx, Hh) {
          Hh.name(W / 2, py + ph * 0.42, W * 0.72, ph * 0.5);
          if (!Hh.decorLogo) Hh.sub(W / 2, py + ph * 0.8, W * 0.5, ph * 0.18);
        },
      };
    },
  },
  baby: {
    label: 'ملابس مولود', icon: '👶', sizeLabel: 'العرض', group: 'occasion', def: 50,
    build(P) {
      const W = P.size, H = W * 0.97;
      const base = new Path2D();
      base.moveTo(W * 0.28, W * 0.08); base.quadraticCurveTo(W * 0.5, W * 0.26, W * 0.72, W * 0.08);
      base.lineTo(W * 0.95, W * 0.22); base.lineTo(W * 0.84, W * 0.38); base.lineTo(W * 0.74, W * 0.32);
      base.lineTo(W * 0.74, W * 0.78); base.quadraticCurveTo(W * 0.66, W * 0.86, W * 0.62, W * 0.95);
      base.lineTo(W * 0.38, W * 0.95); base.quadraticCurveTo(W * 0.34, W * 0.86, W * 0.26, W * 0.78);
      base.lineTo(W * 0.26, W * 0.32); base.lineTo(W * 0.16, W * 0.38); base.lineTo(W * 0.05, W * 0.22); base.closePath();
      circle(base, W * 0.27, W * 0.075, W * 0.075);
      return {
        W, H, base, hole: [W * 0.27, W * 0.075], holeR: Math.min(P.hole / 2, W * 0.04),
        logoBox: [W * 0.4, W * 0.68, W * 0.2, W * 0.12],
        backBox: { cx: W / 2, cy: W * 0.55, w: W * 0.4, h: W * 0.3 },
        raised(ctx, lw) {
          if (!P.decor) return;
          ctx.lineWidth = lw;
          for (const x of [0.44, 0.5, 0.56]) { ctx.beginPath(); ctx.arc(W * x, W * 0.88, W * 0.012, 0, Math.PI * 2); ctx.fill(); }
        },
        text(ctx, Hh) {
          Hh.name(W / 2, W * 0.47, W * 0.42, W * 0.14);
          if (!Hh.decorLogo) Hh.sub(W / 2, W * 0.62, W * 0.4, W * 0.06);
        },
      };
    },
  },
  plaque: {
    label: 'لوحة باب / مكتب', icon: '🚪', sizeLabel: 'العرض', group: 'home', def: 150, max: 220,
    build(P) {
      const W = P.size, H = W * 0.36, hr = Math.min(P.hole / 2, W * 0.018);
      const base = new Path2D(); roundRect(base, 0, 0, W, H, H * 0.12);
      const ix = W * 0.085, iy = H * 0.12;
      return {
        W, H, base, hole: [W * 0.042, H / 2], holeR: hr, holeFixed: true, extraHoles: [[W * 0.958, H / 2, hr]],
        logoBox: [W / 2 - H * 0.2, iy + H * 0.06, H * 0.4, H * 0.22],
        backBox: { cx: W / 2, cy: H / 2, w: W * 0.6, h: H * 0.4 },
        raised(ctx, lw, Hh) {
          ctx.lineWidth = lw;
          ctx.beginPath(); roundRect(ctx, ix, iy, W - ix * 2, H - iy * 2, H * 0.08); ctx.stroke();
          if (P.decor) for (const [x, y] of [[ix, iy], [W - ix, iy], [ix, H - iy], [W - ix, H - iy]]) {
            const d = H * 0.06; ctx.beginPath(); ctx.moveTo(x, y - d); ctx.lineTo(x + d, y); ctx.lineTo(x, y + d); ctx.lineTo(x - d, y); ctx.closePath(); ctx.fill();
          }
        },
        text(ctx, Hh) {
          const top = Hh.decorLogo ? iy + H * 0.3 : iy;
          if (P.text2) {
            Hh.name(W / 2, top + (H - iy - top) * 0.42, W - ix * 2.6, (H - iy - top) * 0.5);
            Hh.sub(W / 2, top + (H - iy - top) * 0.8, W - ix * 3, (H - iy - top) * 0.17);
          } else Hh.name(W / 2, (top + H - iy) / 2, W - ix * 2.6, (H - iy - top) * 0.62);
        },
      };
    },
  },
  coaster: {
    label: 'مسند أكواب', icon: '⭕', sizeLabel: 'القطر', group: 'home', def: 90,
    build(P) {
      const W = P.size, R = W / 2;
      const base = new Path2D();
      circle(base, R, R, R);
      return {
        W, H: W, base, noHole: true,
        logoBox: [R - R * 0.27, R - R * 0.66, R * 0.54, R * 0.3],
        backBox: { cx: R, cy: R, w: R * 1.2, h: R * 0.6 },
        raised(ctx, lw) {
          ctx.lineWidth = lw * 1.2;
          ctx.beginPath(); ctx.arc(R, R, R * 0.8, 0, Math.PI * 2); ctx.stroke();
          if (P.decor) {
            for (let k = 0; k < 14; k++) {
              const a = (k / 14) * Math.PI * 2;
              ctx.save(); ctx.translate(R + Math.cos(a) * R * 0.9, R + Math.sin(a) * R * 0.9); ctx.rotate(a);
              ctx.beginPath(); ctx.ellipse(0, 0, R * 0.035, R * 0.055, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
            }
          }
        },
        text(ctx, Hh) {
          Hh.name(R, R - (P.text2 ? R * 0.08 : 0), R * 1.3, R * 0.32);
          Hh.sub(R, R + R * 0.3, R * 1.0, R * 0.12);
        },
      };
    },
  },
  stand: {
    label: 'ستاند طاولة', icon: '🪧', sizeLabel: 'العرض', group: 'home', def: 70,
    build(P) {
      const W = P.size, Hp = W * 1.25, tabH = 8, tabW = W * 0.6;
      const gap = 6, bw = W * 0.8, bd = 26, bx = W + gap;
      const plate = new Path2D();
      roundRect(plate, 0, 0, W, Hp, W * 0.08);
      plate.rect((W - tabW) / 2, Hp - 1, tabW, tabH + 1);
      const border = new Path2D(); roundRect(border, 0, 0, W, Hp, W * 0.08);
      const hasQR = !!P.qr;
      const T = {
        W: bx + bw, H: Hp + tabH, base: plate, borderPath: border, noHole: true, noBack: true,
        logoBox: [W * 0.3, W * 0.06, W * 0.4, W * 0.14],
        raised() {},
        text(ctx, Hh) {
          if (hasQR) {
            const q = W * 0.66, qy = Hh.decorLogo ? W * 0.24 : W * 0.1;
            T.qrCell = drawQR(ctx, P.qr, (W - q) / 2, qy, q);
            const ty = qy + q + W * 0.1;
            Hh.name(W / 2, ty, W * 0.8, W * 0.13);
            Hh.sub(W / 2, ty + W * 0.12, W * 0.7, W * 0.06);
          } else {
            Hh.name(W / 2, Hp * 0.45, W * 0.82, W * 0.3);
            Hh.sub(W / 2, Hp * 0.66, W * 0.7, W * 0.09);
          }
        },
        // قاعدة منفصلة فيها شق لتثبيت اللوحة واقفة
        extraLayers(mk, read) {
          const slotW = tabW + 0.6, slotT = P.baseH + 0.4;
          const by = (Hp + tabH) / 2 - bd / 2;
          const full = mk(); const p = new Path2D(); roundRect(p, bx, by, bw, bd, 4); full.ctx.fill(p);
          const fF = read(full);
          const sl = mk(); sl.ctx.fillRect(bx + (bw - slotW) / 2, by + bd / 2 - slotT / 2, slotW, slotT);
          const sF = read(sl);
          const up = new Float32Array(fF.length);
          for (let k = 0; k < up.length; k++) up[k] = Math.min(fF[k], 1 - sF[k]);
          return [{ f: fF, z0: 0, z1: 4, part: 'base' }, { f: up, z0: 4, z1: 4 + tabH + 1, part: 'base' }];
        },
      };
      return T;
    },
  },
};

/**
 * يصنع من صورة الشعار قناعين بنفس القص: shape (الشكل الخارجي) و detail (التفاصيل الداكنة داخله)
 * الأبيض = موجود، الشفاف = فارغ
 */
export function makeStencil(src, { hasAlpha, threshold = 128, invert = false }) {
  const iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height;
  const s = Math.min(1, 900 / Math.max(iw, ih));
  const W = Math.round(iw * s), H = Math.round(ih * s);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(src, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data;
  const shape = new Uint8Array(W * H), detail = new Uint8Array(W * H);
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let k = 0; k < W * H; k++) {
    const a = d[k * 4 + 3];
    const lum = 0.299 * d[k * 4] + 0.587 * d[k * 4 + 1] + 0.114 * d[k * 4 + 2];
    const dark = invert ? lum >= threshold : lum < threshold;
    const sh = hasAlpha ? a > 127 : a > 20 && dark;
    const de = sh && dark;
    shape[k] = sh ? 1 : 0; detail[k] = de ? 1 : 0;
    if (sh) { const i = k % W, j = (k / W) | 0; x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j); }
  }
  if (x1 <= x0) { x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1; }
  const mk = (m) => {
    const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
    const ox = o.getContext('2d'); const im = ox.createImageData(o.width, o.height);
    for (let j = 0; j < o.height; j++) for (let i = 0; i < o.width; i++) {
      if (!m[(j + y0) * W + i + x0]) continue;
      const q = (j * o.width + i) * 4; im.data[q] = im.data[q + 1] = im.data[q + 2] = im.data[q + 3] = 255;
    }
    ox.putImageData(im, 0, 0); return o;
  };
  return { shape: mk(shape), detail: mk(detail) };
}
function drawFit(ctx, img, x, y, w, h) {
  if (!img || w <= 0 || h <= 0) return;
  const s = Math.min(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function erodeOpenLoss(bin, w, h, r) {
  let on = 0; for (let k = 0; k < bin.length; k++) on += bin[k];
  if (on < 50) return 0;
  const inv = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) inv[k] = bin[k] ? 0 : 1;
  const er = dilate(inv, w, h, r); for (let k = 0; k < er.length; k++) er[k] = er[k] ? 0 : 1;
  const op = dilate(er, w, h, r);
  let lost = 0; for (let k = 0; k < bin.length; k++) if (bin[k] && !op[k]) lost++;
  return lost / on;
}

/** يرسم القالب ويرجع حقول الأشكال وطبقات البثق */
export function rasterize(P) {
  const hasLogo = !!P.logoStencil && P.template !== 'logo';
  P = { ...P, _hasDecorLogo: hasLogo && P.logoPlace === 'decor' };
  const T = TEMPLATES[P.template].build(P);
  const px = P.res, m = 1.0;
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
  const warns = [];

  // القاعدة
  const B = mk();
  B.ctx.fill(T.base);
  if (T.extraBase) T.extraBase(B.ctx);
  let baseF = read(B);
  let logoF = null;
  if (T.pixelLogo && P.logoStencil) {
    const { x, y, w: lw, h: lh } = T.pixelLogo;
    const L = mk(); L.ctx.drawImage(P.logoShape || P.logoStencil, x, y, lw, lh);
    const D = mk(); D.ctx.drawImage(P.logoStencil, x, y, lw, lh);
    const lf = read(L), df = read(D);
    let shapeMask = new Uint8Array(N), logoMask = new Uint8Array(N);
    for (let k = 0; k < N; k++) { shapeMask[k] = lf[k] > 0.5 ? 1 : 0; logoMask[k] = df[k] > 0.5 ? 1 : 0; }
    shapeMask = keepLargest(shapeMask, w, h, 0.004).mask;
    // إذا التفاصيل تغطي كل الشكل تقريباً نخلي الخلفية بارزة كلها (شعار مصمت)
    for (let k = 0; k < N; k++) if (!shapeMask[k]) logoMask[k] = 0;
    const back = dilate(shapeMask, w, h, Math.max(1, Math.round(P.logoOutline / px)));
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
  } else if (T.pixelLogo) {
    warns.push('ارفع صورة الشعار من القائمة الجانبية.');
  }

  // الثقب
  let holeF = new Float32Array(N), holeR = 0;
  if (!T.noHole) {
    const Hh = mk();
    holeR = T.holeFixed ? T.holeR : Math.min(P.hole / 2, T.holeR ?? Infinity);
    Hh.ctx.beginPath(); Hh.ctx.arc(T.hole[0], T.hole[1], holeR, 0, Math.PI * 2); Hh.ctx.fill();
    for (const [x, y, r] of T.extraHoles || []) { Hh.ctx.beginPath(); Hh.ctx.arc(x, y, r, 0, Math.PI * 2); Hh.ctx.fill(); }
    holeF = read(Hh);
  }

  // مساعدات الرسم
  const helper = (ctx) => ({
    decorLogo: false,
    name(cx, cy, mw, mh) {
      if (hasLogo && P.logoPlace === 'name') drawFit(ctx, P.logoStencil, cx - mw / 2, cy - mh * 0.7, mw, mh * 1.4);
      else drawText(ctx, P.text1, P.font, cx, cy, mw, mh);
    },
    sub(cx, cy, mw, mh) { drawText(ctx, P.text2, P.font, cx, cy, mw, mh, 700); },
  });

  // البارز: إطار + خطوط ديكور
  const Rr = mk();
  const hr = helper(Rr.ctx); hr.decorLogo = P._hasDecorLogo && !!T.logoBox;
  Rr.ctx.save(); Rr.ctx.clip(T.clipPath || T.base); T.raised(Rr.ctx, P.lineW, hr); Rr.ctx.restore();
  if (P.border && !T.noHole) {
    Rr.ctx.lineWidth = P.borderW;
    for (const [x, y, r] of [[T.hole[0], T.hole[1], holeR], ...(T.extraHoles || [])]) { Rr.ctx.beginPath(); Rr.ctx.arc(x, y, r + P.borderW / 2, 0, Math.PI * 2); Rr.ctx.stroke(); }
  }
  const raisedF = read(Rr);
  // الإطار البارز = حافة الشكل الخارجية فقط (من الحقل، حتى لا تظهر خطوط تداخل الأجزاء)
  if (P.border && !logoF) {
    let src = baseF;
    if (T.borderPath) { const Bp = mk(); Bp.ctx.fill(T.borderPath); src = read(Bp); }
    const inv = new Uint8Array(N); for (let k = 0; k < N; k++) inv[k] = src[k] >= 0.5 ? 0 : 1;
    const outer = dilate(inv, w, h, Math.max(1, Math.round(P.borderW / px)));
    const ring = new Float32Array(N); for (let k = 0; k < N; k++) ring[k] = src[k] >= 0.5 && outer[k] ? 1 : 0;
    const rb = boxBlur(ring, w, h, 1);
    for (let k = 0; k < N; k++) raisedF[k] = Math.max(raisedF[k], Math.min(rb[k], src[k]));
  }

  // النص والشعار
  const X = mk();
  const hx = helper(X.ctx); hx.decorLogo = hr.decorLogo;
  T.text(X.ctx, hx);
  if (hx.decorLogo) { const [lx, ly, lw, lh] = T.logoBox; drawFit(X.ctx, P.logoStencil, lx, ly, lw, lh); }
  const textF = logoF || read(X);

  // الوجه الخلفي (محفور ومعبأ بلون ثانٍ)
  let backF = null;
  if (P.back && P.back !== 'none' && !T.noBack && T.backBox) {
    const Bk = mk(); const bb = T.backBox;
    Bk.ctx.translate(T.W, 0); Bk.ctx.scale(-1, 1);
    if (P.back === 'qr') {
      const q = Math.min(bb.w, bb.h);
      const cell = drawQR(Bk.ctx, P.qr, T.W - bb.cx - q / 2, bb.cy - q / 2, q);
      if (cell && cell < 0.9) warns.push(`مربعات QR في الخلف صغيرة (${cell.toFixed(2)} مم) — كبّر المقاس أو اختصر الرابط.`);
    } else drawText(Bk.ctx, P.backText, P.font, T.W - bb.cx, bb.cy, bb.w, Math.min(bb.h, bb.w * 0.3));
    backF = read(Bk);
  }

  // الحقول النهائية
  const solidF = new Float32Array(N), accF = new Float32Array(N), engF = new Float32Array(N);
  const engraved = P.textMode === 'engraved';
  for (let k = 0; k < N; k++) {
    const s = Math.min(baseF[k], 1 - holeF[k]);
    solidF[k] = s;
    if (engraved) { engF[k] = Math.min(s, textF[k]); accF[k] = Math.min(s, raisedF[k], 1 - textF[k]); }
    else accF[k] = Math.min(s, Math.max(raisedF[k], textF[k]));
  }
  const backD = backF ? Math.min(0.8, P.baseH * 0.3) : 0;
  let depth = engraved ? Math.min(P.raiseH, P.baseH - 0.6 - backD) : 0;
  if (engraved && depth < 0.4) { depth = 0.4; warns.push('القاعدة رقيقة على الحفر من الوجهين — زد سماكة القاعدة.'); }
  const cuts = [0];
  if (backF) cuts.push(backD);
  if (engraved) cuts.push(P.baseH - depth);
  cuts.push(P.baseH);
  const layers = [];
  for (let c = 0; c < cuts.length - 1; c++) {
    const z0 = cuts[c], z1 = cuts[c + 1];
    let f = solidF;
    const cutBack = backF && z1 <= backD + 1e-6, cutEng = engraved && z0 >= P.baseH - depth - 1e-6;
    if (cutBack || cutEng) {
      f = new Float32Array(N);
      for (let k = 0; k < N; k++) {
        let v = solidF[k];
        if (cutBack) v = Math.min(v, 1 - backF[k]);
        if (cutEng) v = Math.min(v, 1 - engF[k]);
        f[k] = v;
      }
    }
    layers.push({ f, z0, z1, part: 'base' });
  }
  layers.push({ f: accF, z0: P.baseH, z1: P.baseH + P.raiseH, part: 'accent' });
  if (backF) {
    const bf = new Float32Array(N); for (let k = 0; k < N; k++) bf[k] = Math.min(solidF[k], backF[k]);
    layers.push({ f: bf, z0: 0, z1: backD, part: 'accent' });
  }
  if (T.extraLayers) layers.push(...T.extraLayers(mk, read));

  // فحص الدقة: هل في خطوط أرق من الفوهة؟
  const r = Math.max(1, Math.round((P.nozzle || 0.4) / 2 / px));
  const bin = (f) => { const b = new Uint8Array(N); for (let k = 0; k < N; k++) b[k] = f[k] >= 0.5 ? 1 : 0; return b; };
  const lossFront = erodeOpenLoss(bin(engraved ? engF : accF), w, h, r);
  if (lossFront > 0.12) warns.push(`حوالي ${Math.round(lossFront * 100)}٪ من خطوط النص/الزخرفة أرق من فوهة ${P.nozzle || 0.4} مم وقد لا تُطبع — كبّر المقاس أو اختر خطاً أعرض (Lalezar مثلاً).`);
  if (backF && erodeOpenLoss(bin(backF), w, h, r) > 0.15) warns.push('نص الوجه الخلفي رفيع جداً — كبّر المقاس أو اختصر النص.');
  if (T.qrCell && T.qrCell < 0.9) warns.push(`مربعات الـ QR صغيرة (${T.qrCell.toFixed(2)} مم) — كبّر العرض أو اختصر الرابط ليُقرأ بعد الطباعة.`);

  return { layers, w, h, px, m, W: T.W, H: T.H, solidF, accF, engF, backF, warns, backD, depth, colorZ: backF ? [backD, P.baseH] : [P.baseH] };
}

/** يبني المجسمات: {base, accent} كل منها مجموعة أجسام مغلقة */
export function buildSolids(R) {
  const out = { base: [], accent: [] };
  for (const L of R.layers) {
    const t = fieldToSolid(L.f, R.w, R.h, R.px, L.z0, L.z1);
    if (t.length) out[L.part].push(t);
  }
  return { base: mergeTris(out.base), accent: mergeTris(out.accent) };
}

/** نفس buildSolids لكن في عامل خلفي (مع رجوع للطريقة العادية لو ما اشتغل) */
let worker = null, wid = 0;
const waiting = new Map();
export function buildSolidsAsync(R) {
  try {
    if (!worker) {
      worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => { const p = waiting.get(data.id); if (!p) return; waiting.delete(data.id); data.error ? p.reject(new Error(data.error)) : p.resolve({ base: data.base, accent: data.accent }); };
      worker.onerror = () => { for (const p of waiting.values()) p.fallback(); waiting.clear(); worker = 'broken'; };
    }
    if (worker === 'broken') return Promise.resolve(buildSolids(R));
    const id = ++wid;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject, fallback: () => resolve(buildSolids(R)) });
      worker.postMessage({ id, w: R.w, h: R.h, px: R.px, layers: R.layers.map((L) => ({ f: L.f, z0: L.z0, z1: L.z1, part: L.part })) });
    });
  } catch { return Promise.resolve(buildSolids(R)); }
}
