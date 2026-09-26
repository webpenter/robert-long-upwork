import { FlaskConical, Layers } from 'lucide-react';

import { modelLabel } from '../services/modelLabel';
import { confidenceLevel, confidenceText, CONFIDENCE_EXPLAINER } from '../services/confidence';

/**
 * Predictions in this database span several models, and their ΔG values are NOT
 * on a common scale, so ranking or comparing across them is meaningless. These
 * helpers surface each prediction's model as a neutral version number (see
 * services/modelLabel.js) and warn when a set mixes models.
 */

/** Small neutral chip naming the model a prediction came from. */
export function ModelBadge({ modelVersion, className = '' }) {
  if (!modelVersion) return null;
  return (
    <span
      className={`inline-flex items-center rounded-md bg-gray-50 border border-gray-200 px-1.5 py-0.5 text-[11px] font-medium text-gray-600 whitespace-nowrap ${className}`}
    >
      {modelLabel(modelVersion)}
    </span>
  );
}

/**
 * Warns when a list of predictions was produced by more than one model.
 * `predictions` is any array of objects carrying `modelVersion`.
 */
export function MixedModelWarning({ predictions, action = 'Ranking' }) {
  const versions = [...new Set(
    (predictions || []).filter(p => p?.dG != null && p.modelVersion).map(p => p.modelVersion),
  )];
  if (versions.length < 2) return null;

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex gap-3">
      <Layers className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p className="text-sm font-semibold text-orange-800">
          These predictions come from {versions.length} different models
        </p>
        <p className="text-sm text-orange-700">
          {action} across models is not meaningful — each was trained separately and
          their ΔG values are not on a common scale. Re-run them with the current
          model before comparing.
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {versions.map(v => <ModelBadge key={v} modelVersion={v} />)}
        </div>
      </div>
    </div>
  );
}

/**
 * Per-prediction confidence, shown in place of the old "extrapolated" badge.
 * The score is computed server-side (backend/src/services/confidence.js) from
 * how far the sequence sits from the training data; this only renders it.
 * Predictions from checkpoints the score is not calibrated for carry no score
 * and render nothing (or a dash, in tables).
 */
const TONE_CLASS = {
  high:   'bg-emerald-50 border-emerald-200 text-emerald-700',
  medium: 'bg-sky-50 border-sky-200 text-sky-700',
  low:    'bg-slate-50 border-slate-200 text-slate-600',
};

export function ConfidenceBadge({ confidence, dashWhenMissing = false, className = '' }) {
  const lvl = confidenceLevel(confidence);
  if (!lvl) return dashWhenMissing ? <span className="text-gray-300">—</span> : null;
  return (
    <span
      title={CONFIDENCE_EXPLAINER}
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${TONE_CLASS[lvl.tone]} ${className}`}
    >
      {confidenceText(confidence)}
    </span>
  );
}

/**
 * Marks the ΔΔG suggestion table as heuristic. The per-mutation ΔΔG, heuristic score
 * and hotspot values do not come from the network at all — they are a
 * deterministic function of (position, wild-type residue, mutant residue), so two
 * unrelated sequences return identical ΔΔG for the same substitution. Shown so the
 * table is not mistaken for model output.
 */
export function HeuristicNotice({ source }) {
  if (source !== 'heuristic') return null;
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2.5 mb-3">
      <FlaskConical className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
      <p className="text-xs text-blue-800 leading-relaxed">
        <span className="font-semibold">Heuristic suggestions, not model predictions.</span>{' '}
        These ΔΔG values and heuristic scores come from a sequence-independent rule, not the
        trained model &mdash; the same substitution scores identically on any sequence.
        Use them to explore positions, not to choose bench candidates. A trained ΔΔG
        model is planned.
      </p>
    </div>
  );
}
