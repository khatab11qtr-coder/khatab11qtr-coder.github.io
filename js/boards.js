// علب لوحات الإلكترونيات: قواعد تثبيت + فتحات المنافذ + غطاء بحافة + تهوية + آذان تثبيت + ملصق نصي
// أبعاد اللوحات وأماكن الثقوب والمنافذ تقريبية من المواصفات المعروفة — تحقق منها بالمسطرة قبل الطباعة.
import { mergeTris } from './mesh.js';
import { revolve, box, orient } from './cup3d.js';
import { deco } from './shapes.js';
import { plate, cut, mapT } from './plate.js';
import { TOL } from './tol.js';

/** منافذ شائعة: [العرض، الارتفاع، الإزاحة الرأسية عن سطح اللوحة] مع هامش للقابس */
export const PORT_TYPES = {
  usbc: ['USB-C', 10, 4.5, -0.3], micro: ['Micro-USB', 8.5, 4, -0.3], mini: ['Mini-USB', 9.5, 4.5, -0.3], usba: ['USB-A', 15, 16.5, -0.5], usbb: ['USB-B', 12.5, 11, -0.5],
  hdmi: ['HDMI', 16, 7, -0.3], mhdmi: ['Micro-HDMI', 8.5, 4.5, -0.3], eth: ['Ethernet', 16.5, 14, -0.5], dc: ['DC jack', 9.5, 11, -0.5],
  audio: ['3.5mm', 7.5, 7.5, -0.5], sd: ['SD', 13, 3, -1.8], led: ['LED / زر مربع', 6, 6, 0], custom: ['مخصص', 10, 6, 0],
  // [الاسم، العرض/القطر، الارتفاع، الإزاحة، دائري؟، افتراضياً على الغطاء؟]
  led3: ['LED دائري 3 مم', 3.4, 3.4, 2, 1, 1], led5: ['LED دائري 5 مم', 5.4, 5.4, 2, 1, 1], btn6: ['زر دائري 6 مم', 6.4, 6.4, 2, 1, 1], btn12: ['زر دائري 12 مم', 12.3, 12.3, 2, 1, 1],
  pot: ['مقبض بوتنشيومتر 7 مم', 7.4, 7.4, 2, 1, 1], switch12: ['مفتاح تشغيل 12 مم', 12.2, 12.2, 2, 1, 0], cable: ['مخرج سلك 6 مم', 6.2, 6.2, 0, 1, 0], dcr: ['مقبس DC دائري 8 مم', 8.2, 8.2, 2, 1, 0],
  oled: ['نافذة شاشة OLED 0.96"', 26, 14.5, 0, 0, 1], lcd: ['نافذة شاشة LCD 16×2', 65, 16.5, 0, 0, 1],
};
const P = (type, wall, pos, o = {}) => ({ type, wall, pos, w: PORT_TYPES[type][1], h: PORT_TYPES[type][2], z: PORT_TYPES[type][3], round: !!PORT_TYPES[type][4], ...o });
export const BOARDS = {
  uno: { n: 'Arduino Uno R3', w: 68.6, d: 53.3, mount: 'holes', holes: [[14, 2.5], [15.3, 50.7], [66.1, 7.6], [66.1, 35.5]], hole: 3.2, head: 14, sh: 5, ports: [P('usbb', 'left', 38.1), P('dc', 'left', 7.6)] },
  mega: { n: 'Arduino Mega 2560', w: 101.6, d: 53.3, mount: 'holes', holes: [[14, 2.5], [15.3, 50.8], [66.1, 7.6], [66.1, 35.6], [90.2, 50.8], [96.5, 2.5]], hole: 3.2, head: 14, sh: 5, ports: [P('usbb', 'left', 38.1), P('dc', 'left', 7.6)] },
  pi4: { n: 'Raspberry Pi 4 / 3B+', w: 85, d: 56, mount: 'holes', holes: [[3.5, 3.5], [61.5, 3.5], [3.5, 52.5], [61.5, 52.5]], hole: 2.7, head: 17, sh: 5, ports: [P('eth', 'right', 10.2), P('usba', 'right', 29), P('usba', 'right', 47), P('usbc', 'front', 11.2), P('mhdmi', 'front', 26), P('mhdmi', 'front', 39.5), P('audio', 'front', 53.5)] },
  pizero: { n: 'Raspberry Pi Zero 2 W', w: 65, d: 30, mount: 'holes', holes: [[3.5, 3.5], [61.5, 3.5], [3.5, 26.5], [61.5, 26.5]], hole: 2.7, head: 8, sh: 5, ports: [P('mhdmi', 'front', 12.4, { w: 12 }), P('micro', 'front', 41.4), P('micro', 'front', 54)] },
  esp32: { n: 'ESP32 DevKit (30 pin)', w: 51.5, d: 28.5, mount: 'ends', holes: [], hole: 2.7, head: 10, sh: 10, ports: [P('micro', 'left', 14.2)] },
  nano: { n: 'Arduino Nano', w: 43.2, d: 18.5, mount: 'ends', holes: [], hole: 2.7, head: 9, sh: 8, ports: [P('mini', 'left', 9.25)] },
  pico: { n: 'Raspberry Pi Pico', w: 51, d: 21, mount: 'ends', holes: [], hole: 2.1, head: 9, sh: 4, ports: [P('micro', 'left', 10.5)] },
  custom: { n: 'لوحة مخصصة', w: 60, d: 40, mount: 'holes', holes: [[3.5, 3.5], [56.5, 3.5], [3.5, 36.5], [56.5, 36.5]], hole: 3, head: 12, sh: 5, ports: [] },
};
export const newPort = (type = 'usbc') => { const t = PORT_TYPES[type]; return P(type, t[5] ? 'lid' : 'left', 10, t[5] ? { z: 10 } : {}); };

