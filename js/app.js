import { CONFIG } from './config.js';
import { Viewer } from './viewer.js';
import { toSTL, volumeOf, bboxOf, mergeTris } from './mesh.js';
import { TEMPLATES, rasterize, buildSolids, buildSolidsAsync, makeStencil } from './keychain.js';
import { lithophane, relief, faceRelief, cookieCutter, removeBackground } from './photo.js';
import { export3MF, arrange, bedOutline, BEDS } from './export.js';
import { buildCup, buildModel, MODELS } from './cup3d.js';
import { buildShape, SHAPES } from './shapes.js';
import { setLang } from './i18n.js';
import { modal, openAR, storyImage, STORY_STYLES, designURL, shareLink, parseHash } from './extras.js';
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
  if (id === 'cup3d') C3.ensure();
  if (id === 'shapes') SH.ensure();
  if (id === 'order') O.render();
  if (id === 'gallery') G.load();
  if (id === 'occasions') G.load('gallery/occasions.json', '#occGrid');
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-go]');
  if (el) { e.preventDefault(); go(el.dataset.go); }
});

/* ================= تراجع / إعادة ================= */
const hist = {
  S: { k: { past: [], future: [], cur: null, lock: false }, c: { past: [], future: [], cur: null, lock: false }, s: { past: [], future: [], cur: null, lock: false } },
  snap(P) { const o = { ...P }; delete o.logoStencil; delete o.logoShape; delete o.photo; return JSON.stringify(o); },
  push(ns, P) {
    const S = this.S[ns], v = this.snap(P);
    if (S.lock) { S.lock = false; S.cur = v; this.ui(); return; }
    if (v === S.cur) return;
    if (S.cur) { S.past.push(S.cur); if (S.past.length > 60) S.past.shift(); }
    S.cur = v; S.future = []; this.ui();
  },
  go(ns, dir) {
    const S = this.S[ns], from = dir < 0 ? S.past : S.future, to = dir < 0 ? S.future : S.past;
    if (!from.length) return;
    to.push(S.cur); S.cur = from.pop(); S.lock = true;
    const P = JSON.parse(S.cur);
    if (ns === 'k') { K.write({ ...P, logoStencil: K.logoStencil }); K.update(); } else if (ns === 's') { SH.write(P); SH.update(); } else { C3.write(P); C3.update(); }
    this.ui();
  },
  ui() {
    for (const ns of ['k', 'c', 's']) {
      const S = this.S[ns];
      const u = document.getElementById((ns === 's' ? 'sh' : ns) + 'Undo'), r = document.getElementById((ns === 's' ? 'sh' : ns) + 'Redo');
      if (u) u.disabled = !S.past.length; if (r) r.disabled = !S.future.length;
    }
  },
};
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
  const ns = $('#keychain').classList.contains('active') ? 'k' : $('#cup3d').classList.contains('active') ? 'c' : $('#shapes').classList.contains('active') ? 's' : null;
  if (!ns) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); hist.go(ns, -1); }
  else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); hist.go(ns, 1); }
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
    set('#kBack', P.back); set('#kBackText', P.backText); set('#kNozzle', P.nozzle); set('#kLogoPlace', P.logoPlace);
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
    $('#kSize').max = TEMPLATES[t].max || 140;
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
      const S = await buildSolidsAsync(R);
      const first = !this.R || this.platePreview;
      this.platePreview = false;
      this.view.show(this.parts(S, P), { keepView: !first && this.P?.template === P.template && this.P?.size === P.size });
      this.applyFlip();
      this.P = P; this.R = R; this.S = S;
      hist.push('k', P);
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
$('#kUndo').onclick = () => hist.go('k', -1); $('#kRedo').onclick = () => hist.go('k', 1);
$('#kCmp').onclick = (e) => { const on = K.view.toggleRef(); e.currentTarget.classList.toggle('on', on); if (on) toast('📏 بطاقة بنكية بمقاسها الحقيقي 85×54 مم للمقارنة'); };
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

