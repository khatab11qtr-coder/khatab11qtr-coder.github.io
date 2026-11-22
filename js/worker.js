// عامل خلفي: يبني المجسمات من حقول الأشكال بدون ما يعلّق الصفحة
import { fieldToSolid } from './contour.js';
import { mergeTris } from './mesh.js';

self.onmessage = ({ data }) => {
  const { id, layers, w, h, px } = data;
  try {
    const out = { base: [], accent: [] };
    for (const L of layers) {
      const t = fieldToSolid(L.f, w, h, px, L.z0, L.z1);
      if (t.length) out[L.part].push(t);
    }
    const base = mergeTris(out.base), accent = mergeTris(out.accent);
    self.postMessage({ id, base, accent }, [base.buffer, accent.buffer]);
  } catch (e) { self.postMessage({ id, error: e.message }); }
};
