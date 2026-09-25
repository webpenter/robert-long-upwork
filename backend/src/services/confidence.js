'use strict';

// ── Prediction confidence ────────────────────────────────────────────────────
// A single 0–1 score that falls as a query moves away from what the model was
// trained on. It replaces the old in/out-of-range badge (client request,
// 2026-09-22): the same information, expressed as a degree of trust in one
// prediction rather than a warning about the platform.
//
// It is deliberately a transparent distance-from-training measure, not a
// learned uncertainty estimate. Two things are measured, both from facts the
// checkpoint records about its own training (ml-service/models/best_model.pt.meta.json):
//
//   1. Length. Every training sequence was a 40–80 residue domain. Inside that
//      band the length factor is 1; outside it decays smoothly with distance.
//   2. Predicted value. Training labels spanned −9.77 … +6.21 kcal/mol in the
//      platform's sign convention. A prediction inside that span scores 1; one
//      beyond it is extrapolation and decays with distance past the edge.
//
// The score is capped below 1 so that "looks like training data" never reads as
// "certain". Constants belong to the current gated ESM2-150M checkpoint; a new
// checkpoint with a different training regime needs them revisited.

const TRAINED_LEN_MIN = 40;
const TRAINED_LEN_MAX = 80;
// Display convention (more negative = more stable) = negated raw label range.
const TRAINED_DG_MIN = -9.77;
const TRAINED_DG_MAX = 6.21;

// Decay lengths, chosen so the score reads sensibly at landmarks the team uses:
//   126 aa (the model's trained token limit) ≈ 0.70 "high"
//   150 aa ≈ 0.60 "medium";   223 aa (trypsin) ≈ 0.37 "low";   20 aa ≈ 0.43
const LONG_DECAY_AA   = 150;
const SHORT_DECAY_AA  = 25;
const DG_DECAY_KCAL   = 3;
const CEILING         = 0.95;

// Models this calibration describes. Older checkpoints had different training
// regimes, so their predictions are left without a score rather than given one
// that means something different.
const CALIBRATED_MODELS = new Set(['esm2_t30_150M_lora_gated']);

function lengthFactor(len) {
  if (len >= TRAINED_LEN_MIN && len <= TRAINED_LEN_MAX) return 1;
  if (len > TRAINED_LEN_MAX) return Math.exp(-(len - TRAINED_LEN_MAX) / LONG_DECAY_AA);
  return Math.exp(-(TRAINED_LEN_MIN - len) / SHORT_DECAY_AA);
}

function valueFactor(dg) {
  if (dg >= TRAINED_DG_MIN && dg <= TRAINED_DG_MAX) return 1;
  const past = dg < TRAINED_DG_MIN ? TRAINED_DG_MIN - dg : dg - TRAINED_DG_MAX;
  return Math.exp(-past / DG_DECAY_KCAL);
}

/**
 * @param {object} p
 * @param {number} p.dg           predicted ΔG, platform convention
 * @param {number} p.seqLen       residues actually scored
 * @param {string} p.modelVersion model id stored on the prediction
 * @returns {number|null} 0–0.95, or null when the model is not calibrated here
 */
function computeConfidence({ dg, seqLen, modelVersion }) {
  if (dg == null || !Number.isFinite(dg) || !seqLen) return null;
  // The hydrophobicity fallback used when the ML service is down is not a model;
  // report it as the lowest confidence rather than inventing a score for it.
  if (String(modelVersion || '').includes('[fallback]')) return 0.05;
  if (!CALIBRATED_MODELS.has(modelVersion)) return null;
  const score = CEILING * lengthFactor(seqLen) * valueFactor(dg);
  return Math.round(score * 100) / 100;
}

module.exports = { computeConfidence, CALIBRATED_MODELS };
