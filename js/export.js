// تصدير 3MF ملوّن + ترتيب عدة قطع على بلاطة الطابعة
import { bboxOf } from './mesh.js';

export const BEDS = {
  a1mini: { label: 'Bambu A1 mini (180×180)', w: 180, d: 180 },
  bambu: { label: 'Bambu X1 / P1 / A1 (256×256)', w: 256, d: 256 },
  ender: { label: 'Ender 3 (220×220)', w: 220, d: 220 },
  prusa: { label: 'Prusa MK4 (250×210)', w: 250, d: 210 },
  k1: { label: 'Creality K1 (220×220)', w: 220, d: 220 },
  big: { label: 'كبيرة (300×300)', w: 300, d: 300 },
};

const hex8 = (c) => (c || '#cccccc').toUpperCase().replace(/^#?([0-9A-F]{6}).*$/, '#$1FF');

function meshXML(tris) {
  const map = new Map(); const verts = []; const faces = [];
  const id = (x, y, z) => {
    const k = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    let v = map.get(k);
    if (v === undefined) { v = verts.length; map.set(k, v); verts.push(`<vertex x="${x.toFixed(4)}" y="${y.toFixed(4)}" z="${z.toFixed(4)}"/>`); }
    return v;
  };
  for (let t = 0; t < tris.length; t += 9) {
    const a = id(tris[t], tris[t + 1], tris[t + 2]), b = id(tris[t + 3], tris[t + 4], tris[t + 5]), c = id(tris[t + 6], tris[t + 7], tris[t + 8]);
    if (a !== b && b !== c && a !== c) faces.push(`<triangle v1="${a}" v2="${b}" v3="${c}"/>`);
  }
  return `<mesh><vertices>${verts.join('')}</vertices><triangles>${faces.join('')}</triangles></mesh>`;
}

/**
 * objects: [{ name, parts: [{ name, tris, color }] }]
 * كل كائن يُستورد كقطعة واحدة متعددة الأجزاء (كل جزء بلونه)
 */
export async function export3MF(objects) {
  const colors = [];
  const colorIdx = (c) => { const h = hex8(c); let i = colors.indexOf(h); if (i < 0) { colors.push(h); i = colors.length - 1; } return i; };
  let nextId = 2; const res = []; const items = [];
  for (const o of objects) {
    const comps = [];
    for (const p of o.parts) {
      if (!p.tris || !p.tris.length) continue;
      const id = nextId++;
      res.push(`<object id="${id}" name="${esc(p.name)}" type="model" pid="1" pindex="${colorIdx(p.color)}">${meshXML(p.tris)}</object>`);
      comps.push(`<component objectid="${id}"/>`);
    }
    const gid = nextId++;
    res.push(`<object id="${gid}" name="${esc(o.name)}" type="model"><components>${comps.join('')}</components></object>`);
    items.push(`<item objectid="${gid}"/>`);
  }
  const mats = `<basematerials id="1">${colors.map((c, i) => `<base name="Color ${i + 1}" displaycolor="${c}"/>`).join('')}</basematerials>`;
  const model = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Application">Tab3a 3D</metadata><resources>${mats}${res.join('')}</resources><build>${items.join('')}</build></model>`;
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>');
  zip.file('3D/3dmodel.model', model);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'model/3mf' });
}
const esc = (s) => String(s || '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

function translate(tris, dx, dy) {
  const o = new Float32Array(tris.length);
  for (let i = 0; i < tris.length; i += 3) { o[i] = tris[i] + dx; o[i + 1] = tris[i + 1] + dy; o[i + 2] = tris[i + 2]; }
  return o;
}

/**
 * يرتب القطع صفوفاً على البلاطة. items: [{name, parts:[{tris,color,name}]}]
 * يرجع قائمة بلاطات، كل بلاطة قائمة قطع منقولة لأماكنها
 */
export function arrange(items, bed, gap = 4, margin = 6) {
  const boxes = items.map((it) => {
    const all = it.parts.filter((p) => p.tris.length);
    let mn = [Infinity, Infinity], mx = [-Infinity, -Infinity];
    for (const p of all) { const b = bboxOf(p.tris); mn = [Math.min(mn[0], b.min[0]), Math.min(mn[1], b.min[1])]; mx = [Math.max(mx[0], b.max[0]), Math.max(mx[1], b.max[1])]; }
    return { it, mn, w: mx[0] - mn[0], d: mx[1] - mn[1] };
  });
  const W = bed.w - margin * 2, D = bed.d - margin * 2;
  for (const b of boxes) if (b.w > W || b.d > D) throw new Error(`القطعة «${b.it.name}» أكبر من البلاطة`);
  const plates = []; let cur = [], x = 0, y = 0, rowH = 0;
  for (const b of boxes) {
    if (x + b.w > W) { x = 0; y += rowH + gap; rowH = 0; }
    if (y + b.d > D) { plates.push(cur); cur = []; x = 0; y = 0; rowH = 0; }
    const dx = margin + x - b.mn[0], dy = margin + y - b.mn[1];
    cur.push({ name: b.it.name, parts: b.it.parts.map((p) => ({ ...p, tris: translate(p.tris, dx, dy) })) });
    x += b.w + gap; rowH = Math.max(rowH, b.d);
  }
  if (cur.length) plates.push(cur);
  return plates;
}

/** إطار البلاطة للعرض (مستطيل رقيق جداً) */
export function bedOutline(bed) {
  const t = 0.6, z = 0.05, w = bed.w, d = bed.d;
  const rect = (x0, y0, x1, y1) => [x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z];
  return new Float32Array([...rect(0, 0, w, t), ...rect(0, d - t, w, d), ...rect(0, 0, t, d), ...rect(w - t, 0, w, d)]);
}
