// ضبط الطابعة: تعويضات (مم) تُضاف تلقائياً على كل التصاميم
export const TOL = { hole: 0, lid: 0, pin: 0 };
export function setTol(o) {
  for (const k of Object.keys(TOL)) { const v = Number(o?.[k]); if (Number.isFinite(v)) TOL[k] = Math.min(1, Math.max(-0.5, v)); }
}
