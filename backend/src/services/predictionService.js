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

// ── Residue-selection parser ─────────────────────────────────────────────────
// Turns a free-text selection like "include 1-20, 25-100; exclude 20-25" into an
// explicit sorted list of 1-indexed positions to scan. Returns null when nothing
// is specified (→ scan the whole sequence). Bare ranges default to "include".

function parseResidueSelection(text, seqLen) {
  if (!text || !String(text).trim()) return null;

  const include = [];
  const exclude = [];
  let mode = 'include';

  for (let tok of String(text).replace(/[;\n]/g, ',').split(',')) {
    tok = tok.trim().toLowerCase();
    if (!tok) continue;
    if (tok.startsWith('include')) { mode = 'include'; tok = tok.slice(7).trim(); }
    else if (tok.startsWith('exclude')) { mode = 'exclude'; tok = tok.slice(7).trim(); }
    if (!tok) continue;

    const m = tok.match(/^(\d+)\s*-\s*(\d+)$/) || tok.match(/^(\d+)$/);
    if (!m) continue;
    const a = parseInt(m[1], 10);
    const b = m[2] !== undefined ? parseInt(m[2], 10) : a;
    (mode === 'include' ? include : exclude).push([Math.min(a, b), Math.max(a, b)]);
  }

  const positions = new Set();
  const eachInRange = (a, b, fn) => { for (let p = Math.max(1, a); p <= Math.min(seqLen, b); p++) fn(p); };

  if (include.length) include.forEach(([a, b]) => eachInRange(a, b, p => positions.add(p)));
  else for (let p = 1; p <= seqLen; p++) positions.add(p);        // no include → all
  exclude.forEach(([a, b]) => eachInRange(a, b, p => positions.delete(p)));

  return [...positions].sort((x, y) => x - y);
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
        conditions:   pred.conditions || {},
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
      model_name  = 'esm2-lora',
      // Trust signals — the ML service flags extrapolation rather than hiding it.
      // Default to in-distribution so the offline fallback isn't wrongly flagged.
      in_distribution: inDistribution = true,
      flags: mlFlags = [],
    } = result;

    // ── Residue-level stabilizing-mutation scan (ΔΔG) ────────────────────────
    // Runs only when the ML service is available (the fallback can't scan).
    // Honours the user's residue selection + suggestion count.
    let candidates = [];
    let hotspotMap = [];
    let ddgSource  = null;
    if (usedMLService) {
      try {
        const topK      = Math.max(1, Number(pred.suggestTopK) || 50);
        const positions = parseResidueSelection(pred.residueSelection, seq_len);
        const scan = await postToMLService(
          '/suggest',
          {
            sequence:     seq,
            top_k:        topK,
            ...(positions ? { positions } : {}),
            conditions:   pred.conditions || {},
            predictionId: String(predictionId),
          },
          60000,
        );
        candidates = (scan.candidates || []).map(c => ({
          rank:          c.rank,
          mutation:      c.mutation,
          position:      c.position,
          originalAa:    c.originalAa,
          substitutedAa: c.substitutedAa,
          ddG:           c.ddG,
          confidence:    c.confidence,
        }));
        hotspotMap = (scan.hotspotMap || []).map(h => ({
          position:               h.position,
          residue:                h.residue,
          stabilizationPotential: h.stabilizationPotential,
          mutationalTolerance:    h.mutationalTolerance,
        }));
        ddgSource = scan.ddg_source || null;
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
      inDistribution,
      flags:           mlFlags,
      ddgSource,
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
