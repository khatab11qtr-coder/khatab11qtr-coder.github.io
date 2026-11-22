// إضافات: الواقع المعزز (AR)، صورة الستوري التسويقية، روابط مشاركة التصميم
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { drawText, drawQR } from './keychain.js';

/* ---------- نافذة منبثقة عامة ---------- */
export function modal(html, { wide = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `<div class="modal-box ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><button class="icon-btn modal-x" aria-label="إغلاق">✕</button>${html}</div>`;
  const close = () => { wrap.remove(); document.removeEventListener('keydown', esc); wrap.onclose?.(); };
  const esc = (e) => e.key === 'Escape' && close();
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('.modal-x')) close(); });
  document.addEventListener('keydown', esc);
  document.body.appendChild(wrap);
  wrap.close = close;
  return wrap;
}

/* ---------- روابط المشاركة ---------- */
const b64u = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
export const encodeDesign = (o) => b64u(JSON.stringify(o));
export function decodeDesign(s) { try { return JSON.parse(unb64u(s)); } catch { return null; } }
export const designURL = (page, o) => `${location.origin}${location.pathname}#${page}?d=${encodeDesign(o)}`;
export function parseHash() {
  const h = location.hash.slice(1); const [page, q] = h.split('?');
  const d = q ? new URLSearchParams(q).get('d') : null;
  return { page: page || 'home', design: d ? decodeDesign(d) : null };
}
export async function shareLink(url, title) {
  if (navigator.share) { try { await navigator.share({ url, title }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancel'; } }
  try { await navigator.clipboard.writeText(url); return 'copied'; } catch { return 'fail'; }
}

/* ---------- GLB للواقع المعزز ---------- */
export function partsToGLB(parts) {
  const scene = new THREE.Scene();
  const outer = new THREE.Group(); outer.rotation.x = -Math.PI / 2; outer.scale.setScalar(0.001); // مم → متر، Z للأعلى → Y للأعلى
  const inner = new THREE.Group(); outer.add(inner); scene.add(outer);
  const box = new THREE.Box3();
  for (const p of parts) {
    if (!p.tris?.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p.tris, 3));
    g.computeVertexNormals(); g.computeBoundingBox(); box.union(g.boundingBox);
    inner.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: p.color || '#cccccc', roughness: 0.55, metalness: p.key === 'loop' ? 0.6 : 0.05 })));
  }
  const c = box.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -c.y, -box.min.z);
  return new Promise((res, rej) => new GLTFExporter().parse(scene, res, rej, { binary: true }));
}

let mvLoading = null;
function loadModelViewer() {
  if (customElements.get('model-viewer')) return Promise.resolve();
  if (!mvLoading) mvLoading = new Promise((res, rej) => {
    const s = document.createElement('script'); s.type = 'module'; s.src = 'vendor/model-viewer.min.js';
    s.onload = () => customElements.whenDefined('model-viewer').then(res); s.onerror = () => rej(new Error('تعذر تحميل عارض AR'));
    document.head.appendChild(s);
  });
  return mvLoading;
}

/** يفتح معاينة AR. qrUrl: رابط يفتح نفس التصميم على الجوال (للكمبيوتر) */
export async function openAR(parts, { title = '', qrUrl = '' } = {}) {
  const m = modal(`<h3>📱 شوفه في مكانك — بالحجم الحقيقي</h3><div class="ar-stage"><div class="busy">جارٍ التجهيز…</div></div><div class="ar-help"></div>`, { wide: true });
  try {
    const [glb] = await Promise.all([partsToGLB(parts), loadModelViewer()]);
    const url = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
    m.onclose = () => URL.revokeObjectURL(url);
    const stage = m.querySelector('.ar-stage');
    stage.innerHTML = `<model-viewer src="${url}" alt="${title}" ar ar-modes="webxr quick-look scene-viewer" ar-scale="fixed" camera-controls touch-action="pan-y" auto-rotate shadow-intensity="1" exposure="1.1" environment-image="neutral">
      <button slot="ar-button" class="btn primary ar-btn">📱 افتح الكاميرا وشوفه قدامك</button></model-viewer>`;
    const mv = stage.querySelector('model-viewer');
    const help = m.querySelector('.ar-help');
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
    mv.addEventListener('load', () => {
      if (mv.canActivateAR) help.innerHTML = '<p class="hint">اضغط الزر، وحرّك الجوال ببطء على الطاولة حتى يظهر المجسم بحجمه الحقيقي.</p>';
      else if (isMobile) help.innerHTML = '<p class="hint">جهازك أو متصفحك ما يدعم AR — جرّب Safari على الآيفون أو Chrome على أندرويد. تقدر تدوّر المجسم بإصبعك هنا.</p>';
      else if (qrUrl) {
        const c = document.createElement('canvas'); c.width = c.height = 220;
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 220, 220); x.fillStyle = '#000';
        drawQR(x, qrUrl, 10, 10, 200);
        help.innerHTML = '<div class="ar-qr"><p>امسح الكود بجوالك لتفتح نفس التصميم وتشوفه بالواقع المعزز:</p></div>';
        help.querySelector('.ar-qr').prepend(c);
      }
    });
  } catch (e) {
    console.error(e); m.querySelector('.ar-stage').innerHTML = `<p class="warn">${e.message}</p>`;
  }
  return m;
}