/* ================= مجسمات 3D ================= */
const CUP_PRESETS = [
  { lid: '#3a2a22', cup: '#f1e6cf', sleeve: '#8a5a36', deco: '#6b4226', loop: '#d4a017' },
  { lid: '#ffffff', cup: '#ffffff', sleeve: '#00704a', deco: '#ffffff', loop: '#c0c0c0' },
  { lid: '#111111', cup: '#2b2b2b', sleeve: '#c8a165', deco: '#111111', loop: '#d4a017' },
  { lid: '#f4c2c2', cup: '#fff5f5', sleeve: '#d16d8a', deco: '#fff5f5', loop: '#e8e8e8' },
  { lid: '#1f3b57', cup: '#e6f2ff', sleeve: '#4a90c2', deco: '#ffffff', loop: '#d4a017' },
  { lid: '#1e4d3a', cup: '#f3efe2', sleeve: '#c9a227', deco: '#1e4d3a', loop: '#c9a227' },
];
const PART_NAMES = {};
Object.values(MODELS).forEach((M) => M.parts.forEach(([k, n]) => (PART_NAMES[k] ||= n)));
const C3 = {
  view: null, parts: null, P: null, logo: null, stencil: null, busy: false, pending: false,
  model: store.get('c_model', 'takeaway'), colorsBy: store.get('c_colors', {}),
  M() { return MODELS[this.model] || MODELS.takeaway; },
  ensure() { if (!this.view) { this.view = new Viewer($('#cView')); this.view.autoRotate = true; this.update(); } },
  colors() { const o = {}; $$('#cColors input').forEach((e) => (o[e.dataset.k] = e.value)); return o; },
  renderColors() {
    const saved = this.colorsBy[this.model] || {};
    $('#cColors').innerHTML = this.M().parts.map(([k, n, d]) => `<label><input type="color" data-k="${k}" value="${saved[k] || d}"><span>${n}</span></label>`).join('');
    $('#cPresets').hidden = this.model !== 'takeaway';
  },
  setModel(m, upd = true) {
    if (!MODELS[m]) m = 'takeaway';
    this.model = m; store.set('c_model', m);
    const M = this.M();
    $$('#cModels .tpl').forEach((b) => b.classList.toggle('active', b.dataset.m === m));
    const h = $('#cHeight'); h.min = M.min; h.max = M.max; h.value = M.def; $('#cHeightO').textContent = M.def;
    $('#cSizeLbl').textContent = M.sizeLabel || 'الارتفاع';
    this.renderColors(); this.sync();
    if (upd) { this.parts = null; this.update(); }
  },
  read() {
    return {
      model: this.model, size: +$('#cHeight').value, height: +$('#cHeight').value, content: $('#cContent').value,
      text1: this.model === 'letters' ? $('#cLetters').value.trim() : $('#cText1').value.trim(), text2: $('#cText2').value.trim(),
      font: $('#cFont').value, backContent: $('#cBack').value, backText: $('#cBackText').value.trim(),
      sleeve: $('#cSleeveOn').checked, loop: $('#cLoopOn').checked, hole: +$('#cHole').value, segments: +$('#cSeg').value,
      depth: +$('#cDepth').value, base: $('#cBase').checked, bridge: $('#cBridge').checked,
      logoStencil: this.stencil, colors: this.colors(),
    };
  },
  write(P) {
    const set = (id, v) => { const e = $(id); if (e && v != null) e.type === 'checkbox' ? (e.checked = v) : (e.value = v); };
    this.setModel(P.model || 'takeaway', false);
    set('#cHeight', P.size || P.height); set('#cContent', P.content); set('#cText2', P.text2); set('#cFont', P.font);
    if ((P.model || 'takeaway') === 'letters') set('#cLetters', P.text1); else set('#cText1', P.text1);
    set('#cBack', P.backContent); set('#cBackText', P.backText); set('#cSleeveOn', P.sleeve); set('#cLoopOn', P.loop); set('#cHole', P.hole);
    set('#cDepth', P.depth); set('#cBase', P.base); set('#cBridge', P.bridge);
    if (P.colors) $$('#cColors input').forEach((e) => { if (P.colors[e.dataset.k]) e.value = P.colors[e.dataset.k]; });
    $('#cHeightO').textContent = $('#cHeight').value; this.sync();
  },
  sync() {
    const M = this.M();
    const old = [...document.body.classList].filter((c) => /^(c[cb]-|mod-|nodeco$|noback$)/.test(c));
    for (const c of old) document.body.classList.toggle(c, false);
    document.body.classList.add('cc-' + $('#cContent').value, 'cb-' + $('#cBack').value, 'mod-' + this.model);
    if (!M.deco) document.body.classList.add('nodeco');
    if (!M.back) document.body.classList.add('noback');
  },
  makeStencil() {
    if (!this.logo) return;
    if ($('#cBg').checked && !this.logo.clean) this.logo.clean = removeBackground(this.logo.img);
    const src = $('#cBg').checked ? this.logo.clean : this.logo.img;
    this.stencil = makeStencil(src, { hasAlpha: alphaFrac(src) > 0.02, threshold: +$('#cThresh').value }).detail;
  },
  async update() {
    if (!this.view) return;
    if (this.busy) { this.pending = true; return; }
    this.busy = true; $('#cBusy').hidden = false; await nextFrame();
    try {
      const P = this.read();
      try { await Promise.all([document.fonts.load(`900 40px "${P.font}"`, P.text1 + P.backText || 'a'), document.fonts.load(`800 40px "${P.font}"`, P.text1 || 'a'), document.fonts.load(`700 40px "${P.font}"`, P.text2 || 'a')]); } catch {}
      const out = buildModel(P);
      const first = !this.parts;
      const defs = Object.fromEntries(this.M().parts.map(([k, , d]) => [k, d]));
      this.parts = out.map((p) => ({ ...p, name: PART_NAMES[p.key] || p.key, color: P.colors[p.key] || defs[p.key] || '#cccccc' }));
      this.P = P;
      this.view.show(this.parts, { keepView: !first && this.lastKey === P.model + P.size });
      if (first || this.lastKey !== P.model + P.size) {
        const b = bboxOf(mergeTris(this.parts.map((p) => p.tris))).size, s = Math.max(b[0], b[1] * 0.8, b[2]);
        this.view.camera.position.set(s * 0.75, -s * 2.05, s * 1.3); this.view.controls.target.set(0, 0, b[2] * 0.5); this.view.dirty = true;
      }
      this.lastKey = P.model + P.size;
      hist.push('c', P);
      const full = mergeTris(this.parts.map((p) => p.tris));
      this.stats = costStats(full);
      $('#cStats').innerHTML = this.stats.html;
      const w = [];
      const M = this.M();
      if (M.deco && P.content === 'logo' && !P.logoStencil) w.push('ارفع صورة الشعار.');
      if (M.deco && ['text', 'beans_text'].includes(P.content) && !P.text1) w.push('اكتب النص اللي تبيه على الكم.');
      if (P.model === 'takeaway' && P.size < 32 && ['text', 'beans_text'].includes(P.content) && P.text1.length > 10) w.push('النص طويل على كوب صغير — كبّر الكوب أو اختصر الكتابة حتى تكون مقروءة.');
      if (P.model === 'mug') w.push('المقبض فيه جزء معلّق — فعّل دعامات خفيفة (Tree) تحت المقبض فقط.');
      if (P.model === 'dallah') w.push('المصب والمقبض يحتاجون دعامات خفيفة (Tree supports).');
      if (P.model === 'letters' && this.stats.box[0] > 240) w.push('الكلمة أطول من أغلب البلاطات — صغّر الحروف أو اختصر الكلمة.');
      $('#cWarn').hidden = !w.length; $('#cWarn').innerHTML = w.map((x) => '⚠️ ' + x).join('<br>');
    } catch (e) { console.error(e); toast('تعذر توليد المجسم: ' + e.message); }
    finally {
      this.busy = false; $('#cBusy').hidden = true;
      if (this.pending) { this.pending = false; this.update(); }
    }
  },
  recolor() {
    const c = this.colors();
    this.colorsBy[this.model] = c; store.set('c_colors', this.colorsBy);
    if (this.parts) this.parts.forEach((p, i) => { if (c[p.key]) { p.color = c[p.key]; this.view.group.children[i]?.material.color.set(c[p.key]); } });
    if (this.P) this.P.colors = c;
    if (this.view) this.view.dirty = true;
  },
  base() { return `${this.model}_${safeName(this.P?.text1 || 'design')}_${this.P?.size}mm`; },
};
$('#cModels').innerHTML = Object.entries(MODELS).map(([k, M]) => `<button class="tpl" data-m="${k}" title="${M.label}"><span>${M.icon}</span>${M.label}</button>`).join('');
$('#cModels').addEventListener('click', (e) => { const b = e.target.closest('.tpl'); if (b) C3.setModel(b.dataset.m); });
$('#cPresets').innerHTML = CUP_PRESETS.map((p, i) => `<button data-i="${i}" title="ألوان جاهزة">${['lid', 'cup', 'sleeve', 'deco', 'loop'].map((k) => `<i style="background:${p[k]}"></i>`).join('')}</button>`).join('');
$('#cPresets').onclick = (e) => {
  const b = e.target.closest('[data-i]'); if (!b) return;
  const p = CUP_PRESETS[+b.dataset.i]; $$('#cColors input').forEach((x) => { if (p[x.dataset.k]) x.value = p[x.dataset.k]; }); C3.recolor();
};
$('#cColors').addEventListener('input', () => C3.recolor());
C3.setModel(C3.model, false);
const cUpd = debounce(() => C3.update(), 300);
$$('#cup3d .panel input, #cup3d .panel select').forEach((el) => {
  if (el.id === 'cLogo' || el.type === 'color') return;
  el.addEventListener('input', () => {
    const o = $('#' + el.id + 'O'); if (o) o.textContent = el.value;
    if (el.id === 'cContent' || el.id === 'cBack') C3.sync();
    if ((el.id === 'cBg' || el.id === 'cThresh') && C3.logo) C3.makeStencil();
    cUpd();
  });
});
$('#cLogo').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { C3.logo = await loadImage(f); C3.makeStencil(); $('#cContent').value = 'logo'; C3.sync(); C3.update(); } catch (err) { toast(err.message); }
});
$('#cUndo').onclick = () => hist.go('c', -1); $('#cRedo').onclick = () => hist.go('c', 1);
$('#cCmp').onclick = (e) => { const on = C3.view.toggleRef(); e.currentTarget.classList.toggle('on', on); if (on) toast('📏 بطاقة بنكية بمقاسها الحقيقي 85×54 مم للمقارنة'); };
$('#cRot').onclick = (e) => { C3.view.autoRotate = !C3.view.autoRotate; e.currentTarget.classList.toggle('on', C3.view.autoRotate); };
$('#c3MF').onclick = async () => { if (!C3.parts) return; download(await export3MF([{ name: C3.base(), parts: C3.parts }]), C3.base() + '.3mf'); toast('3MF ملوّن جاهز ✓'); };
$('#cSTL').onclick = () => { if (C3.parts) download(toSTL(mergeTris(C3.parts.map((p) => p.tris)), 'model3d'), C3.base() + '.stl'); };
$('#cZip').onclick = async () => {
  if (!C3.parts) return;
  const zip = new JSZip();
  C3.parts.forEach((p, i) => zip.file(`${i + 1}_${p.key}_${p.color.slice(1)}.stl`, toSTL(p.tris, p.key)));
  zip.file('README.txt', 'استورد كل الملفات معاً كقطعة واحدة متعددة الأجزاء، واختر لون كل جزء.\n');
  download(await zip.generateAsync({ type: 'blob' }), C3.base() + '_parts.zip');
};
$('#cPNG').onclick = () => fetch(C3.view.snapshot()).then((r) => r.blob()).then((b) => download(b, C3.base() + '.png'));
$('#cOrder').onclick = () => { O.source = 'cup3d'; go('order'); };


