import { CONFIG } from './config.js';
import { Viewer } from './viewer.js';
import { toSTL, volumeOf, bboxOf, mergeTris } from './mesh.js';
import { TEMPLATES, rasterize, buildSolids, makeStencil } from './keychain.js';
import { lithophane, relief, faceRelief, cookieCutter, removeBackground } from './photo.js';
import { export3MF, arrange, bedOutline, BEDS } from './export.js';
import * as AI from './ai.js';

/* ================= أدوات عامة ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
let toastT;
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
}
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const safeName = (s) => (s || 'model').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').slice(0, 40) || 'model';
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => res({ img, url, name: file.name.replace(/\.[^.]+$/, '') });
    img.onerror = () => rej(new Error('صورة غير صالحة'));
    img.src = url;
  });
}
const fmt = (n, d = 1) => Number(n).toLocaleString('ar', { maximumFractionDigits: d, minimumFractionDigits: 0 });

function costStats(tris, extra = []) {
  const vol = volumeOf(tris) / 1000;                 // سم³
  const grams = vol * CONFIG.density * 0.8;          // تقدير مع تعبئة جزئية
  const box = bboxOf(tris).size;
  const minutes = 6 + grams * 4.2;
  const cost = grams / 1000 * CONFIG.filamentPricePerKg;
  const price = Math.max(CONFIG.minPrice, Math.ceil(cost * CONFIG.profitMultiplier + minutes / 60 * 4));
  const rows = [
    ['المقاس (مم)', `${fmt(box[0])} × ${fmt(box[1])} × ${fmt(box[2])}`],
    ['الوزن التقريبي', `${fmt(grams)} غ`],
    ['وقت الطباعة', minutes < 60 ? `~${fmt(minutes, 0)} د` : `~${fmt(minutes / 60)} س`],
    ['تكلفة الخامة', `${fmt(cost, 2)} ${CONFIG.currency}`],
    ['سعر بيع مقترح', `${fmt(price, 0)} ${CONFIG.currency}`],
    ['المثلثات', fmt(tris.length / 9, 0)],
    ...extra,
  ];
  return { html: rows.map(([k, v]) => `<div class="stat"><small>${k}</small><b>${v}</b></div>`).join(''), grams, price, box };
}

/* ================= الهوية والوضع ================= */
$('#brandName').textContent = CONFIG.brand;
$$('.bn').forEach((e) => (e.textContent = CONFIG.brand));
$('#year').textContent = new Date().getFullYear();
const savedTheme = store.get('theme', null);
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
$('#themeBtn').onclick = () => {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const n = cur === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = n; store.set('theme', n);
};
if (!savedTheme && matchMedia('(prefers-color-scheme: light)').matches) document.documentElement.dataset.theme = 'light';

/* ================= التنقل ================= */
function go(id, push = true) {
  if (!document.getElementById(id)) id = 'home';
  $$('.page').forEach((p) => p.classList.toggle('active', p.id === id));
  $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.go === id));
  if (push) history.replaceState(null, '', '#' + id);
  window.scrollTo({ top: 0, behavior: push ? 'smooth' : 'auto' });
  if (id === 'keychain') K.ensure();
  if (id === 'order') O.render();
  if (id === 'gallery') G.load();
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-go]');
  if (el) { e.preventDefault(); go(el.dataset.go); }
});

