'use strict';
const Prediction = require('../models/Prediction');
const { mlFetch } = require('./mlClient');

// ── Call the Python ML service ───────────────────────────────────────────────
// Delegates to the shared HTTPS-aware client so hosted (https://…) and local
// (http://host:port) ML services both work.

function postToMLService(path, body, timeoutMs = 30000) {
  return mlFetch(path, { method: 'POST', body, timeoutMs });
}

// ── Fallback ΔG estimate (when ML service is offline) ────────────────────────
// Uses mean amino acid hydrophobicity as a rough stability proxy.
// Not accurate — always shows [fallback] warning in modelVersion.

const KD = {
  A:1.8,  R:-4.5, N:-3.5, D:-3.5, C:2.5,  Q:-3.5,
  E:-3.5, G:-0.4, H:-3.2, I:4.5,  K:-3.9, L:3.8,
  M:1.9,  F:2.8,  P:-1.6, S:-0.8, T:-0.7, W:-0.9,
  Y:-1.3, V:4.2,  X:0.0,
};

function stabilityLabel(dg) {
  // Client convention: NEGATIVE ΔG = more stable.
  if (dg < -3.0) return 'highly stable';
  if (dg < -0.5) return 'stable';
  if (dg <  0.5) return 'marginally stable';
  if (dg <  3.0) return 'unstable';
  return 'highly unstable';
}

function buildFallbackResult(seq) {
  const kdVals = seq.split('').map(aa => KD[aa] ?? 0.0);
  const mean   = kdVals.reduce((s, v) => s + v, 0) / kdVals.length;
  // Linear scaling: avg KD ∈ [-4.5, 4.5] → ΔG ∈ [-6, 6].
  // Negated so the fallback follows the client convention (negative ΔG = more stable).
  const dg = parseFloat((-mean * 1.33).toFixed(4));
  return {
    dg,
    stability:    stabilityLabel(dg),
    seq_len:      seq.length,
    truncated:    false,
    model_name:   'fallback-hydrophobicity-v1',
    latency_ms:   0,
  };
}

// ── Main prediction runner ────────────────────────────────────────────────────

async function runPrediction(predictionId) {
  await new Promise(r => setTimeout(r, 300));

  try {
    await Prediction.findByIdAndUpdate(predictionId, { status: 'RUNNING' });

    const pred = await Prediction.findById(predictionId);

    // Strip FASTA headers and whitespace — send clean amino acid sequence
    const raw = pred.fastaSequence.replace(/^>.*$/gm, '').replace(/\s/g, '');
    const seq = raw.toUpperCase();

    if (seq.length < 10) throw new Error('Sequence too short (minimum 10 residues).');
    const invalid = [...new Set(seq.split('').filter(aa => !'ACDEFGHIKLMNPQRSTVWYX'.includes(aa)))];
    if (invalid.length) throw new Error(`Non-canonical residues: ${invalid.join(', ')}`);

    // ── Call ProtStabCNN via ML service ──────────────────────────────────
    let result;
    let usedMLService = false;

    try {
      result = await postToMLService('/predict', {
        sequence:     seq,
        predictionId: String(predictionId),
      });
      usedMLService = true;
    } catch (mlErr) {
      console.warn(`[prediction] ML service unavailable (${mlErr.message}) — using fallback`);
      result = buildFallbackResult(seq);
    }

    const {
      dg,
      stability,
      seq_len,
      truncated   = false,
      latency_ms  = 0,
      model_name  = 'protstab_cnn_v0',
    } = result;

    // ── Residue-level stabilizing-mutation scan (ΔΔG) ────────────────────────
    // Runs only when the ML service is available (the fallback can't scan).
    // Long timeout: a full position×AA scan is many forward passes.
    let candidates = [];
    let hotspotMap = [];
    if (usedMLService) {
      try {
        const scan = await postToMLService(
          '/suggest',
          { sequence: seq, top_k: 30, predictionId: String(predictionId) },
          300000,
        );
        candidates = (scan.candidates || []).map(c => ({
          rank:          c.rank,
          mutation:      c.mutation,
          position:      c.position,
          originalAa:    c.originalAa,
          substitutedAa: c.substitutedAa,
          ddG:           c.ddG,
        }));
        hotspotMap = (scan.hotspotMap || []).map(h => ({
          position:               h.position,
          residue:                h.residue,
          stabilizationPotential: h.stabilizationPotential,
          mutationalTolerance:    h.mutationalTolerance,
        }));
      } catch (scanErr) {
        console.warn(`[prediction] stabilizing-mutation scan skipped (${scanErr.message})`);
      }
    }

    await Prediction.findByIdAndUpdate(predictionId, {
      status:          'COMPLETED',
      dG:              dg,
      stability,
      seqLen:          seq_len,
      truncated,
      latencyMs:       latency_ms,
      modelVersion:    usedMLService ? model_name : `${model_name} [fallback]`,
      candidates,
      hotspotMap,
      candidatesCount: candidates.length,
      completedAt:     new Date(),
    });

  } catch (err) {
    await Prediction.findByIdAndUpdate(predictionId, {
      status:       'FAILED',
      errorMessage: err.message,
    });
  }
}

module.exports = { runPrediction };