/* ================= مجسم من أبعادك ================= */
const SH_PRESETS = [
  { n: '🎁 صندوق هدية', v: { shape: 'box', w: 90, d: 90, h: 55, corner: 8, hollow: true, lid: true, wall: 2.4, content: 'text', faces: 'top', text1: 'Gift' } },
  { n: '💍 علبة خاتم', v: { shape: 'cyl', w: 56, d: 56, h: 40, hollow: true, lid: true, wall: 2, content: 'none' } },
  { n: '✏️ حامل أقلام', v: { shape: 'cyl', w: 80, d: 80, h: 100, hollow: true, lid: false, wall: 3, content: 'text', faces: 'front', text1: 'Pens' } },
  { n: '🖼️ لوح صورة', v: { shape: 'box', w: 100, d: 10, h: 130, corner: 4, hollow: false, content: 'photo', faces: 'front', depth: 1.6 } },
  { n: '🧊 مكعب', v: { shape: 'box', w: 40, d: 40, h: 40, corner: 0, hollow: false, content: 'text', faces: 'sides4', text1: 'A' } },
  { n: '❤️ علبة قلب', v: { shape: 'heart', w: 90, d: 85, h: 40, hollow: true, lid: true, wall: 2.4, content: 'none' } },
  { n: '🔮 كرة', v: { shape: 'sphere', w: 60, d: 60, h: 60, content: 'none', loop: true } },
  { n: '🔺 هرم', v: { shape: 'pyramid', w: 60, d: 60, h: 60, content: 'none' } },
];
const SH = {
  view: null, parts: null, P: null, img: null, stencil: null, busy: false, pending: false,
  shape: store.get('s_shape', 'box'), colorsBy: store.get('s_colors', {}),
  ensure() { if (!this.view) { this.view = new Viewer($('#shView')); this.view.autoRotate = true; this.update(); } },
  num(id, lo, hi, def) { const v = parseFloat($('#' + id).value); return Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : def)); },
  colors() { const o = {}; $$('#shColors input').forEach((e) => (o[e.dataset.k] = e.value)); return o; },
  src() { if (!this.img) return null; if ($('#shBg').checked) { this.img.clean ||= removeBackground(this.img.img); return this.img.clean; } return this.img.img; },
  makeStencil() { const s = this.src(); if (!s) { this.stencil = null; return; } this.stencil = makeStencil(s, { hasAlpha: alphaFrac(s) > 0.02, threshold: +$('#shThresh').value }).detail; },
  read() {
    const shape = this.shape, w = this.num('shW', 10, 250, 80), d = this.num('shD', 10, 250, 80), h = this.num('shH', 5, 250, 50);
    return {
      shape, w, d, h, corner: Math.min(+$('#shCorner').value, w / 2, d / 2), hollow: $('#shHollow').checked, lid: $('#shLid').checked,
      wall: Math.min(this.num('shWall', 1.2, 8, 2.4), Math.min(w, d) / 2 - 1), clearance: this.num('shClr', 0.1, 0.8, 0.3),
      content: SHAPES[shape].flat ? $('#shContent').value : 'none', faces: $('#shFaces').value, depth: +$('#shDepth').value,
      contrast: +$('#shContrast').value, invert: $('#shInv').checked, text1: $('#shText1').value.trim(), text2: $('#shText2').value.trim(), font: $('#shFont').value,
      loop: $('#shLoop').checked, hole: this.num('shHole', 3, 12, 5), colors: this.colors(),
      photo: this.src(), logoStencil: this.stencil,
    };
  },
  write(P) {
    const set = (id, v) => { const e = $(id); if (e && v != null) e.type === 'checkbox' ? (e.checked = !!v) : (e.value = v); };
    this.setShape(P.shape || 'box', false);
    set('#shW', P.w); set('#shD', P.d); set('#shH', P.h); set('#shCorner', P.corner); set('#shHollow', P.hollow); set('#shLid', P.lid);
    set('#shWall', P.wall); set('#shClr', P.clearance); set('#shContent', P.content); set('#shFaces', P.faces); set('#shDepth', P.depth);
    set('#shContrast', P.contrast); set('#shInv', P.invert); set('#shText1', P.text1); set('#shText2', P.text2); set('#shFont', P.font);
    set('#shLoop', P.loop); set('#shHole', P.hole);
    if (P.colors) $$('#shColors input').forEach((e) => { if (P.colors[e.dataset.k]) e.value = P.colors[e.dataset.k]; });
    ['shCorner', 'shDepth', 'shContrast'].forEach((id) => ($('#' + id + 'O').textContent = $('#' + id).value));
    this.sync();
  },
  setShape(s, upd = true) {
    if (!SHAPES[s]) s = 'box';
    this.shape = s; store.set('s_shape', s);
    $$('#shShapes .tpl').forEach((b) => b.classList.toggle('active', b.dataset.s === s));
    this.sync(); if (upd) this.update();
  },
  sync() {
    const S = SHAPES[this.shape], hollow = S.hollow && $('#shHollow').checked, lid = hollow && $('#shLid').checked, c = $('#shContent').value, deco = S.flat && c !== 'none';
    const vis = (sel, on) => $$(sel).forEach((e) => (e.hidden = !on));
    vis('.sh-corner', this.shape === 'box'); vis('.sh-hollow', S.hollow); vis('.sh-hollow-opts', hollow);
    vis('.sh-deco', S.flat); vis('.sh-img', S.flat && (c === 'photo' || c === 'logo')); vis('.sh-photo-only', c === 'photo'); vis('.sh-logo-only', c === 'logo');
    vis('.sh-text', S.flat && c === 'text'); vis('.sh-decoopts', deco);
    const loopOk = !S.noLoop && !hollow; vis('.sh-loopbox', loopOk);
    vis('.sh-loopopt', loopOk && $('#shLoop').checked);
    vis('.sh-c-lid', lid); vis('.sh-c-deco', deco); vis('.sh-c-loop', loopOk && $('#shLoop').checked);
    const ok = this.shape === 'box' ? ['front', 'top', 'front_back', 'sides4', 'all5'] : this.shape === 'cyl' ? ['front', 'top', 'front_back'] : ['top'];
    $$('#shFaces option').forEach((o) => (o.hidden = o.disabled = !ok.includes(o.value)));
    if (!ok.includes($('#shFaces').value)) $('#shFaces').value = ok[0];
  },
  async update() {
    if (!this.view) return;
    if (this.busy) { this.pending = true; return; }
    this.busy = true; $('#shBusy').hidden = false; await nextFrame();
    try {
      const P = this.read();
      if (P.content === 'text') { try { await document.fonts.load(`800 40px "${P.font}"`, P.text1 + P.text2 || 'a'); } catch {} }
      const out = buildShape(P), first = !this.parts, key = P.shape + P.w + P.d + P.h;
      const defs = { body: '#e8e2d4', lid: '#c8a165', deco: '#3b2a20', loop: '#d4a017' };
      this.parts = out.map((p) => ({ ...p, name: PART_NAMES[p.key] || p.key, color: P.colors[p.key] || defs[p.key] }));
      this.P = P;
      this.view.show(this.parts, { keepView: !first && this.lastKey === key });
      if (first || this.lastKey !== key) {
        const b = bboxOf(mergeTris(this.parts.map((p) => p.tris))).size, s = Math.max(b[0], b[1] * 0.8, b[2]);
        this.view.camera.position.set(s * 0.75, -s * 1.9, s * 1.2); this.view.controls.target.set(0, 0, b[2] * 0.45); this.view.dirty = true;
      }
      this.lastKey = key;
      hist.push('s', P);
      this.stats = costStats(mergeTris(this.parts.map((p) => p.tris)));
      $('#shStats').innerHTML = this.stats.html;
      const w = [], S = SHAPES[P.shape];
      if (['photo', 'logo'].includes(P.content) && !this.img) w.push('ارفع الصورة اللي تبي تنقشها.');
      if (P.content === 'text' && !P.text1) w.push('اكتب النص اللي تبيه.');
      if (P.hollow && S.hollow && !P.lid && ['top', 'all5'].includes(P.faces) && P.content !== 'none') w.push('الأعلى مفتوح بدون غطاء — النقش على «الأعلى» ما انحط. أضف غطاء أو اختر وجهاً ثانياً.');
      if (P.hollow && S.hollow && P.wall < 1.6) w.push('الجدار رفيع — 1.6 مم أو أكثر أقوى بعد الطباعة.');
      if (P.hollow && S.hollow && P.lid && this.stats.box[0] > 256) w.push('العلبة مع الغطاء أعرض من أغلب البلاطات (256 مم) — صغّر المقاس أو اطبع كل قطعة لوحدها.');
      if (P.hollow && S.hollow && P.lid) w.push('الغطاء مطبوع بوضعية التركيب (الحافة للأسفل) — يحتاج دعامات خفيفة أو اقلبه عند الطباعة.');
      if (P.shape === 'cyl' && P.w !== P.d && P.content !== 'none' && P.faces !== 'top') w.push('النقش الملفوف يحتاج أسطوانة دائرية (العرض = العمق).');
      if (P.shape === 'sphere') w.push('الكرة لها قاعدة مسطحة صغيرة عشان تثبت على السرير.');
      if ((P.shape === 'cone' || P.shape === 'pyramid') && P.h > P.w * 1.5) w.push('الارتفاع كبير على القاعدة — الشكل رفيع وقد يهتز أثناء الطباعة.');
      $('#shWarn').hidden = !w.length; $('#shWarn').innerHTML = w.map((x) => '⚠️ ' + x).join('<br>');
    } catch (e) { console.error(e); toast('تعذر توليد المجسم: ' + e.message); }
    finally { this.busy = false; $('#shBusy').hidden = true; if (this.pending) { this.pending = false; this.update(); } }
  },
  recolor() {
    const c = this.colors(); this.colorsBy = c; store.set('s_colors', c);
    if (this.parts) this.parts.forEach((p, i) => { if (c[p.key]) { p.color = c[p.key]; this.view.group.children[i]?.material.color.set(c[p.key]); } });
    if (this.P) this.P.colors = c;
    if (this.view) this.view.dirty = true;
  },
  base() { return `${this.P?.shape}_${this.P?.w}x${this.P?.d}x${this.P?.h}mm`; },
};
PART_NAMES.body = 'الجسم'; PART_NAMES.lid = 'الغطاء';
$('#shShapes').innerHTML = Object.entries(SHAPES).map(([k, S]) => `<button class="tpl" data-s="${k}" title="${S.label}"><span>${S.icon}</span>${S.label}</button>`).join('');
$('#shShapes').addEventListener('click', (e) => { const b = e.target.closest('.tpl'); if (b) SH.setShape(b.dataset.s); });
$('#shPresets').innerHTML = SH_PRESETS.map((p, i) => `<button class="chip" data-i="${i}">${p.n}</button>`).join('');
$('#shPresets').onclick = (e) => {
  const b = e.target.closest('[data-i]'); if (!b) return;
  const base = { corner: 6, hollow: false, lid: false, wall: 2.4, clearance: 0.3, content: 'none', faces: 'front', depth: 1.2, loop: false, text1: 'Bean House', text2: '' };
  SH.write({ ...base, ...SH_PRESETS[+b.dataset.i].v }); SH.update();
};
if (store.get('s_colors', null)) $$('#shColors input').forEach((e) => { const c = SH.colorsBy[e.dataset.k]; if (c) e.value = c; });
SH.setShape(SH.shape, false);
const shUpd = debounce(() => SH.update(), 300);
$$('#shapes .panel input, #shapes .panel select').forEach((el) => {
  if (el.id === 'shImg' || el.type === 'color') return;
  el.addEventListener('input', () => {
    const o = $('#' + el.id + 'O'); if (o) o.textContent = el.value;
    if (['shContent', 'shHollow', 'shLid', 'shLoop'].includes(el.id)) SH.sync();
    if ((el.id === 'shBg' || el.id === 'shThresh') && SH.img) SH.makeStencil();
    shUpd();
  });
});
$('#shColors').addEventListener('input', () => SH.recolor());
$('#shImg').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { SH.img = await loadImage(f); SH.makeStencil(); if (!['photo', 'logo'].includes($('#shContent').value)) $('#shContent').value = 'photo'; SH.sync(); SH.update(); } catch (err) { toast(err.message); }
});
$('#shRot').onclick = (e) => { SH.view.autoRotate = !SH.view.autoRotate; e.currentTarget.classList.toggle('on', SH.view.autoRotate); };
$('#shCmp').onclick = (e) => { const on = SH.view.toggleRef(); e.currentTarget.classList.toggle('on', on); if (on) toast('📏 بطاقة بنكية بمقاسها الحقيقي 85×54 مم للمقارنة'); };
$('#shUndo').onclick = () => hist.go('s', -1); $('#shRedo').onclick = () => hist.go('s', 1);
$('#sh3MF').onclick = async () => { if (!SH.parts) return; download(await export3MF([{ name: SH.base(), parts: SH.parts }]), SH.base() + '.3mf'); toast('3MF ملوّن جاهز ✓'); };
$('#shSTL').onclick = () => { if (SH.parts) download(toSTL(mergeTris(SH.parts.map((p) => p.tris)), 'shape'), SH.base() + '.stl'); };
$('#shZip').onclick = async () => {
  if (!SH.parts) return;
  const zip = new JSZip(); SH.parts.forEach((p, i) => zip.file(`${i + 1}_${p.key}_${p.color.slice(1)}.stl`, toSTL(p.tris, p.key)));
  download(await zip.generateAsync({ type: 'blob' }), SH.base() + '_parts.zip');
};
$('#shPNG').onclick = () => fetch(SH.view.snapshot()).then((r) => r.blob()).then((b) => download(b, SH.base() + '.png'));
$('#shAR').onclick = () => { if (SH.parts) openAR(SH.parts, { title: SH.P.text1 || '' }); };
$('#shOrder').onclick = () => { O.source = 'shape'; go('order'); };