/* ================= الميداليات ================= */
function alphaFrac(src) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const x = c.getContext('2d'); x.drawImage(src, 0, 0, 64, 64);
  const d = x.getImageData(0, 0, 64, 64).data; let tr = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 128) tr++;
  return tr / 4096;
}
const K = {
  view: null, P: null, R: null, S: null, busy: false, pending: false, logo: null, flipped: false,
  template: store.get('k_tpl', 'cup'),
  ensure() { if (!this.view) { this.view = new Viewer($('#kView')); this.update(); } },
  stencil() {
    const L = this.logo; if (!L) return null;
    const bg = $('#kBg').checked;
    if (bg && !L.clean) L.clean = removeBackground(L.img);
    const src = bg ? L.clean : L.img;
    const hasAlpha = alphaFrac(src) > 0.02;
    const both = makeStencil(src, { hasAlpha, threshold: +$('#kThresh').value, invert: $('#kInvert').checked });
    this.logoShape = both.shape;
    const st = both.detail;
    const pv = $('#kLogoPrev'); pv.hidden = false; pv.width = st.width; pv.height = st.height;
    const px = pv.getContext('2d'); px.clearRect(0, 0, pv.width, pv.height);
    px.drawImage(st, 0, 0); px.globalCompositeOperation = 'source-in'; px.fillStyle = '#3b2a20'; px.fillRect(0, 0, pv.width, pv.height); px.globalCompositeOperation = 'source-over';
    return st;
  },
  read() {
    return {
      template: this.template,
      text1: $('#kText1').value.trim(), text2: $('#kText2').value.trim(), qr: $('#kQR').value.trim(),
      font: $('#kFont').value, textMode: $('#kMode').value, size: +$('#kSize').value,
      baseH: +$('#kBase').value || 3, raiseH: +$('#kRaise').value || 1, hole: +$('#kHole').value || 4.5,
      res: +$('#kRes').value, nozzle: +$('#kNozzle').value, border: $('#kBorder').checked, decor: $('#kDecor').checked,
      borderW: 1.2, lineW: 1.1, c1: $('#kC1').value, c2: $('#kC2').value,
      logoStencil: this.logoStencil || null, logoShape: this.logoShape || null, logoPlace: $('#kLogoPlace').value, logoOutline: 1.5,
      back: $('#kBack').value, backText: $('#kBackText').value.trim(),
    };
  },
  write(P) {
    const set = (id, v) => { const e = $(id); if (e && v != null) e.type === 'checkbox' ? (e.checked = v) : (e.value = v); };
    this.setTemplate(P.template, false, false);
    set('#kText1', P.text1); set('#kText2', P.text2); set('#kQR', P.qr); set('#kFont', P.font); set('#kMode', P.textMode);
    set('#kSize', P.size); set('#kBase', P.baseH); set('#kRaise', P.raiseH); set('#kHole', P.hole); set('#kRes', P.res);
    set('#kBorder', P.border); set('#kDecor', P.decor); set('#kC1', P.c1); set('#kC2', P.c2);
    set('#kBack', P.back); set('#kBackText', P.backText); set('#kNozzle', P.nozzle);
    $('#kSizeO').textContent = $('#kSize').value; this.syncBody();
  },
  syncBody() {
    [...document.body.classList].filter((c) => /^(tpl|back)-/.test(c)).forEach((c) => document.body.classList.remove(c));
    document.body.classList.add('tpl-' + this.template, 'back-' + $('#kBack').value);
  },
  setTemplate(t, upd = true, resize = true) {
    if (!TEMPLATES[t]) t = 'cup';
    this.template = t; store.set('k_tpl', t);
    $$('.tpl').forEach((b) => b.classList.toggle('active', b.dataset.t === t));
    $('#kSizeLbl').textContent = TEMPLATES[t].sizeLabel;
    if (resize) $('#kSize').value = TEMPLATES[t].def;
    $('#kSizeO').textContent = $('#kSize').value;
    if (t === 'logo' && !this.logo) $('#kLogoBox').open = true;
    this.syncBody();
    if (upd) this.update();
  },
  async fonts(P) {
    try { await Promise.all([document.fonts.load(`800 40px "${P.font}"`, P.text1 || 'a'), document.fonts.load(`700 40px "${P.font}"`, (P.text2 || '') + (P.backText || '') || 'a')]); } catch {}
  },
  parts(S, P = this.P) { return [{ name: 'base', tris: S.base, color: P.c1 }, { name: 'text', tris: S.accent, color: P.c2 }].filter((p) => p.tris.length); },
  async update() {
    if (!this.view) return;
    if (this.busy) { this.pending = true; return; }
    this.busy = true; $('#kBusy').hidden = false;
    await nextFrame();
    try {
      const P = this.read();
      await this.fonts(P);
      if (P.template === 'logo' && !P.logoStencil) {
        this.view.clear(); $('#kStats').innerHTML = ''; this.R = null;
        $('#kWarn').hidden = false; $('#kWarn').textContent = 'ارفع صورة الشعار من قسم «🖼️ شعار الكوفي».';
        return;
      }
      const R = rasterize(P);
      const S = buildSolids(R);
      const first = !this.R || this.platePreview;
      this.platePreview = false;
      this.view.show(this.parts(S, P), { keepView: !first && this.P?.template === P.template && this.P?.size === P.size });
      this.applyFlip();
      this.P = P; this.R = R; this.S = S;
      const full = mergeTris([S.base, S.accent]);
      const st = costStats(full, [['تغيير اللون عند', R.colorZ.map((z) => `${fmt(z)} مم`).join(' و ')]]);
      $('#kStats').innerHTML = st.html; this.stats = st;
      const w = [...R.warns];
      if (!['logo', 'qr'].includes(P.template) && !P.text1 && !(P.logoStencil && P.logoPlace === 'name')) w.push('اكتب الاسم الرئيسي.');
      if (P.back === 'text' && !P.backText) w.push('اكتب نص الوجه الخلفي.');
      $('#kWarn').hidden = !w.length; $('#kWarn').innerHTML = w.map((x) => '⚠️ ' + x).join('<br>');
      if (!$('#k2d').hidden) this.draw2d();
    } catch (e) {
      console.error(e); toast('تعذر توليد التصميم: ' + e.message);
    } finally {
      this.busy = false; $('#kBusy').hidden = true;
      if (this.pending) { this.pending = false; this.update(); }
    }
  },
  applyFlip() { if (this.view) { this.view.spin.rotation.y = this.flipped ? Math.PI : 0; this.view.dirty = true; } },
  draw2d() {
    const R = this.R; if (!R) return;
    const c = $('#k2d'); c.width = R.w; c.height = R.h;
    const ctx = c.getContext('2d'); const im = ctx.createImageData(R.w, R.h);
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const c1 = hex(this.P.c1), c2 = hex(this.P.c2);
    for (let k = 0; k < R.w * R.h; k++) {
      if (R.solidF[k] < 0.5) continue;
      const col = R.accF[k] >= 0.5 ? c2 : R.engF[k] >= 0.5 ? c1.map((v) => v * 0.6) : c1;
      im.data.set([...col, 255], k * 4);
    }
    ctx.putImageData(im, 0, 0);
  },
  stl(P = this.P, S = this.S) { return toSTL(mergeTris([S.base, S.accent]), P.text1 || P.template); },
  fileBase(P = this.P) { return `${safeName(P.text1 || TEMPLATES[P.template].label)}_${P.template}`; },
};

