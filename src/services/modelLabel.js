// Neutral, user-facing label for a prediction's `modelVersion` (the internal
// checkpoint id stored on every prediction). Predictions in the database span
// several models whose ΔG values are NOT on a common scale, so the version must
// stay visible — but the architecture itself is deliberately not shown to users
// (client request, 2026-09-22). The raw id lives in the database only.
const MODEL_LABELS = {
  'protstab_cnn_v0':              'Model v0',
  'facebook/esm2_t12_35M_UR50D':  'Model v1',
  'facebook/esm2_t30_150M_UR50D': 'Model v2',
  'esm2_t30_150M_lora_gated':     'Model v3',
};

export function modelLabel(modelVersion) {
  if (!modelVersion) return 'unknown';
  const isFallback = modelVersion.includes('[fallback]');
  const base = modelVersion.replace(' [fallback]', '');
  return (MODEL_LABELS[base] || 'Model') + (isFallback ? ' (fallback)' : '');
}
