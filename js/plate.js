// أدوات ألواح مسطحة مشتركة: لوح بثقوب → مجسم مغلق (بثق من حقل ألفا)
import { fieldToSolid } from './contour.js';
import { orient } from './cup3d.js';

const add = (t, dx, dy) => { for (let k = 0; k < t.length; k += 3) { t[k] += dx; t[k + 1] += dy; } return t; };

/** لوح مسطح L×H وبثق T. draw(ctx) يرسم بالمم (u أفقي، v رأسي للأعلى). يرجع مثلثات (x=u, y=v, z=0..T) */
export function plate(L, H, T, draw, PX = 0.2) {
  const m = 1, cw = Math.ceil((L + 2 * m) / PX), ch = Math.ceil((H + 2 * m) / PX);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.setTransform(1 / PX, 0, 0, -1 / PX, m / PX, ch - m / PX); x.fillStyle = '#fff';
  draw(x);
  const d = x.getImageData(0, 0, cw, ch).data, f = new Float32Array(cw * ch);
  for (let k = 0; k < f.length; k++) f[k] = d[k * 4 + 3] / 255;
  return add(fieldToSolid(f, cw, ch, PX, 0, T), -m, -(m - PX));
}
export const cut = (x, rects, circles = []) => { x.globalCompositeOperation = 'destination-out'; for (const [u, v, w, h] of rects) x.fillRect(u - w / 2, v - h / 2, w, h); for (const [u, v, r] of circles) { x.beginPath(); x.arc(u, v, r, 0, Math.PI * 2); x.fill(); } x.globalCompositeOperation = 'source-over'; };
export const mapT = (t, fn) => { for (let k = 0; k < t.length; k += 3) { const o = fn(t[k], t[k + 1], t[k + 2]); t[k] = o[0]; t[k + 1] = o[1]; t[k + 2] = o[2]; } return orient(t); };