// شبكات القوالب
for (const g of $$('.tpl-grid')) {
  g.innerHTML = Object.entries(TEMPLATES).filter(([, t]) => t.group === g.dataset.group)
    .map(([k, t]) => `<button class="tpl" data-t="${k}" title="${t.label}"><span>${t.icon}</span>${t.label}</button>`).join('');
  g.addEventListener('click', (e) => { const b = e.target.closest('.tpl'); if (b) K.setTemplate(b.dataset.t); });
}
K.setTemplate(K.template, false, false);
$('#kBed').innerHTML = Object.entries(BEDS).map(([k, b]) => `<option value="${k}">${b.label}</option>`).join('');
$('#kBed').value = store.get('k_bed', 'bambu');
$('#kBed').addEventListener('change', (e) => store.set('k_bed', e.target.value));

const kUpd = debounce(() => K.update(), 280);
$$('#keychain .panel input, #keychain .panel select').forEach((el) => {
  if (['kLogo', 'kBatch', 'kCopies', 'kFormat', 'kBed'].includes(el.id)) return;
  el.addEventListener('input', () => {
    if (el.id === 'kSize') $('#kSizeO').textContent = el.value;
    if (el.id === 'kThresh') $('#kThreshO').textContent = el.value;
    if (el.id === 'kBack') K.syncBody();
    if (['kThresh', 'kInvert', 'kBg'].includes(el.id) && K.logo) K.logoStencil = K.stencil();
    if (el.id === 'kC1' || el.id === 'kC2') {
      const parts = K.view?.group.children || [];
      if (parts[0]) parts[0].material.color.set($('#kC1').value);
      if (parts[1]) parts[1].material.color.set($('#kC2').value);
      if (K.view) K.view.dirty = true;
      if (K.P) { K.P.c1 = $('#kC1').value; K.P.c2 = $('#kC2').value; }
      if (!$('#k2d').hidden) K.draw2d();
      return;
    }
    kUpd();
  });
});
$('#kLogo').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    K.logo = await loadImage(f);
    K.logoStencil = K.stencil();
    if ($('#kLogoPlace').value === 'none') $('#kLogoPlace').value = 'decor';
    K.update();
  } catch (err) { toast(err.message); }
});
$('#kRot').onclick = (e) => { K.view.autoRotate = !K.view.autoRotate; e.currentTarget.classList.toggle('on', K.view.autoRotate); };
$('#kTop').onclick = () => K.view.topView();
$('#kFlip').onclick = (e) => { K.flipped = !K.flipped; K.applyFlip(); e.currentTarget.classList.toggle('on', K.flipped); };
$('#kFlat').onclick = (e) => {
  const c = $('#k2d'); c.hidden = !c.hidden; e.currentTarget.classList.toggle('on', !c.hidden);
  if (!c.hidden) K.draw2d();
};
$('#kSTL').onclick = () => { if (!K.S) return; download(K.stl(), K.fileBase() + '.stl'); toast('تم تجهيز ملف STL ✓'); };
$('#k3MF').onclick = async () => {
  if (!K.S) return;
  download(await export3MF([{ name: K.fileBase(), parts: K.parts(K.S) }]), K.fileBase() + '.3mf');
  toast('ملف 3MF بلونين جاهز ✓');
};
$('#k2C').onclick = async () => {
  if (!K.S) return;
  const zip = new JSZip();
  zip.file(`${K.fileBase()}_base.stl`, toSTL(K.S.base, 'base'));
  if (K.S.accent.length) zip.file(`${K.fileBase()}_text.stl`, toSTL(K.S.accent, 'text'));
  zip.file('README.txt', `استورد الملفين معاً في السلايسر كجسم واحد متعدد الأجزاء (Multi-part).\nالقاعدة: اللون الأول. النص والإطار: اللون الثاني.\nبديل: اطبع الملف الكامل وأضف تغيير فلامنت عند: ${K.R.colorZ.join(' و ')} مم.\n`);
  download(await zip.generateAsync({ type: 'blob' }), K.fileBase() + '_2colors.zip');
};
$('#kPNG').onclick = () => fetch(K.view.snapshot()).then((r) => r.blob()).then((b) => download(b, K.fileBase() + '.png'));
$('#kOrder').onclick = () => { O.source = 'keychain'; go('order'); };

