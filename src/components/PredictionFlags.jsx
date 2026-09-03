import { AlertTriangle, FlaskConical, Layers } from 'lucide-react';

/**
 * Predictions in this database span several models — the platform has been
 * through an ESM2-35M LoRA, a plain 150M, and the current gated 150M since June.
 * Their ΔG values are NOT on a common scale, so ranking or comparing across them
 * is meaningless. `modelVersion` is stored on every prediction; these helpers make
 * it visible and warn when a set mixes models.
 */
const MODEL_LABELS = {
  'esm2_t30_150M_lora_gated':     'ESM2-150M gated',
  'facebook/esm2_t30_150M_UR50D': 'ESM2-150M',
  'facebook/esm2_t12_35M_UR50D':  'ESM2-35M',
  'protstab_cnn_v0':              'CNN v0',
};

function modelLabel(modelVersion) {
  if (!modelVersion) return 'unknown';
  const isFallback = modelVersion.includes('[fallback]');
  const base = modelVersion.replace(' [fallback]', '');
  return (MODEL_LABELS[base] || base) + (isFallback ? ' (fallback)' : '');
}

/** Small neutral chip naming the model a prediction came from. */
export function ModelBadge({ modelVersion, className = '' }) {
  if (!modelVersion) return null;
  return (
    <span
      title={modelVersion}
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
 * Trust signals for a prediction, produced by the ML service
 * (see ml-service/main.py::_prediction_flags) and stored on the Prediction
 * document as `inDistribution` / `flags` / `ddgSource`.
 *
 * `inDistribution: false` means the model extrapolated — either the ΔG fell
 * outside the range of labels it was trained on, or the sequence is longer than
 * anything it ever saw. The number is still returned; it just should not be
 * trusted the same way as an in-range one.
 */

/** Compact badge for table rows. Renders nothing when the prediction is in range. */
export function OutOfRangeBadge({ prediction, className = '' }) {
  if (prediction?.inDistribution !== false) return null;
  const reasons = prediction.flags?.length
    ? prediction.flags.join('\n\n')
    : 'This prediction falls outside the range the model was trained on.';

  return (
    <span
      title={reasons}
      className={`inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 ${className}`}
    >
      <AlertTriangle className="w-3 h-3 shrink-0" />
      Extrapolated
    </span>
  );
}

/** Full-width explanation panel for a detail page. */
export function OutOfRangeNotice({ prediction }) {
  if (prediction?.inDistribution !== false) return null;
  const flags = prediction.flags?.length ? prediction.flags : [
    'This prediction falls outside the range the model was trained on.',
  ];

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p className="text-sm font-semibold text-amber-800">
          Outside the model&rsquo;s training range
        </p>
        <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
          {flags.map((f, i) => {
            // Flags arrive as "code: human readable explanation" — show the prose.
            const idx = f.indexOf(': ');
            return <li key={i}>{idx > -1 ? f.slice(idx + 2) : f}</li>;
          })}
        </ul>
        <p className="text-xs text-amber-600 pt-1">
          The value is still shown, but treat it as an estimate rather than a measurement.
          Ranking against other sequences is more reliable than the absolute number.
        </p>
      </div>
    </div>
  );
}

/**
 * Marks the ΔΔG suggestion table as heuristic. The per-mutation ΔΔG, confidence
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
        These ΔΔG and confidence values come from a sequence-independent rule, not the
        trained model &mdash; the same substitution scores identically on any sequence.
        Use them to explore positions, not to choose bench candidates. A trained ΔΔG
        model is planned.
      </p>
    </div>
  );
}
