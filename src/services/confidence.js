// Display helpers for the per-prediction confidence score. The score itself is
// computed by the backend (backend/src/services/confidence.js) and stored on the
// prediction; this only turns it into a label and colour. Thresholds match the
// backend's documented landmarks (126 aa ≈ 0.70, 223 aa ≈ 0.37).
export const CONFIDENCE_LEVELS = [
  { min: 0.70, label: 'High',   tone: 'high'   },
  { min: 0.40, label: 'Medium', tone: 'medium' },
  { min: 0,    label: 'Low',    tone: 'low'    },
];

export function confidenceLevel(score) {
  if (score == null || !Number.isFinite(score)) return null;
  return CONFIDENCE_LEVELS.find(l => score >= l.min);
}

/** "High · 95%" — or '' when the prediction has no score. */
export function confidenceText(score) {
  const lvl = confidenceLevel(score);
  return lvl ? `${lvl.label} · ${Math.round(score * 100)}%` : '';
}

export const CONFIDENCE_EXPLAINER =
  'Confidence reflects how closely this sequence resembles the proteins the model was trained on, '
  + 'in length and in predicted stability. It is highest for sequences like the training data and '
  + 'falls the further a sequence sits from it.';