const shift = (t, dx, dy, dz = 0) => { for (let k = 0; k < t.length; k += 3) { t[k] += dx; t[k + 1] += dy; t[k + 2] += dz; } return t; };

export function buildBoard(B) {
  const T = B.wall, c = B.mount === 'holes' ? B.clear : Math.max(B.clear, 1.7), sh = B.sh, pcb = 1.6, fasten = B.fasten || 'friction', screws = B.lid && fasten === 'screws', snap = B.lid && fasten === 'snap';
  const scr = B.screw || 3, OD = scr + 4.2, ext = screws ? OD + 0.6 : 0, cx = c + ext, cy = c + ext;
  const iw = B.w + 2 * cx, id = B.d + 2 * cy, ih = sh + pcb + B.head, H = T + ih, ow = iw + 2 * T, od = id + 2 * T;
  const parts = [], body = [], ov = 0.06;
  const zPcb = T + sh + pcb;
  // الأرضية (+ آذان التثبيت)
  const ear = B.ears ? 16 : 0, FL = ow + 2 * ear;
  body.push(mapT(plate(FL, od, T, (x) => {
    x.fillRect(0, 0, FL, od);
    if (B.ears) { x.globalCompositeOperation = 'destination-out'; for (const ex of [ear / 2, FL - ear / 2]) { x.beginPath(); x.arc(ex, od / 2, 2.4, 0, Math.PI * 2); x.fill(); } x.globalCompositeOperation = 'source-over'; }
  }), (u, v, t) => [u - FL / 2, v - od / 2, t]));
  // المنافذ والتهوية
  const holes = { front: [], back: [], left: [], right: [] }, circ = { front: [], back: [], left: [], right: [] }, lidRects = [], lidCircs = [];
  for (const p of B.ports) {
    if (p.wall === 'lid') { const u = T + cx + p.pos, v = T + cy + p.z; if (B.lid) (p.round ? lidCircs.push([u, v, (p.w + TOL.hole) / 2]) : lidRects.push([u, v, p.w + TOL.hole, p.h + TOL.hole])); continue; }
    if (!holes[p.wall]) continue;
    const along = p.wall === 'back' ? ow - (T + cx + p.pos) : p.wall === 'front' ? T + cx + p.pos : T + cy + p.pos; // pos يُقاس من حافة اللوحة اليسرى (أمامي/خلفي) أو الأمامية (يمين/يسار)
    const zc = Math.min(H - 1.5, Math.max(T + 1.2, zPcb + p.z + p.h / 2));
    if (p.round) circ[p.wall].push([along, zc, (p.w + TOL.hole) / 2]); else holes[p.wall].push([along, zc, p.w + TOL.hole, Math.min(p.h + TOL.hole, H - 1 - (zc - p.h / 2))]);
  }
  if (B.vents === 'sides' || B.vents === 'both') {
    const n = Math.max(1, Math.min(14, Math.floor((id - 8) / 5))), zc = T + ih * 0.55;
    for (const w of ['left', 'right']) for (let i = 0; i < n; i++) holes[w].push([T + ((i + 0.5) * id) / n, zc, 2.2, ih * 0.45]);
  }
  if (snap) for (const w of ['front', 'back']) holes[w].push([ow / 2, H - 2.15, 10 + TOL.hole, 2.5 + TOL.hole]);
  const wallPlate = (L, list, cl = []) => plate(L, H, T + ov, (x) => { x.fillRect(0, 0, L, H); cut(x, list, cl); });
  const long = ow, short = id; // الأمامي/الخلفي بطول ow الكامل، واليمين/اليسار بين الاثنين
  body.push(mapT(wallPlate(long, holes.front, circ.front), (u, v, t) => [u - ow / 2, -id / 2 - T + t, v]));
  body.push(mapT(wallPlate(long, holes.back, circ.back), (u, v, t) => [ow / 2 - u, id / 2 - ov + t, v]));
  const side = (list, cl) => wallPlate(short + 2 * ov, list.map(([u, z, w, h]) => [u - T + ov, z, w, h]), cl.map(([u, z, r]) => [u - T + ov, z, r]));
  body.push(mapT(side(holes.left, circ.left), (u, v, t) => [-iw / 2 - T + t, u - id / 2 - ov, v]));
  body.push(mapT(side(holes.right, circ.right), (u, v, t) => [iw / 2 - ov + t, u - id / 2 - ov, v]));
  // قواعد التثبيت
  const bx0 = -B.w / 2, by0 = -B.d / 2;
  if (B.mount === 'holes') {
    const rin = B.hole / 2 - 0.45 + TOL.hole / 2, pinR = B.hole / 2 - 0.2 - TOL.pin / 2, rout = Math.max(B.stand / 2, B.hole / 2 + 1.2);
    for (const [hx, hy] of B.holes) {
      const cx = bx0 + hx, cy = by0 + hy;
      let t;
      if (B.pin) t = revolve([[0, T - 0.05], [rout, T - 0.05], [rout, T + sh], [pinR, T + sh], [pinR, T + sh + pcb + 0.8], [0, T + sh + pcb + 0.8]], 40);
      else t = revolve([[rin, T - 0.05], [rout, T - 0.05], [rout, T + sh], [rin, T + sh]], 40, true);
      body.push(shift(t, cx, cy));
    }
  } else {
    const pw = 6, ph = B.mount === 'ends' ? Math.min(12, B.d * 0.45) : 6;
    const pads = B.mount === 'ends' ? [[bx0, -ph / 2], [bx0 + B.w - pw, -ph / 2]] : [[bx0, by0], [bx0 + B.w - pw, by0], [bx0, by0 + B.d - ph], [bx0 + B.w - pw, by0 + B.d - ph]];
    for (const [px, py] of pads) body.push(box(px, py, T - 0.05, px + pw, py + ph, T + sh));
  }
  if (B.mount !== 'holes') { // أركان توجيه L حول اللوحة (تلامس الجدار وتبعد 0.4 مم عن اللوحة)
    const L = 8, gh = T + sh + pcb + 2.5, o = 0.4, r = (a, b, c2, d2) => [Math.min(a, b), Math.min(c2, d2), Math.max(a, b), Math.max(c2, d2)];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const ex = sx * (B.w / 2), ey = sy * (B.d / 2), ox = sx * (B.w / 2 + o), oy = sy * (B.d / 2 + o), fx = sx * (B.w / 2 + 1.6), fy = sy * (B.d / 2 + 1.6);
      const A = r(ox, fx, fy, ey - sy * L), Bq = r(fx, ex - sx * L, oy, fy);
      body.push(box(A[0], A[1], T - 0.05, A[2], A[3], gh), box(Bq[0], Bq[1], T - 0.05, Bq[2], Bq[3], gh));
    }
  }
  if (screws) { // أعمدة البراغي بالزوايا الأربع (ثقب توجيه للبرغي)
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) body.push(shift(revolve([[scr * 0.42 + TOL.hole / 2, T - 0.05], [OD / 2, T - 0.05], [OD / 2, H], [scr * 0.42 + TOL.hole / 2, H]], 40, true), sx * (iw / 2 - OD / 2 + 0.05), sy * (id / 2 - OD / 2 + 0.05)));
  }
  // ملصق نصي على الواجهة الأمامية
  const decos = [];
  if (B.label && B.labelOn === 'front') {
    const t = deco({ content: 'text', text1: B.label, text2: '', font: B.font, depth: 1 }, ow * 0.8, Math.min(H * 0.5, 14), (x, y, o) => [x, -id / 2 - T - o, H * 0.5 + y]);
    if (t) decos.push(t);
  }
  parts.push({ key: 'body', tris: mergeTris(body) });
  // الغطاء (بحافة تدخل داخل العلبة) بجانب العلبة
  if (B.lid) {
    const lc = B.lidClear + TOL.lid, lipH = 3, plateT = 2.4, ox = ow / 2 + 10 + ow / 2 + ear, lw = iw - 2 * lc, ld = id - 2 * lc, lt = 1.6;
    const ns = OD + 0.8, lip = plate(lw, ld, lipH + 0.02, (x) => { x.fillRect(0, 0, lw, ld); x.globalCompositeOperation = 'destination-out'; x.fillRect(lt, lt, lw - 2 * lt, ld - 2 * lt); if (screws) for (const [a, b2] of [[0, 0], [lw - ns, 0], [0, ld - ns], [lw - ns, ld - ns]]) x.fillRect(a, b2, ns, ns); x.globalCompositeOperation = 'source-over'; });
    const vents = [];
    if (B.vents === 'lid' || B.vents === 'both') {
      const n = Math.max(1, Math.floor((iw - 8) / 5));
      for (let i = 0; i < n; i++) vents.push([ow / 2 - ((n - 1) * 5) / 2 + i * 5, od / 2, 2.2, Math.max(8, id * 0.55)]);
    }
    const sholes = screws ? [-1, 1].flatMap((sx) => [-1, 1].map((sy) => [ow / 2 + sx * (iw / 2 - OD / 2), od / 2 + sy * (id / 2 - OD / 2), (scr + 0.5 + TOL.hole) / 2])) : [];
    const top = plate(ow, od, plateT, (x) => { x.fillRect(0, 0, ow, od); cut(x, [...vents, ...lidRects], [...sholes, ...lidCircs]); });
    const lidParts = [mapT(lip, (u, v, t) => [u - lw / 2 + ox, v - ld / 2, t]), mapT(top, (u, v, t) => [u - ow / 2 + ox, v - od / 2, lipH + t])];
    if (snap) { // خطاطيف على الوجه الأمامي والخلفي للحافة: قمة مسطحة وانحدار سفلي
      const hw = 8, hook = () => plate(1.6, 2.2, hw, (x) => { x.beginPath(); x.moveTo(-0.4, 0); x.lineTo(0, 0); x.lineTo(1.2, 2); x.lineTo(-0.4, 2); x.closePath(); x.fill(); }, 0.05);
      lidParts.push(mapT(hook(), (u, v, t) => [ox + t - hw / 2, -ld / 2 - u, v]), mapT(hook(), (u, v, t) => [ox + t - hw / 2, ld / 2 + u, v]));
    }
    parts.push({ key: 'lid', tris: mergeTris(lidParts) });
    if (B.label && B.labelOn === 'lid') {
      const t = deco({ content: 'text', text1: B.label, text2: '', font: B.font, depth: 1 }, iw * 0.8, Math.min(id * 0.5, 16), (x, y, o) => [x + ox, y, lipH + plateT + o]);
      if (t) decos.push(t);
    }
  }
  if (decos.length) parts.push({ key: 'deco', tris: mergeTris(decos) });
  if (B.showPcb) parts.push({ key: 'pcb', preview: true, tris: box(-B.w / 2, -B.d / 2, T + sh, B.w / 2, B.d / 2, zPcb) });
  return { parts: parts.filter((q) => q.tris && q.tris.length), dims: { ow, od, H } };
}