const batchNames = () => $('#kBatch').value.split('\n').map((s) => s.trim()).filter(Boolean);
$('#kBatchBtn').onclick = async () => {
  const names = batchNames();
  if (!names.length) return toast('اكتب اسماً واحداً على الأقل');
  const btn = $('#kBatchBtn'); btn.disabled = true;
  const zip = new JSZip(); const base = K.read(); await K.fonts(base);
  try {
    for (let i = 0; i < names.length; i++) {
      btn.textContent = `جارٍ ${i + 1}/${names.length}…`; await nextFrame();
      const P = { ...base, text1: names[i] };
      try { await document.fonts.load(`800 40px "${P.font}"`, names[i]); } catch {}
      zip.file(`${String(i + 1).padStart(2, '0')}_${safeName(names[i])}.stl`, K.stl(P, buildSolids(rasterize(P))));
    }
    download(await zip.generateAsync({ type: 'blob' }), `keychains_${names.length}.zip`);
    toast(`تم تجهيز ${names.length} ميدالية ✓`);
  } finally { btn.disabled = false; btn.textContent = '📦 ملف لكل اسم ZIP'; }
};
$('#kPlateBtn').onclick = async () => {
  K.ensure();
  const btn = $('#kPlateBtn'); btn.disabled = true;
  try {
    const base = K.read(); await K.fonts(base);
    const names = batchNames(); const items = [];
    if (names.length) {
      for (let i = 0; i < names.length; i++) {
        btn.textContent = `جارٍ ${i + 1}/${names.length}…`; await nextFrame();
        const P = { ...base, text1: names[i] };
        try { await document.fonts.load(`800 40px "${P.font}"`, names[i]); } catch {}
        items.push({ name: safeName(names[i]), parts: K.parts(buildSolids(rasterize(P)), P) });
      }
    } else {
      const S = K.S || buildSolids(rasterize(base));
      const n = Math.max(1, Math.min(200, +$('#kCopies').value || 1));
      for (let i = 0; i < n; i++) items.push({ name: `${K.fileBase(base)}_${i + 1}`, parts: K.parts(S, base) });
    }
    const bed = BEDS[$('#kBed').value];
    const plates = arrange(items, bed);
    // معاينة أول بلاطة
    K.view.show([...plates[0].flatMap((it) => it.parts), { tris: bedOutline(bed), color: '#888888' }]);
    K.platePreview = true;
    $('#kPlateInfo').textContent = `${items.length} قطعة على ${plates.length} بلاطة (${bed.w}×${bed.d}). أول بلاطة ظاهرة في المعاينة.`;
    const fmtSel = $('#kFormat').value;
    const files = [];
    for (let i = 0; i < plates.length; i++) {
      const name = `plate_${i + 1}_of_${plates.length}`;
      if (fmtSel === '3mf') files.push([name + '.3mf', await export3MF(plates[i])]);
      else files.push([name + '.stl', toSTL(mergeTris(plates[i].flatMap((it) => it.parts.map((p) => p.tris))), name)]);
    }
    if (files.length === 1) download(files[0][1], files[0][0]);
    else { const zip = new JSZip(); files.forEach(([n, b]) => zip.file(n, b)); download(await zip.generateAsync({ type: 'blob' }), 'plates.zip'); }
    toast('البلاطة جاهزة ✓');
  } catch (e) { console.error(e); toast(e.message, 4000); }
  finally { btn.disabled = false; btn.textContent = '📐 رتّب على البلاطة'; }
};
// التصاميم المحفوظة
function renderSaved() {
  const list = store.get('k_saved', []);
  $('#kSaved').innerHTML = list.map((s, i) => `<span class="chip" data-i="${i}">${TEMPLATES[s.template]?.icon || ''} ${escapeHTML(s.text1 || s.template)}<button data-del="${i}" aria-label="حذف">✕</button></span>`).join('');
}
const escapeHTML = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
$('#kSave').onclick = () => {
  const P = K.read(); delete P.logoStencil; delete P.logoShape;
  const list = store.get('k_saved', []); list.unshift(P); store.set('k_saved', list.slice(0, 12));
  renderSaved(); toast('تم حفظ التصميم في متصفحك ⭐');
};
$('#kSaved').addEventListener('click', (e) => {
  const list = store.get('k_saved', []);
  const del = e.target.closest('[data-del]');
  if (del) { list.splice(+del.dataset.del, 1); store.set('k_saved', list); renderSaved(); return; }
  const c = e.target.closest('.chip'); if (c) { K.write(list[+c.dataset.i]); K.update(); }
});
renderSaved();

