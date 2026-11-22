// تحويل صور متعددة لمجسم كامل بالذكاء الاصطناعي (Meshy API) + تحويل GLB إلى STL بمقاس دقيق
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const API = 'https://api.meshy.ai/openapi/v1';

export const getKey = () => { try { return localStorage.getItem('meshyKey') || ''; } catch { return ''; } };
export const setKey = (k) => { try { localStorage.setItem('meshyKey', k); } catch {} };

/** تصغير الصورة وتحويلها Data URI */
export function toDataURI(img, max = 1024) {
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

async function call(path, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: { Authorization: `Bearer ${getKey()}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = { message: t }; }
  if (!r.ok) throw new Error(j.message || `HTTP ${r.status}`);
  return j;
}

/** يبدأ المهمة ويتابعها حتى الانتهاء. onProgress(percent, status) */
export async function generate(images, onProgress, signal) {
  if (!getKey()) throw new Error('أدخل مفتاح Meshy API أولاً');
  const uris = images.slice(0, 4).map((im) => toDataURI(im));
  const multi = uris.length > 1;
  const endpoint = multi ? '/multi-image-to-3d' : '/image-to-3d';
  const body = multi ? { image_urls: uris } : { image_url: uris[0] };
  const { result: id } = await call(endpoint, { method: 'POST', body: JSON.stringify(body) });
  if (!id) throw new Error('لم يتم إنشاء المهمة');
  for (;;) {
    if (signal?.aborted) throw new Error('تم الإلغاء');
    await new Promise((r) => setTimeout(r, 4000));
    const t = await call(`${endpoint}/${id}`);
    onProgress?.(t.progress ?? 0, t.status);
    if (t.status === 'SUCCEEDED') {
      const url = t.model_urls?.glb;
      if (!url) throw new Error('لا يوجد ملف GLB في النتيجة');
      const res = await fetch(url);
      if (!res.ok) throw new Error('تعذر تنزيل المجسم');
      return { buffer: await res.arrayBuffer(), thumb: t.thumbnail_url };
    }
    if (t.status === 'FAILED' || t.status === 'CANCELED') throw new Error(t.task_error?.message || 'فشلت عملية التوليد');
  }
}

/** يحوّل GLB إلى مثلثات بالمليمتر، مع محور Z للأعلى ومقاس محدد لأكبر بُعد */
export async function glbToTris(buffer, targetMm, axis = 'auto') {
  const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buffer, '', res, rej));
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const chunks = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    let g = o.geometry;
    if (g.index) g = g.toNonIndexed();
    const p = g.attributes.position;
    const arr = new Float32Array(p.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      // glTF يستخدم Y للأعلى؛ الطابعات تستخدم Z
      arr[i * 3] = v.x; arr[i * 3 + 1] = -v.z; arr[i * 3 + 2] = v.y;
    }
    chunks.push(arr);
  });
  if (!chunks.length) throw new Error('الملف لا يحتوي على مجسمات');
  const n = chunks.reduce((s, a) => s + a.length, 0);
  const tris = new Float32Array(n); let o = 0;
  for (const c of chunks) { tris.set(c, o); o += c.length; }
  // مقاس
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) { const a = i % 3; mn[a] = Math.min(mn[a], tris[i]); mx[a] = Math.max(mx[a], tris[i]); }
  const size = mx.map((x, i) => x - mn[i]);
  const ref = axis === 'height' ? size[2] : Math.max(...size);
  const s = targetMm / (ref || 1);
  for (let i = 0; i < n; i++) {
    const a = i % 3;
    tris[i] = (tris[i] - (a === 2 ? mn[2] : (mn[a] + mx[a]) / 2)) * s;
  }
  return tris;
}
