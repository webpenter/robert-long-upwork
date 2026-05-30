'use strict';
const http       = require('http');
const Prediction = require('../models/Prediction');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

// ── Call the Python ML service ───────────────────────────────────────────────

function postToMLService(path, body) {
  return new Promise((resolve, reject) => {
    const data    = JSON.stringify(body);
    const options = {
      hostname: ML_SERVICE_URL.replace(/^https?:\/\//, '').split(':')[0],
      port:     parseInt(ML_SERVICE_URL.split(':')[2] || '8000', 10),
      path,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout:  60000,
    };

    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (res.statusCode >= 400) {
            reject(new Error(parsed.detail || `ML service error ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`ML service returned non-JSON: ${raw.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('ML service request timed out')); });
    req.write(data);
    req.end();
  });
}

// ── BLOSUM62 fallback (used when ML service is not running) ──────────────────

const AMINO_ACIDS = 'ACDEFGHIKLMNPQRSTVWY'.split('');
const B62 = {
  A:{A:4,R:-1,N:-2,D:-2,C:0,Q:-1,E:-1,G:0,H:-2,I:-1,L:-1,K:-1,M:-1,F:-2,P:-1,S:1,T:0,W:-3,Y:-2,V:0},
  R:{A:-1,R:5,N:0,D:-2,C:-3,Q:1,E:0,G:-2,H:0,I:-3,L:-2,K:2,M:-1,F:-3,P:-2,S:-1,T:-1,W:-3,Y:-2,V:-3},
  N:{A:-2,R:0,N:6,D:1,C:-3,Q:0,E:0,G:0,H:1,I:-3,L:-3,K:0,M:-2,F:-3,P:-2,S:1,T:0,W:-4,Y:-2,V:-3},
  D:{A:-2,R:-2,N:1,D:6,C:-3,Q:0,E:2,G:-1,H:-1,I:-3,L:-4,K:-1,M:-3,F:-3,P:-1,S:0,T:-1,W:-4,Y:-3,V:-3},
  C:{A:0,R:-3,N:-3,D:-3,C:9,Q:-3,E:-4,G:-3,H:-3,I:-1,L:-1,K:-3,M:-1,F:-2,P:-3,S:-1,T:-1,W:-2,Y:-2,V:-1},
  Q:{A:-1,R:1,N:0,D:0,C:-3,Q:5,E:2,G:-2,H:0,I:-3,L:-2,K:1,M:0,F:-3,P:-1,S:0,T:-1,W:-2,Y:-1,V:-2},
  E:{A:-1,R:0,N:0,D:2,C:-4,Q:2,E:5,G:-2,H:0,I:-3,L:-3,K:1,M:-2,F:-3,P:-1,S:0,T:-1,W:-3,Y:-2,V:-2},
  G:{A:0,R:-2,N:0,D:-1,C:-3,Q:-2,E:-2,G:6,H:-2,I:-4,L:-4,K:-2,M:-3,F:-3,P:-2,S:0,T:-2,W:-2,Y:-3,V:-3},
  H:{A:-2,R:0,N:1,D:-1,C:-3,Q:0,E:0,G:-2,H:8,I:-3,L:-3,K:-1,M:-2,F:-1,P:-2,S:-1,T:-2,W:-2,Y:2,V:-3},
  I:{A:-1,R:-3,N:-3,D:-3,C:-1,Q:-3,E:-3,G:-4,H:-3,I:4,L:2,K:-3,M:1,F:0,P:-3,S:-2,T:-1,W:-3,Y:-1,V:3},
  L:{A:-1,R:-2,N:-3,D:-4,C:-1,Q:-2,E:-3,G:-4,H:-3,I:2,L:4,K:-2,M:2,F:0,P:-3,S:-2,T:-1,W:-2,Y:-1,V:1},
  K:{A:-1,R:2,N:0,D:-1,C:-3,Q:1,E:1,G:-2,H:-1,I:-3,L:-2,K:5,M:-1,F:-3,P:-1,S:0,T:-1,W:-3,Y:-2,V:-2},
  M:{A:-1,R:-1,N:-2,D:-3,C:-1,Q:0,E:-2,G:-3,H:-2,I:1,L:2,K:-1,M:5,F:0,P:-2,S:-1,T:-1,W:-1,Y:-1,V:1},
  F:{A:-2,R:-3,N:-3,D:-3,C:-2,Q:-3,E:-3,G:-3,H:-1,I:0,L:0,K:-3,M:0,F:6,P:-4,S:-2,T:-2,W:1,Y:3,V:-1},
  P:{A:-1,R:-2,N:-2,D:-1,C:-3,Q:-1,E:-1,G:-2,H:-2,I:-3,L:-3,K:-1,M:-2,F:-4,P:7,S:-1,T:-1,W:-4,Y:-3,V:-2},
  S:{A:1,R:-1,N:1,D:0,C:-1,Q:0,E:0,G:0,H:-1,I:-2,L:-2,K:0,M:-1,F:-2,P:-1,S:4,T:1,W:-3,Y:-2,V:-2},
  T:{A:0,R:-1,N:0,D:-1,C:-1,Q:-1,E:-1,G:-2,H:-2,I:-1,L:-1,K:-1,M:-1,F:-2,P:-1,S:1,T:5,W:-2,Y:-2,V:0},
  W:{A:-3,R:-3,N:-4,D:-4,C:-2,Q:-2,E:-3,G:-2,H:-2,I:-3,L:-2,K:-3,M:-1,F:1,P:-4,S:-3,T:-2,W:11,Y:2,V:-3},
  Y:{A:-2,R:-2,N:-2,D:-3,C:-2,Q:-1,E:-2,G:-3,H:2,I:-1,L:-1,K:-2,M:-1,F:3,P:-3,S:-2,T:-2,W:2,Y:7,V:-1},
  V:{A:0,R:-3,N:-3,D:-3,C:-1,Q:-2,E:-2,G:-3,H:-3,I:3,L:1,K:-2,M:1,F:-1,P:-2,S:-2,T:0,W:-3,Y:-1,V:4},
};
const KD   = {A:1.8,R:-4.5,N:-3.5,D:-3.5,C:2.5,Q:-3.5,E:-3.5,G:-0.4,H:-3.2,I:4.5,L:3.8,K:-3.9,M:1.9,F:2.8,P:-1.6,S:-0.8,T:-0.7,W:-0.9,Y:-1.3,V:4.2};
const VOL  = {A:88.6,R:173.4,N:114.1,D:111.1,C:108.5,Q:143.8,E:138.4,G:60.1,H:153.2,I:166.7,L:166.7,K:168.6,M:162.9,F:189.9,P:112.7,S:89.0,T:116.1,W:227.8,Y:193.6,V:140.0};
const CHG  = {A:0,R:1,N:0,D:-1,C:0,Q:0,E:-1,G:0,H:0.1,I:0,L:0,K:1,M:0,F:0,P:0,S:0,T:0,W:0,Y:0,V:0};

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

function burialScore(seq, pos) {
  const W = 4;
  let sum = 0, n = 0;
  for (let i = Math.max(0, pos - W); i <= Math.min(seq.length - 1, pos + W); i++) {
    if (i !== pos) { sum += (KD[seq[i]] ?? 0); n++; }
  }
  return n > 0 ? sum / n : 0;
}

function scoreSubstitution(fromAa, toAa, pos, seq) {
  const blosum   = B62[fromAa]?.[toAa] ?? -4;
  const dH       = (KD[toAa] ?? 0) - (KD[fromAa] ?? 0);
  const dVol     = (VOL[toAa] ?? 110) - (VOL[fromAa] ?? 110);
  const dQ       = Math.abs((CHG[toAa] ?? 0) - (CHG[fromAa] ?? 0));
  const burial   = burialScore(seq, pos);

  let ddG  = -0.08 * blosum;
  ddG     += burial > 0 ? -dH * burial * 0.12 : Math.abs(dH) * 0.03;
  ddG     += Math.abs(dVol) * 0.008 + dQ * 0.40;
  if (toAa === 'P' && fromAa !== 'P') ddG += 0.90;
  if (fromAa === 'P' && toAa !== 'P') ddG -= 0.35;
  if (fromAa === 'G' && toAa === 'A') ddG -= 0.50;
  if (toAa === 'G' && fromAa !== 'G') ddG += 0.30;

  return { ddG, blosum, dH, dVol, dQ, burial };
}

function buildFallbackPrediction(seq, tier) {
  const best = [];
  for (let i = 0; i < seq.length; i++) {
    const fromAa = seq[i];
    let top = null;
    let sumDdG = 0, minDdG = Infinity;
    for (const toAa of AMINO_ACIDS) {
      if (toAa === fromAa) continue;
      const s = scoreSubstitution(fromAa, toAa, i, seq);
      sumDdG += s.ddG;
      if (s.ddG < minDdG) minDdG = s.ddG;
      if (!top || s.ddG < top.s.ddG) top = { toAa, s };
    }
    best.push({ pos: i, fromAa, toAa: top.toAa, s: top.s, meanDdG: sumDdG / 19, minDdG });
  }

  best.sort((a, b) => a.s.ddG - b.s.ddG);
  const top20 = best.slice(0, 20);

  const candidates = top20.map((e, idx) => {
    const { pos, fromAa, toAa, s } = e;
    const { ddG, blosum, dH, dVol, dQ } = s;
    const uncert = 0.55 + 0.12 * Math.abs(ddG);
    const cand = {
      rank: idx + 1,
      mutation: `${fromAa}${pos + 1}${toAa}`,
      position: pos + 1,
      originalAa: fromAa,
      substitutedAa: toAa,
    };
    if (tier === 'SILVER' || tier === 'GOLD') {
      cand.ddG                     = parseFloat(ddG.toFixed(2));
      cand.predictedStabilityChange = parseFloat((-ddG * 1.7).toFixed(2));
      cand.confidenceLow           = parseFloat((ddG - uncert / 2).toFixed(2));
      cand.confidenceHigh          = parseFloat((ddG + uncert / 2).toFixed(2));
      cand.activityRisk            = parseFloat(Math.min(1, Math.max(0, 0.15 + Math.min(0.5, Math.abs(dQ) * 0.35) + (toAa === 'P' ? 0.2 : 0) + (fromAa === 'C' ? 0.15 : 0))).toFixed(2));
      cand.supportingVariants      = Math.max(1, Math.round((blosum + 5) / 16 * 50 + 2));
      cand.structuralReason        = `Fallback scoring (ML service offline). BLOSUM62 ${blosum >= 0 ? '+' : ''}${blosum}, ΔHydrophobicity ${dH.toFixed(1)}, ΔVol ${Math.round(dVol)} Å³.`;
    }
    return cand;
  });

  const hotspotMap = tier !== 'BRONZE'
    ? best.sort((a, b) => a.pos - b.pos).map(e => ({
        position: e.pos + 1,
        residue: e.fromAa,
        mutationalTolerance: parseFloat(sigmoid(-(e.meanDdG - 1.0)).toFixed(3)),
        stabilizationPotential: parseFloat(Math.max(0, Math.min(1, -e.minDdG / 2.5)).toFixed(3)),
      }))
    : [];

  return { candidates, hotspotMap, modelVersion: 'fallback-v1 (BLOSUM62)', nTrainingVars: 0 };
}

// ── Main prediction runner ────────────────────────────────────────────────────

async function runPrediction(predictionId, tier) {
  await new Promise(r => setTimeout(r, 400));

  try {
    await Prediction.findByIdAndUpdate(predictionId, { status: 'RUNNING' });

    const pred = await Prediction.findById(predictionId);
    // Strip all FASTA header lines (handles multi-entry, \r\n, and leading/trailing whitespace)
    const raw  = pred.fastaSequence.replace(/^>.*$/gm, '').replace(/\s/g, '');
    const seq  = raw.toUpperCase();

    if (seq.length < 5) throw new Error('Sequence too short (minimum 5 residues).');
    const invalid = [...new Set(seq.split('').filter(aa => !'ACDEFGHIKLMNPQRSTVWY'.includes(aa)))];
    if (invalid.length) throw new Error(`Non-canonical residues: ${invalid.join(', ')}`);

    // ── Try ML service first ──────────────────────────────────────────────
    let result;
    let usedMLService = false;

    try {
      result = await postToMLService('/predict', {
        sequence:     seq,   // send cleaned sequence, not raw fastaSequence
        conditions:   pred.conditions || {},
        tier,
        predictionId: String(predictionId),
      });
      usedMLService = true;
    } catch (mlErr) {
      console.warn(`[prediction] ML service unavailable (${mlErr.message}) — using BLOSUM fallback`);
      result = buildFallbackPrediction(seq, tier);
    }

    const { candidates, hotspotMap, modelVersion, nTrainingVars } = result;

    await Prediction.findByIdAndUpdate(predictionId, {
      status:           'COMPLETED',
      candidates,
      candidatesCount:  candidates.length,
      hotspotMap:       tier === 'BRONZE' ? [] : hotspotMap,
      modelVersion:     modelVersion + (usedMLService ? '' : ' [fallback]'),
      similarityWarning: false,
      similarityScore:   1.0,
      completedAt:       new Date(),
    });

  } catch (err) {
    await Prediction.findByIdAndUpdate(predictionId, {
      status:       'FAILED',
      errorMessage: err.message,
    });
  }
}

module.exports = { runPrediction };