/* ================= الصور ================= */
const PH = {
  view: null, imgs: [], sel: -1, mode: 'lithophane', last: null,
  hints: {
    lithophane: 'ليثوفين: لوحة رقيقة تظهر فيها الصورة بوضوح عند وضع ضوء خلفها. جرّب الشكل المنحني لعمل أباجورة.',
    relief: 'نقش بارز: الأجزاء الفاتحة ترتفع والداكنة تنخفض — مناسب للوحات واللوقوهات والخرائط.',
    face: 'نقش وجه: يفصل الشخص عن الخلفية ويعطيه حجماً بارزاً مثل الميداليات المعدنية. صورة أمامية بإضاءة جيدة تعطي أفضل نتيجة.',
    keychain: 'ميدالية من شكل الصورة: نفصل الشكل عن الخلفية ونضيف حلقة.',
    cookie: 'قاطع كوكيز بحدود الشكل: رسمة أو شعار بلون داكن على خلفية فاتحة.',
  },
  ensure() { if (!this.view) this.view = new Viewer($('#pView')); },
  params() {
    return {
      width: +$('#pWidth').value, res: +$('#pRes').value, contrast: +$('#pContrast').value, smooth: +$('#pSmooth').value,
      invert: $('#pInvert').checked, minT: +$('#pMin').value, maxT: +$('#pMax').value, frame: +$('#pFrame').value,
      baseH: +$('#pBase').value, reliefH: +$('#pRelief').value, threshold: +$('#pThresh').value,
      kBase: +$('#pKBase').value, kOut: +$('#pKOut').value, height: +$('#pCH').value, wall: +$('#pCW').value, flange: 4, flangeH: 1.6,
      shape: $('#pShape').value, curve: +$('#pCurve').value, bg: $('#pBg').checked, tol: +$('#pTol').value,
    };
  },
  source(item, P, mode) {
    if (!P.bg || !['face', 'keychain', 'cookie'].includes(mode)) return item.img;
    if (!item.clean || item.cleanTol !== P.tol) { item.clean = removeBackground(item.img, P.tol); item.cleanTol = P.tol; }
    return item.clean;
  },
  build(item, P = this.params(), mode = this.mode) {
    const img = this.source(item, P, mode);
    const shapeP = mode === 'lithophane' ? P : { ...P, frame: P.shape === 'rect' ? 0 : P.frame };
    if (mode === 'lithophane') return lithophane(img, P);
    if (mode === 'relief') return relief(img, shapeP);
    if (mode === 'face') return faceRelief(img, { ...shapeP, frame: P.frame });
    if (mode === 'cookie') return cookieCutter(img, P);
    const st = makeStencil(img, { hasAlpha: alphaFrac(img) > 0.02, threshold: P.threshold, invert: P.invert });
    const R = rasterize({
      template: 'logo', size: P.width, res: Math.max(P.res, 0.12), logoStencil: st.detail, logoShape: st.shape, logoOutline: P.kOut,
      hole: 4.5, baseH: P.kBase, raiseH: 1, border: false, textMode: 'raised', font: 'Cairo', nozzle: 0.4,
    });
    const S = buildSolids(R);
    return { parts: [{ tris: S.base, color: '#3b2a20' }, { tris: S.accent, color: '#f5e6c8' }], full: mergeTris([S.base, S.accent]) };
  },
  async update() {
    this.ensure();
    const item = this.imgs[this.sel];
    $('#pEmpty').hidden = !!item; $('#pSTL').disabled = !item; $('#pAll').disabled = !this.imgs.length;
    if (!item) { this.view.clear(); $('#pStats').innerHTML = ''; return; }
    $('#pBusy').hidden = false; await nextFrame();
    try {
      const out = this.build(item);
      const full = out.full || out.parts[0].tris;
      this.view.show(out.parts.filter((p) => p.tris.length).map((p) => ({ ...p, color: p.color || (this.mode === 'lithophane' ? '#f4efe6' : '#e9b872') })));
      const st = costStats(full);
      this.last = { full, name: `${safeName(item.name)}_${this.mode}`, stats: st, mode: this.mode };
      $('#pStats').innerHTML = st.html;
    } catch (e) { console.error(e); toast('تعذر التحويل: ' + e.message); }
    finally { $('#pBusy').hidden = true; }
  },
  renderThumbs() {
    $('#pThumbs').innerHTML = this.imgs.map((it, i) => `<div class="thumb ${i === this.sel ? 'active' : ''}" data-i="${i}"><img src="${it.url}" alt=""><button data-rm="${i}" aria-label="إزالة">✕</button></div>`).join('');
  },
  async add(files) {
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      try { this.imgs.push(await loadImage(f)); } catch (e) { toast(e.message); }
    }
    if (this.sel < 0 && this.imgs.length) this.sel = 0;
    this.renderThumbs(); this.update();
  },
  setMode(m) {
    this.mode = m;
    $$('#pMode button').forEach((b) => b.classList.toggle('active', b.dataset.m === m));
    $$('#photo .grp').forEach((g) => (g.hidden = !g.dataset.for.split(' ').includes(m)));
    $('#pHint').textContent = this.hints[m];
    const w = $('#pWidth');
    if (m === 'keychain' && +w.value > 80) w.value = 50;
    if (m === 'cookie' && +w.value > 120) w.value = 80;
    if ((m === 'lithophane' || m === 'face') && +w.value < 60) w.value = 100;
    $('#pWidthO').textContent = w.value;
    this.update();
  },
};
PH.setMode('lithophane');
$('#pMode').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) PH.setMode(b.dataset.m); });
const pUpd = debounce(() => PH.update(), 350);
$$('#photo .panel input:not([type=file]), #photo .panel select').forEach((el) => el.addEventListener('input', () => {
  const o = $('#' + el.id + 'O'); if (o) o.textContent = el.value;
  if (el.id === 'pShape') document.body.classList.toggle('shape-curved', el.value === 'curved');
  pUpd();
}));
function setupDrop(drop, input, onFiles) {
  input.addEventListener('change', () => { onFiles([...input.files]); input.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => onFiles([...e.dataTransfer.files]));
}
setupDrop($('#pDrop'), $('#pFiles'), (f) => { PH.ensure(); PH.add(f); });
$('#pThumbs').addEventListener('click', (e) => {
  const rm = e.target.closest('[data-rm]');
  if (rm) {
    const i = +rm.dataset.rm; URL.revokeObjectURL(PH.imgs[i].url); PH.imgs.splice(i, 1);
    PH.sel = Math.min(PH.sel, PH.imgs.length - 1); PH.renderThumbs(); PH.update(); return;
  }
  const t = e.target.closest('.thumb'); if (t) { PH.sel = +t.dataset.i; PH.renderThumbs(); PH.update(); }
});
$('#pRot').onclick = (e) => { PH.ensure(); PH.view.autoRotate = !PH.view.autoRotate; e.currentTarget.classList.toggle('on', PH.view.autoRotate); };
$('#pLight').onclick = (e) => {
  PH.ensure();
  const on = e.currentTarget.classList.toggle('on');
  const m = PH.view.group.children[0]?.material; if (!m) return;
  m.emissive?.set(on ? 0x6b5a3a : 0x000000); PH.view.dirty = true;
};
$('#pSTL').onclick = () => { if (PH.last) { download(toSTL(PH.last.full, PH.last.name), PH.last.name + '.stl'); toast('تم تجهيز ملف STL ✓'); } };
$('#pOrder').onclick = () => { if (!PH.last) return toast('ارفع صورة أولاً'); O.source = 'photo'; go('order'); };
$('#pAll').onclick = async () => {
  const btn = $('#pAll'); btn.disabled = true;
  const zip = new JSZip(); const P = PH.params();
  try {
    for (let i = 0; i < PH.imgs.length; i++) {
      btn.textContent = `جارٍ ${i + 1}/${PH.imgs.length}…`; await nextFrame();
      const out = PH.build(PH.imgs[i], P);
      zip.file(`${String(i + 1).padStart(2, '0')}_${safeName(PH.imgs[i].name)}_${PH.mode}.stl`, toSTL(out.full || out.parts[0].tris));
    }
    download(await zip.generateAsync({ type: 'blob' }), `models_${PH.mode}.zip`);
    toast(`تم تحويل ${PH.imgs.length} صورة ✓`);
  } catch (e) { toast('خطأ: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = '📦 تحويل كل الصور ZIP'; }
};

/* ================= الطلب ================= */
const MODE_LABEL = { lithophane: 'ليثوفين', relief: 'نقش بارز', face: 'نقش وجه', keychain: 'ميدالية من صورة', cookie: 'قالب كوكيز' };
const O = {
  source: 'keychain', img: null,
  tier(q) { return [...CONFIG.tiers].reverse().find((t) => q >= t.min) || { off: 0 }; },
  info() {
    if (this.source === 'photo' && PH.last) {
      return {
        title: `${MODE_LABEL[PH.last.mode]} من صورة`, unit: PH.last.stats.price,
        rows: [['النوع', MODE_LABEL[PH.last.mode]], ['المقاس', PH.last.stats.box.map((v) => fmt(v)).join(' × ') + ' مم'], ['الوزن', `${fmt(PH.last.stats.grams)} غ`]],
        snap: () => PH.view.snapshot(), files: () => [[PH.last.name + '.stl', toSTL(PH.last.full, PH.last.name)]],
      };
    }
    const P = K.P; if (!P) return null;
    const back = P.back === 'text' ? P.backText : P.back === 'qr' ? 'QR' : '—';
    return {
      title: TEMPLATES[P.template].label, unit: K.stats?.price ?? CONFIG.minPrice,
      rows: [
        ['الشكل', `${TEMPLATES[P.template].icon} ${TEMPLATES[P.template].label}`],
        ['الاسم', P.logoStencil && P.logoPlace === 'name' ? '(الشعار)' : P.text1 || '—'],
        ['السطر الثاني', P.text2 || '—'],
        ['الشعار', P.logoStencil && P.logoPlace !== 'none' ? 'نعم' : 'لا'],
        ['الوجه الخلفي', back],
        ['المقاس', K.stats.box.map((v) => fmt(v)).join(' × ') + ' مم'],
        ['الألوان', `<i class="sw" style="background:${P.c1}"></i> <i class="sw" style="background:${P.c2}"></i>`],
      ],
      snap: () => K.view.snapshot(), files: async () => [[K.fileBase() + '.stl', K.stl()], [K.fileBase() + '.3mf', await export3MF([{ name: K.fileBase(), parts: K.parts(K.S) }])]],
    };
  },
  async render() {
    if (this.source === 'keychain') {
      if (!K.view) { K.ensure(); await new Promise((r) => setTimeout(r, 900)); }
      else if (K.platePreview) await K.update();
    }
    const I = this.info();
    $('#oUsePhoto').hidden = !PH.last;
    if (!I) { $('#oSummary').innerHTML = '<li>صمّم ميدالية أولاً.</li>'; return; }
    await nextFrame();
    this.img = I.snap(); $('#oImg').src = this.img;
    $('#oSummary').innerHTML = I.rows.map(([k, v]) => `<li><span>${k}</span><span>${k === 'الألوان' ? v : escapeHTML(v)}</span></li>`).join('');
    this.calc();
  },
  calc() {
    const I = this.info(); if (!I) return;
    const q = Math.max(1, +$('#oQty').value || 1), t = this.tier(q);
    const unit = I.unit * (1 - t.off / 100), total = Math.ceil(unit * q);
    $('#oUnit').textContent = `${fmt(unit, 2)} ${CONFIG.currency}`;
    $('#oDisc').textContent = t.off ? `${t.off}٪` : '—';
    $('#oTotal').textContent = `${fmt(total, 0)} ${CONFIG.currency}`;
    $('#oTiers').innerHTML = '<tr><th>الكمية</th><th>الخصم</th><th>سعر الحبة</th></tr>' + CONFIG.tiers.map((x) =>
      `<tr class="${x === t ? 'on' : ''}"><td>${x.min}+</td><td>${x.off ? x.off + '٪' : '—'}</td><td>${fmt(I.unit * (1 - x.off / 100), 2)}</td></tr>`).join('');
    return { I, q, t, unit, total };
  },
  text() {
    const c = this.calc(); if (!c) return '';
    const rows = c.I.rows.filter(([k]) => k !== 'الألوان').map(([k, v]) => `• ${k}: ${v}`);
    if (this.source === 'keychain' && K.P) rows.push(`• الألوان: ${K.P.c1} / ${K.P.c2}`);
    return [`مرحباً، أبي أطلب طباعة: ${c.I.title}`, ...rows, `• الكمية: ${c.q}`,
      `• السعر التقريبي: ${fmt(c.total, 0)} ${CONFIG.currency}${c.t.off ? ` (خصم ${c.t.off}٪)` : ''}`,
      `• الاستلام: ${$('#oDelivery').value}`, `• الاسم: ${$('#oName').value || '—'}`, `• الجوال: ${$('#oPhone').value || '—'}`,
      $('#oNotes').value ? `• ملاحظات: ${$('#oNotes').value}` : ''].filter(Boolean).join('\n');
  },
};
['oName', 'oPhone'].forEach((id) => { $('#' + id).value = store.get(id, ''); $('#' + id).addEventListener('change', (e) => store.set(id, e.target.value)); });
$('#oQty').addEventListener('input', () => O.calc());
$('#oUsePhoto').onclick = () => { O.source = 'photo'; O.render(); };
$('#oCopy').onclick = async () => { try { await navigator.clipboard.writeText(O.text()); toast('تم النسخ ✓'); } catch { toast('تعذر النسخ'); } };
$('#oFiles').onclick = async () => { const I = O.info(); if (!I) return; for (const [n, b] of await I.files()) download(b, n); };
$('#oSend').onclick = async () => {
  const text = O.text(); if (!text) return toast('صمّم شيئاً أولاً');
  if (!CONFIG.whatsapp && navigator.canShare) {
    try {
      const png = new File([await (await fetch(O.img)).blob()], 'design.png', { type: 'image/png' });
      if (navigator.canShare({ files: [png] })) { await navigator.share({ files: [png], text }); return; }
    } catch (e) { if (e.name === 'AbortError') return; }
  }
  window.open(`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text)}`, '_blank');
};

/* ================= المعرض ================= */
const G = {
  loaded: false,
  async load() {
    if (this.loaded) return; this.loaded = true;
    try {
      const list = await (await fetch('gallery/gallery.json')).json();
      $('#galleryGrid').innerHTML = list.map((g, i) => `<article class="gcard"><img src="gallery/${g.img}" alt="${escapeHTML(g.title)}" loading="lazy"><div><h3>${escapeHTML(g.title)}</h3><p>${escapeHTML(g.desc || '')}</p>${g.preset ? `<button class="btn small" data-preset="${i}">✏️ صمّم مثلها</button>` : ''}</div></article>`).join('');
      $('#galleryGrid').onclick = (e) => {
        const b = e.target.closest('[data-preset]'); if (!b) return;
        const def = K.read(); K.write({ ...def, ...list[+b.dataset.preset].preset }); go('keychain'); K.update();
      };
    } catch { $('#galleryGrid').innerHTML = '<p class="hint">لا توجد صور بعد.</p>'; }
  },
};

/* ================= الذكاء الاصطناعي ================= */
const A = { view: null, imgs: [], glb: null, tris: null, abort: null };
const aEnsure = () => { if (!A.view) A.view = new Viewer($('#aView')); };
$('#aKey').value = AI.getKey();
$('#aKey').addEventListener('change', (e) => AI.setKey(e.target.value.trim()));
function aThumbs() {
  $('#aThumbs').innerHTML = A.imgs.map((it, i) => `<div class="thumb"><img src="${it.url}" alt=""><button data-rm="${i}" aria-label="إزالة">✕</button></div>`).join('');
}
setupDrop($('#aDrop'), $('#aFiles'), async (files) => {
  for (const f of files) if (f.type.startsWith('image/') && A.imgs.length < 4) A.imgs.push(await loadImage(f));
  if (files.length && A.imgs.length >= 4) toast('الحد الأقصى 4 صور');
  aThumbs();
});
$('#aThumbs').addEventListener('click', (e) => { const rm = e.target.closest('[data-rm]'); if (rm) { A.imgs.splice(+rm.dataset.rm, 1); aThumbs(); } });
async function aShow(buffer) {
  aEnsure();
  A.glb = buffer;
  A.tris = await AI.glbToTris(buffer, +$('#aSize').value || 80, $('#aAxis').value);
  A.view.show([{ tris: A.tris, color: '#d9d2c5' }]);
  $('#aEmpty').hidden = true;
  $('#aStats').innerHTML = costStats(A.tris).html;
  $('#aSTL').disabled = false; $('#aGLBdl').disabled = false;
}
$('#aGo').onclick = async () => {
  if (A.abort) { A.abort.abort(); return; }
  AI.setKey($('#aKey').value.trim());
  if (!A.imgs.length) return toast('ارفع صورة واحدة على الأقل');
  if (!AI.getKey()) return toast('أدخل مفتاح Meshy API');
  const prog = $('#aProg'); prog.hidden = false;
  const setP = (p, s) => { prog.firstElementChild.style.width = p + '%'; prog.lastElementChild.textContent = `${s} — ${p}%`; };
  setP(0, 'جارٍ الرفع');
  A.abort = new AbortController(); $('#aGo').textContent = '✕ إلغاء';
  try {
    const r = await AI.generate(A.imgs.map((x) => x.img), (p, s) => setP(p, s === 'IN_PROGRESS' ? 'جارٍ البناء' : 'في الانتظار'), A.abort.signal);
    setP(100, 'اكتمل');
    await aShow(r.buffer);
    toast('تم توليد المجسم ✓');
  } catch (e) {
    console.error(e);
    const msg = /Failed to fetch|NetworkError/i.test(e.message) ? 'تعذر الاتصال بخادم Meshy (تحقق من الإنترنت أو المفتاح)' : e.message;
    setP(0, 'خطأ: ' + msg); toast(msg, 5000);
  } finally { A.abort = null; $('#aGo').textContent = '🧠 ابدأ التوليد'; }
};
$('#aGLB').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { await aShow(await f.arrayBuffer()); } catch (err) { toast('تعذر قراءة الملف: ' + err.message); }
});
['aSize', 'aAxis'].forEach((id) => $('#' + id).addEventListener('change', () => { if (A.glb) aShow(A.glb); }));
$('#aRot').onclick = (e) => { aEnsure(); A.view.autoRotate = !A.view.autoRotate; e.currentTarget.classList.toggle('on', A.view.autoRotate); };
$('#aSTL').onclick = () => { if (A.tris) download(toSTL(A.tris, 'ai_model'), `ai_model_${$('#aSize').value}mm.stl`); };
$('#aGLBdl').onclick = () => { if (A.glb) download(new Blob([A.glb], { type: 'model/gltf-binary' }), 'ai_model.glb'); };


/* ================= واجهة البداية ================= */
(async function hero() {
  const v = new Viewer($('#heroView'));
  v.autoRotate = true; v.grid.visible = false; v.controls.enableZoom = false;
  const designs = [
    { template: 'cup', text1: 'Bean House', text2: 'SPECIALTY COFFEE', size: 55 },
    { template: 'dallah', text1: 'قهوة', text2: 'ARABIC COFFEE', size: 60 },
    { template: 'espresso', text1: 'ESPRESSO', text2: 'BAR', size: 55 },
    { template: 'bean', text1: 'Mocha', text2: 'ROASTERY', size: 55 },
  ];
  const base = { ...K.read(), res: 0.25, back: 'none', logoStencil: null, logoShape: null };
  await K.fonts(base);
  const built = [];
  for (const d of designs) {
    const P = { ...base, ...d };
    try { built.push(K.parts(buildSolids(rasterize(P)), P)); } catch (e) { console.error(e); }
    if (built.length === 1) { v.show(built[0]); v.camera.position.set(0, -42, 82); v.controls.target.set(0, 0, 2); v.dirty = true; }
    await nextFrame();
  }
  let i = 0;
  setInterval(() => {
    if (!$('#home').classList.contains('active') || document.hidden) return;
    i = (i + 1) % built.length; v.show(built[i], { keepView: true });
  }, 4000);
})();

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
go(location.hash.slice(1) || 'home', false);
setTimeout(() => window.scrollTo(0, 0), 60);