/* ---------- صورة الستوري / البوست ---------- */
export const STORY_STYLES = [
  { name: 'كريمي', bg: ['#f7efe3', '#e9d6bd'], fg: '#2a1d13', sub: '#7a5c42', glow: 'rgba(242,165,65,.35)' },
  { name: 'قهوة', bg: ['#2a1a12', '#120b07'], fg: '#f8ead7', sub: '#d9b48a', glow: 'rgba(242,165,65,.25)' },
  { name: 'ذهبي', bg: ['#f2a541', '#b86f1d'], fg: '#1a0f05', sub: '#3b230d', glow: 'rgba(255,255,255,.35)' },
  { name: 'أبيض', bg: ['#ffffff', '#eef0f3'], fg: '#111111', sub: '#555555', glow: 'rgba(0,0,0,.08)' },
];
function loadImg(src) { return new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = src; }); }

export async function storyImage({ snap, title = '', sub = '', brand = '', site = '', qrUrl = '', format = 'story', style = 0, font = 'Cairo' }) {
  const W = 1080, H = format === 'story' ? 1920 : 1350, S = STORY_STYLES[style] || STORY_STYLES[0];
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, S.bg[0]); g.addColorStop(1, S.bg[1]);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const cy = H * (format === 'story' ? 0.44 : 0.43);
  const rg = x.createRadialGradient(W / 2, cy, 40, W / 2, cy, W * 0.62);
  rg.addColorStop(0, S.glow); rg.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = rg; x.fillRect(0, 0, W, H);
  // ظل أرضي
  x.fillStyle = 'rgba(0,0,0,.12)'; x.beginPath(); x.ellipse(W / 2, cy + H * 0.24, W * 0.28, 26, 0, 0, Math.PI * 2); x.fill();
  const img = await loadImg(snap);
  const box = format === 'story' ? [W * 0.9, H * 0.52] : [W * 0.84, H * 0.56];
  const s = Math.min(box[0] / img.width, box[1] / img.height);
  x.drawImage(img, (W - img.width * s) / 2, cy - (img.height * s) / 2, img.width * s, img.height * s);
  x.fillStyle = S.fg;
  if (brand) drawText(x, brand, font, W / 2, H * 0.075, W * 0.8, 64, 900);
  x.fillStyle = S.fg; if (title) drawText(x, title, font, W / 2, H * (format === 'story' ? 0.76 : 0.79), W * 0.86, 110, 900);
  x.fillStyle = S.sub; if (sub) drawText(x, sub, font, W / 2, H * (format === 'story' ? 0.81 : 0.855), W * 0.8, 48, 700);
  // التذييل: رابط + QR
  const fy = H - (format === 'story' ? 210 : 150);
  if (qrUrl) {
    const q = format === 'story' ? 170 : 130, qx = W - q - 60, qy = fy - 20;
    x.fillStyle = '#fff'; x.beginPath(); x.roundRect(qx - 14, qy - 14, q + 28, q + 28, 20); x.fill();
    x.fillStyle = '#000'; drawQR(x, qrUrl, qx, qy, q);
    x.fillStyle = S.fg; drawText(x, 'صمّم ميداليتك', font, (W - q - 80) / 2 + 20, fy + q * 0.3, W - q - 160, 44, 800);
    x.fillStyle = S.sub; drawText(x, site, font, (W - q - 80) / 2 + 20, fy + q * 0.66, W - q - 160, 40, 700);
  } else if (site) { x.fillStyle = S.sub; drawText(x, site, font, W / 2, fy + 60, W * 0.8, 44, 700); }
  return new Promise((r) => c.toBlob(r, 'image/png'));
}
