// خدمة العمل بدون إنترنت: الشبكة أولاً للصفحات والكود، والكاش أولاً للمكتبات الثقيلة
const CACHE = 'tab3a-v6';
const CORE = ['./', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icons/icon-192.png',
  'js/app.js', 'js/config.js', 'js/viewer.js', 'js/mesh.js', 'js/contour.js', 'js/keychain.js', 'js/photo.js', 'js/ai.js', 'js/export.js', 'js/cup3d.js', 'js/extras.js', 'js/i18n.js', 'js/worker.js',
  'vendor/three/three.module.min.js', 'vendor/three/addons/controls/OrbitControls.js', 'vendor/earcut.js', 'vendor/jszip.min.js', 'vendor/qrcode.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const heavy = u.pathname.includes('/vendor/');
  if (heavy) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => { const c = res.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return res; })));
  } else {
    e.respondWith(fetch(e.request).then((res) => { const c = res.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return res; }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
  }
});