/* ================= الطلب ================= */
const MODE_LABEL = { lithophane: 'ليثوفين', relief: 'نقش بارز', face: 'نقش وجه', keychain: 'ميدالية من صورة', cookie: 'قالب كوكيز' };
const O = {
  source: 'keychain', img: null,
  tier(q) { return [...CONFIG.tiers].reverse().find((t) => q >= t.min) || { off: 0 }; },
  info() {
    if (this.source === 'cup3d' && C3.parts) {
      const P = C3.P, CL = { beans: 'حبتين قهوة', text: 'كتابة', beans_text: 'حبوب + اسم', logo: 'شعار', none: '—' };
      const names = PART_NAMES, M = C3.M();
      return {
        title: M.label, unit: C3.stats.price,
        rows: [
          ['النوع', `${M.icon} ${M.label}`], ['المقاس', C3.stats.box.map((v) => fmt(v)).join(' × ') + ' مم'], ['النقش', M.deco ? CL[P.content] : '—'],
          ['الكتابة', P.model === 'letters' || ['text', 'beans_text'].includes(P.content) ? [P.text1, P.text2].filter(Boolean).join(' / ') : '—'],
          ['الخلف', P.backContent === 'text' ? P.backText : P.backContent === 'beans' ? 'حبتين قهوة' : '—'],
          ['الألوان', C3.parts.map((p) => `<i class="sw" title="${names[p.key]}" style="background:${p.color}"></i>`).join(' ')],
        ],
        colorsText: C3.parts.map((p) => `${names[p.key]} ${p.color}`).join('، '),
        snap: () => C3.view.snapshot(),
        files: async () => [[C3.base() + '.3mf', await export3MF([{ name: C3.base(), parts: C3.parts }])], [C3.base() + '.stl', toSTL(mergeTris(C3.parts.map((p) => p.tris)))]],
      };
    }
    if (this.source === 'shape' && SH.parts) {
      const P = SH.P, S = SHAPES[P.shape], names = PART_NAMES;
      return {
        title: `${S.label} ${P.w}×${P.d}×${P.h} مم`, unit: SH.stats.price,
        rows: [
          ['النوع', `${S.icon} ${S.label}`], ['التجويف', P.hollow && S.hollow ? (P.lid ? 'مجوّف + غطاء' : 'مجوّف') : '—'], ['المقاس', `${P.w} × ${P.d} × ${P.h} مم`],
          ['النقش', { none: '—', photo: 'صورة بارزة', logo: 'شعار', text: 'كتابة' }[P.content]], ['الكتابة', P.content === 'text' ? [P.text1, P.text2].filter(Boolean).join(' / ') : '—'],
          ['الألوان', SH.parts.map((p) => `<i class="sw" title="${names[p.key]}" style="background:${p.color}"></i>`).join(' ')],
        ],
        colorsText: SH.parts.map((p) => `${names[p.key]} ${p.color}`).join('، '),
        snap: () => SH.view.snapshot(),
        files: async () => [[SH.base() + '.3mf', await export3MF([{ name: SH.base(), parts: SH.parts }])], [SH.base() + '.stl', toSTL(mergeTris(SH.parts.map((p) => p.tris)))]],
      };
    }
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
    if (this.source === 'cup3d' && !C3.parts) { C3.ensure(); await new Promise((r) => setTimeout(r, 1500)); }
    if (this.source === 'shape' && !SH.parts) { SH.ensure(); await new Promise((r) => setTimeout(r, 1500)); }
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
    if (c.I.colorsText) rows.push(`• الألوان: ${c.I.colorsText}`);
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
/* ================= معرض + مناسبات ================= */
function cardGrid(list, gridSel, base) {
  $(gridSel).innerHTML = list.map((g, i) => `<article class="gcard"><img src="${base}${g.img}" alt="${escapeHTML(g.title)}" loading="lazy"><div><h3>${escapeHTML(g.title)}</h3><p>${escapeHTML(g.desc || '')}</p>${g.preset ? `<button class="btn small" data-preset="${i}">✏️ صمّم مثلها</button>` : g.go ? `<button class="btn small" data-go="${g.go}">✏️ صمّم مثلها</button>` : ''}</div></article>`).join('');
  $(gridSel).onclick = (e) => {
    const b = e.target.closest('[data-preset]'); if (!b) return;
    const pre = list[+b.dataset.preset].preset;
    if (pre.page === 'cup3d') { C3.write(pre); go('cup3d'); C3.update(); return; }
    K.ensure(); const def = K.read(); K.write({ ...def, back: 'none', logoPlace: 'none', ...pre }); go('keychain'); K.update();
  };
}
const G = {
  done: {},
  async load(file = 'gallery/gallery.json', grid = '#galleryGrid') {
    if (this.done[file]) return; this.done[file] = true;
    try { cardGrid(await (await fetch(file)).json(), grid, 'gallery/'); }
    catch { $(grid).innerHTML = '<p class="hint">لا توجد صور بعد.</p>'; }
  },
};

/* ================= AR + ستوري + مشاركة ================= */
const KEEP_K = ['template', 'text1', 'text2', 'qr', 'font', 'textMode', 'size', 'baseH', 'raiseH', 'hole', 'res', 'border', 'decor', 'c1', 'c2', 'back', 'backText', 'nozzle'];
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const kDesign = () => pick(K.read(), KEEP_K);
const cDesign = () => { const P = C3.read(); delete P.logoStencil; return P; };
const site = () => location.host || 'kkhatab.me';

async function openStory({ view, title, sub, qrUrl, font }) {
  const snap = view.snapshot(1400, 1400);
  const st = { format: 'story', style: 0 };
  const m = modal(`<h3>🖼️ صورة جاهزة للستوري والبوست</h3>
    <div class="seg inline" data-k="format"><button data-v="story" class="active">ستوري 9:16</button><button data-v="post">بوست 4:5</button></div>
    <div class="seg inline" data-k="style">${STORY_STYLES.map((s, i) => `<button data-v="${i}" class="${i ? '' : 'active'}">${s.name}</button>`).join('')}</div>
    <img class="story-prev" alt="معاينة">
    <div class="actions" style="margin-top:12px"><button class="btn primary" data-act="share">📤 شارك</button><button class="btn" data-act="dl">⬇ تحميل</button></div>`);
  let blob;
  const render = async () => {
    blob = await storyImage({ snap, title, sub, brand: CONFIG.brand, site: site(), qrUrl, font, ...st });
    const img = m.querySelector('.story-prev'); if (img.src) URL.revokeObjectURL(img.src); img.src = URL.createObjectURL(blob);
  };
  m.addEventListener('click', async (e) => {
    const b = e.target.closest('.seg button');
    if (b) { const k = b.parentElement.dataset.k; st[k] = k === 'style' ? +b.dataset.v : b.dataset.v; b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b)); render(); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'dl') download(blob, `design_${st.format}.png`);
    if (act === 'share') {
      const f = new File([blob], 'design.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f], text: `${title} — ${site()}` }); } catch {} }
      else { download(blob, `design_${st.format}.png`); toast('تم التحميل — شاركها من الاستوديو'); }
    }
  });
  try { await document.fonts.load('900 60px "Cairo"'); } catch {}
  render();
}
async function doShare(page, design, title) {
  const r = await shareLink(designURL(page, design), title);
  if (r === 'copied') toast('تم نسخ رابط التصميم ✓ — أرسله لأي أحد يفتحه ويعدّل عليه');
  else if (r === 'fail') toast('تعذر النسخ');
}
$('#kAR').onclick = () => { if (K.S) openAR(K.parts(K.S), { title: K.P.text1, qrUrl: designURL('keychain', kDesign()) }); };
$('#cAR').onclick = () => { if (C3.parts) openAR(C3.parts, { title: C3.P.text1, qrUrl: designURL('cup3d', cDesign()) }); };
$('#kStory').onclick = () => { if (K.S) openStory({ view: K.view, title: K.P.text1 || TEMPLATES[K.P.template].label, sub: K.P.text2, qrUrl: designURL('keychain', kDesign()), font: K.P.font }); };
$('#cStory').onclick = () => {
  if (!C3.parts) return;
  const t = (C3.P.model === 'letters' || ['text', 'beans_text'].includes(C3.P.content)) && C3.P.text1 ? C3.P.text1 : C3.M().label;
  openStory({ view: C3.view, title: t, sub: 'بألوانك وشعارك', qrUrl: designURL('cup3d', cDesign()), font: C3.P.font });
};
$('#kShare').onclick = () => doShare('keychain', kDesign(), K.P?.text1);
$('#cShare').onclick = () => doShare('cup3d', cDesign(), C3.P?.text1);
if (K.logo === null) { /* الشعار لا يُنقل بالرابط */ }

/* ================= باقة الكوفيهات ================= */
const PKG = {
  render() {
    $('#pkgTable').innerHTML = '<tr><th>القطعة</th><th>سعر الحبة</th><th>الكمية</th><th></th></tr>' + CONFIG.cafePackage.map((it, i) =>
      `<tr><td>${it.icon} ${it.label}</td><td>${fmt(it.price)} ${CONFIG.currency}</td><td><input type="number" min="0" max="5000" value="${it.qty}" data-i="${i}"></td><td><button class="btn small" data-go="${it.go}">صمّم</button></td></tr>`).join('');
    this.calc();
  },
  calc() {
    const q = $$('#pkgTable input').map((x) => Math.max(0, +x.value || 0));
    const n = q.reduce((a, b) => a + b, 0);
    const sum = q.reduce((a, b, i) => a + b * CONFIG.cafePackage[i].price, 0);
    const t = O.tier(n), total = Math.ceil(sum * (1 - t.off / 100));
    $('#pkgCount').textContent = fmt(n, 0); $('#pkgDisc').textContent = t.off ? t.off + '٪' : '—';
    $('#pkgTotal').textContent = `${fmt(total, 0)} ${CONFIG.currency}`;
    return { q, n, t, total };
  },
};
PKG.render();
$('#pkgTable').addEventListener('input', () => PKG.calc());
['pkgName', 'pkgPhone'].forEach((id) => { $('#' + id).value = store.get(id, ''); $('#' + id).addEventListener('change', (e) => store.set(id, e.target.value)); });
$('#pkgSend').onclick = () => {
  const c = PKG.calc();
  const lines = CONFIG.cafePackage.map((it, i) => c.q[i] ? `• ${it.label}: ${c.q[i]}` : '').filter(Boolean);
  const text = [`مرحباً، أبي أطلب باقة الكوفيهات`, `• الكوفي: ${$('#pkgName').value || '—'}`, ...lines,
    `• المجموع: ${c.n} قطعة — تقريباً ${fmt(c.total, 0)} ${CONFIG.currency}${c.t.off ? ` (خصم ${c.t.off}٪)` : ''}`, `• للتواصل: ${$('#pkgPhone').value || '—'}`, 'سأرسل الشعار هنا 👇'].join('\n');
  window.open(`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text)}`, '_blank');
};

/* ================= من نحن ================= */
(async function about() {
  const A2 = CONFIG.about || {};
  $('#aboutTitle').textContent = `من نحن — ${CONFIG.brand}`;
  $('#aboutText').textContent = (store.get('lang', 'ar') === 'en' && A2.textEn) || A2.text || '';
  const items = [];
  if (A2.instagram) items.push(`<li><a href="https://instagram.com/${encodeURIComponent(A2.instagram)}" target="_blank" rel="noopener">📸 @${escapeHTML(A2.instagram)}</a></li>`);
  if (CONFIG.whatsapp) items.push(`<li><a href="https://wa.me/${CONFIG.whatsapp}" target="_blank" rel="noopener">💬 واتساب</a></li>`);
  if (A2.email) items.push(`<li><a href="mailto:${escapeHTML(A2.email)}">✉️ ${escapeHTML(A2.email)}</a></li>`);
  if (A2.location) items.push(`<li><span>📍 ${escapeHTML(A2.location)}</span></li>`);
  if (A2.hours) items.push(`<li><span>🕒 ${escapeHTML(A2.hours)}</span></li>`);
  $('#aboutContact').innerHTML = items.join('');
  try {
    const rv = await (await fetch('gallery/reviews.json')).json();
    if (rv.length) {
      $('#reviewsBox').hidden = false;
      $('#reviews').innerHTML = rv.map((r) => `<div class="review"><span class="stars">${'★'.repeat(Math.max(1, Math.min(5, r.stars || 5)))}</span><b>${escapeHTML(r.name || '')}</b><p>${escapeHTML(r.text || '')}</p></div>`).join('');
    }
  } catch {}
})();

/* ================= ألوان الفلامنت المتوفرة ================= */
if (CONFIG.limitColors && CONFIG.filaments?.length) {
  let pop = null;
  const close = () => { pop?.remove(); pop = null; };
  document.addEventListener('click', (e) => {
    const inp = e.target.closest('input[type=color]');
    if (!inp) { if (pop && !e.target.closest('.swatch-pop')) close(); return; }
    e.preventDefault(); close();
    pop = document.createElement('div'); pop.className = 'swatch-pop';
    pop.innerHTML = CONFIG.filaments.map((f) => `<button style="background:${f.hex}" title="${f.name}" data-hex="${f.hex}" class="${f.hex.toLowerCase() === inp.value.toLowerCase() ? 'on' : ''}"></button>`).join('') + '<small>الألوان المتوفرة عندنا</small>';
    document.body.appendChild(pop);
    const r = inp.getBoundingClientRect(), pw = pop.offsetWidth;
    pop.style.top = `${window.scrollY + r.bottom + 6}px`;
    pop.style.left = `${Math.max(8, Math.min(window.innerWidth - pw - 8, r.left + r.width / 2 - pw / 2))}px`;
    pop.onclick = (ev) => {
      const b = ev.target.closest('[data-hex]'); if (!b) return;
      inp.value = b.dataset.hex; inp.dispatchEvent(new Event('input', { bubbles: true })); close();
    };
  }, true);
  window.addEventListener('scroll', close, { passive: true });
}

/* ================= صمّم لي ================= */
const CU = { files: [] };
function cuThumbs() { $('#cuThumbs').innerHTML = CU.files.map((it, i) => `<div class="thumb"><img src="${it.url}" alt=""><button data-rm="${i}" aria-label="إزالة">✕</button></div>`).join(''); }
setupDrop($('#cuDrop'), $('#cuFiles'), (files) => {
  for (const f of files) if (f.type.startsWith('image/') && CU.files.length < 8) CU.files.push({ file: f, url: URL.createObjectURL(f) });
  cuThumbs();
});
$('#cuThumbs').addEventListener('click', (e) => { const rm = e.target.closest('[data-rm]'); if (rm) { URL.revokeObjectURL(CU.files[+rm.dataset.rm].url); CU.files.splice(+rm.dataset.rm, 1); cuThumbs(); } });
['cuName', 'cuPhone'].forEach((id) => { $('#' + id).value = store.get(id, store.get(id === 'cuName' ? 'oName' : 'oPhone', '')); $('#' + id).addEventListener('change', (e) => store.set(id, e.target.value)); });
$('#cuSend').onclick = async () => {
  const desc = $('#cuDesc').value.trim();
  if (!desc) { toast('اكتب وصف الفكرة أولاً'); $('#cuDesc').focus(); return; }
  const v = (id) => $('#' + id).value.trim();
  const text = ['مرحباً، عندي طلب تصميم خاص ✍️', `• النوع: ${v('cuType')}`, `• الفكرة: ${desc}`,
    v('cuSize') && `• المقاس: ${v('cuSize')} مم`, `• الكمية: ${v('cuQty') || 1}`, v('cuColors') && `• الألوان: ${v('cuColors')}`,
    v('cuDate') && `• موعد التسليم: ${v('cuDate')}`, v('cuBudget') && `• الميزانية: ${v('cuBudget')} ${CONFIG.currency}`,
    `• الاسم: ${v('cuName') || '—'}`, `• الجوال: ${v('cuPhone') || '—'}`, CU.files.length ? `• صور مرجعية: ${CU.files.length}` : ''].filter(Boolean).join('\n');
  const files = CU.files.map((x) => x.file);
  if (files.length && !CONFIG.whatsapp && navigator.canShare?.({ files })) {
    try { await navigator.share({ files, text }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  window.open(`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text)}`, '_blank');
  if (files.length) toast('أرفق الصور المرجعية في محادثة الواتساب 📎', 4000);
};

/* ================= جولة تعريفية ================= */
const TOUR = [
  ['👋', 'أهلاً بك!', 'هنا تصمّم مجسمات وميداليات 3D جاهزة للطباعة — بدون تسجيل وبدون برامج.'],
  ['🧊', 'اختر وصمّم', 'من «مجسمات 3D» أو «صمّم ميدالية»: اختر الشكل، اكتب الاسم، حط شعارك، واختر لون كل قطعة.'],
  ['📱', 'شوفه قبل ما تطلب', 'دوّره بإصبعك، قارن حجمه ببطاقة بنكية 📏، أو شوفه على طاولتك بالواقع المعزز AR.'],
  ['🛒', 'اطلب أو حمّل', 'اطلبه طباعة واتساب بأسعار الجملة، أو حمّل ملف STL / 3MF لو عندك طابعة. وعندك فكرة خاصة؟ «صمّم لي».'],
];
function startTour() {
  let i = 0;
  const m = modal('<div class="tour"></div>');
  const draw = () => {
    const [ic, t, d] = TOUR[i];
    m.querySelector('.tour').innerHTML = `<div class="tour-ic">${ic}</div><h3>${t}</h3><p>${d}</p>
      <div class="tour-dots">${TOUR.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="actions"><button class="btn ghost" data-t="skip">تخطي</button>${i ? '<button class="btn" data-t="prev">السابق</button>' : ''}<button class="btn primary" data-t="next">${i === TOUR.length - 1 ? 'يلا نبدأ 🚀' : 'التالي'}</button></div>`;
  };
  m.addEventListener('click', (e) => {
    const a = e.target.closest('[data-t]')?.dataset.t; if (!a) return;
    if (a === 'next' && i < TOUR.length - 1) { i++; draw(); }
    else if (a === 'prev') { i--; draw(); }
    else { m.close(); if (a === 'next') go('cup3d'); }
  });
  m.onclose = () => store.set('tour_done', true);
  draw();
}
$('#tourBtn').onclick = (e) => { e.preventDefault(); e.stopPropagation(); startTour(); };
if (!store.get('tour_done', false) && !location.hash.includes('?d=') && !navigator.webdriver) setTimeout(startTour, 1500);

/* ================= الهوية ================= */
if (CONFIG.logo) { const l = $('#brandLogo'); l.src = CONFIG.logo; l.hidden = false; $('.brand svg').style.display = 'none'; }
if (CONFIG.accent) document.documentElement.style.setProperty('--accent', CONFIG.accent);

/* ================= الذكاء الاصطناعي ================= */
const A = { view: null, imgs: [], glb: null, tris: null, abort: null };
const aEnsure = () => { if (!A.view) A.view = new Viewer($('#aView')); };
$('#aKey').value = AI.getKey();
$('#aKey').addEventListener('change', (e) => AI.setKey(e.target.value.trim()));
function aThumbs() {
  $('#aThumbs').innerHTML = A.imgs.map((it, i) => `<div class="thumb"><img src="${it.url}" alt=""><button data-rm="${i}" aria-label="إزالة">✕</button></div>`).join('');
}
setupDrop($('#aDrop'), $('#aFiles'), async (files) => {
  for (const f of files) if (f.type.startsWith('image/') && A.imgs.length < 4) A.imgs.push({ ...(await loadImage(f)), file: f });
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
$('#aSend').onclick = () => {
  if (!A.imgs.length) return toast('ارفع صورة الشيء أولاً');
  CU.files = A.imgs.map((x) => ({ file: x.file, url: URL.createObjectURL(x.file) })); cuThumbs();
  $('#cuType').value = 'مجسم / تمثال صغير'; $('#cuDesc').value ||= 'حوّلوا لي الصور المرفقة إلى مجسم 3D كامل جاهز للطباعة.';
  go('custom'); toast('أضفنا صورك — أكمل التفاصيل وأرسلها 👍');
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
  try {
    const cp = { height: 40, content: 'beans', backContent: 'none', sleeve: true, loop: true, hole: 4.5, segments: 96, font: 'Cairo', text1: '', text2: '', backText: '' };
    const col = CUP_PRESETS[0];
    built.push(buildCup(cp).parts.map((p) => ({ ...p, color: col[p.key] })));
    v.show(built[0]); v.camera.position.set(22, -62, 44); v.controls.target.set(0, 0, 22); v.dirty = true;
  } catch (e) { console.error(e); }
  try {
    for (const [m, size, cols] of [['dallah', 50, null], ['mug', 36, null]]) {
      const M = MODELS[m], col = cols || Object.fromEntries(M.parts.map(([k, , d]) => [k, d]));
      built.push(buildModel({ model: m, size, content: 'beans', backContent: 'none', segments: 96, font: 'Cairo', text1: '', loop: true }).map((p) => ({ ...p, color: col[p.key] })));
    }
  } catch (e) { console.error(e); }
  for (const d of designs) {
    const P = { ...base, ...d };
    try { built.push(K.parts(buildSolids(rasterize(P)), P)); } catch (e) { console.error(e); }
    if (built.length === 1 && !built[0][0].key) { v.show(built[0]); v.camera.position.set(0, -42, 82); v.controls.target.set(0, 0, 2); v.dirty = true; }
    await nextFrame();
  }
  let i = 0;
  setInterval(() => {
    if (!$('#home').classList.contains('active') || document.hidden) return;
    i = (i + 1) % built.length; v.show(built[i], { keepView: true });
    if (built[i][0].key) { v.camera.position.set(22, -62, 44); v.controls.target.set(0, 0, 22); }
    else { v.camera.position.set(0, -42, 82); v.controls.target.set(0, 0, 2); }
    v.dirty = true;
  }, 4000);
})();

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
{
  const { page, design } = parseHash();
  if (design && page === 'keychain') { K.write({ ...K.read(), ...design }); }
  if (design && page === 'cup3d') { C3.write(design); }
  go(page, false);
  if (design) toast('تم فتح التصميم المشترك ✓ — عدّل عليه براحتك');
}
// اللغة
{
  const L = store.get('lang', 'ar');
  $('#langBtn').textContent = L === 'en' ? 'ع' : 'EN';
  $('#langBtn').onclick = () => { store.set('lang', L === 'en' ? 'ar' : 'en'); location.reload(); };
  if (L === 'en') setLang('en');
}
// تثبيت كتطبيق
{
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; $('#installBtn').hidden = false; });
  $('#installBtn').onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('#installBtn').hidden = true; };
}
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
setTimeout(() => window.scrollTo(0, 0), 60);
