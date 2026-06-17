const Measurement = require('../models/Measurement');

// ── Boltzmann sigmoid: F(T) = Fmin + (Fmax - Fmin) / (1 + exp((T - Tm) / k)) ─
// Fmax = folded baseline (high F at low T), Fmin = unfolded baseline (low F at high T)

function sigmoid(T, Tm, k, Fmin, Fmax) {
  const z = (T - Tm) / k;
  if (z > 500) return Fmin;
  if (z < -500) return Fmax;
  return Fmin + (Fmax - Fmin) / (1 + Math.exp(z));
}

// ── Nelder-Mead simplex minimiser (pure JS, no dependencies) ──────────────────

function nelderMead(fn, x0, { maxIter = 2000, tol = 1e-12 } = {}) {
  const n = x0.length;
  const alpha = 1, gamma = 2, rho = 0.5, sigma = 0.5;

  let pts = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const p = x0.slice();
    p[i] += Math.abs(p[i]) > 1e-8 ? Math.abs(p[i]) * 0.05 : 0.025;
    pts.push(p);
  }
  let fval = pts.map(fn);

  for (let iter = 0; iter < maxIter; iter++) {
    const idx = Array.from({ length: n + 1 }, (_, i) => i).sort((a, b) => fval[a] - fval[b]);
    pts  = idx.map(i => pts[i]);
    fval = idx.map(i => fval[i]);

    if (fval[n] - fval[0] < tol) break;

    const c = Array(n).fill(0);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) c[j] += pts[i][j] / n;

    const xr = c.map((cj, j) => cj + alpha * (cj - pts[n][j]));
    const fr = fn(xr);

    if (fr >= fval[0] && fr < fval[n - 1]) {
      pts[n] = xr; fval[n] = fr;
    } else if (fr < fval[0]) {
      const xe = c.map((cj, j) => cj + gamma * (xr[j] - cj));
      const fe = fn(xe);
      if (fe < fr) { pts[n] = xe; fval[n] = fe; }
      else { pts[n] = xr; fval[n] = fr; }
    } else {
      const outside = fr < fval[n];
      const xc = outside
        ? c.map((cj, j) => cj + rho * (xr[j] - cj))
        : c.map((cj, j) => cj + rho * (pts[n][j] - cj));
      const fc = fn(xc);
      if (fc < (outside ? fr : fval[n])) {
        pts[n] = xc; fval[n] = fc;
      } else {
        for (let i = 1; i <= n; i++) {
          pts[i] = pts[i].map((xi, j) => pts[0][j] + sigma * (xi - pts[0][j]));
          fval[i] = fn(pts[i]);
        }
      }
    }
  }

  return pts[0];
}

// ── Fit Boltzmann sigmoid to temperature-scan readings ────────────────────────
// readings: [{ timepoint: temperature_C, fluorescence }]
// Returns { Tm, k, Fmin, Fmax, r2 } or null if fit fails

function fitSigmoid(readings) {
  const valid = readings.filter(
    r => r.timepoint != null && r.fluorescence != null &&
         isFinite(r.timepoint) && isFinite(r.fluorescence),
  );
  if (valid.length < 5) return null;

  const sorted = [...valid].sort((a, b) => a.timepoint - b.timepoint);
  const Ts = sorted.map(r => r.timepoint);
  const Fs = sorted.map(r => r.fluorescence);
  const n  = Ts.length;
  const q  = Math.max(1, Math.floor(n / 4));

  // Initial estimates: baselines from temperature extremes
  const FmaxEst = Fs.slice(0, q).reduce((a, b) => a + b, 0) / q;
  const FminEst = Fs.slice(-q).reduce((a, b) => a + b, 0) / q;
  if (FmaxEst <= FminEst) return null; // curve is inverted or flat

  const midF = (FmaxEst + FminEst) / 2;
  let tmEst = Ts[Math.floor(n / 2)];
  let minDiff = Infinity;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(Fs[i] - midF);
    if (d < minDiff) { minDiff = d; tmEst = Ts[i]; }
  }

  const PENALTY = 1e15;
  function cost([Tm, k, Fmin, Fmax]) {
    if (k <= 0 || Fmax <= Fmin) return PENALTY;
    let sse = 0;
    for (let i = 0; i < n; i++) {
      const res = Fs[i] - sigmoid(Ts[i], Tm, k, Fmin, Fmax);
      sse += res * res;
    }
    return sse;
  }

  const best = nelderMead(cost, [tmEst, 5, FminEst, FmaxEst]);
  const [Tm, k, Fmin, Fmax] = best;

  if (k <= 0 || Fmax <= Fmin || !isFinite(Tm)) return null;

  const fMean = Fs.reduce((a, b) => a + b, 0) / n;
  const ssTot = Fs.reduce((acc, f) => acc + (f - fMean) ** 2, 0);
  const ssRes = Fs.reduce((acc, f, i) => {
    const res = f - sigmoid(Ts[i], Tm, k, Fmin, Fmax);
    return acc + res * res;
  }, 0);
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  return {
    Tm:   parseFloat(Tm.toFixed(2)),
    k:    parseFloat(k.toFixed(3)),
    Fmin: parseFloat(Fmin.toFixed(1)),
    Fmax: parseFloat(Fmax.toFixed(1)),
    r2:   parseFloat(r2.toFixed(4)),
  };
}

// ── Linear regression on (xs, ys) ────────────────────────────────────────────

function linearRegression(xs, ys) {
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumX2 = xs.reduce((acc, x) => acc + x * x, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const yMean = sumY / n;
  const ssTot = ys.reduce((acc, y) => acc + (y - yMean) ** 2, 0);
  const ssRes = ys.reduce((acc, y, i) => acc + (y - (slope * xs[i] + intercept)) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  return { slope, intercept, r2 };
}

// ── Fit single-exponential decay: F(t) = F0·exp(-k·t) ───────────────────────
// Linearised: ln(F) = ln(F0) - k·t  →  y = b + m·x  where m = -k

function fitDecay(readings) {
  const valid = readings.filter(r => r.timepoint != null && r.fluorescence > 0);
  if (valid.length < 3) return null;

  const xs = valid.map(r => r.timepoint);
  const ys = valid.map(r => Math.log(r.fluorescence));

  const fit = linearRegression(xs, ys);
  if (!fit) return null;

  const k = -fit.slope;
  if (k <= 1e-9) return null; // no meaningful decay

  return {
    k,
    F0: Math.exp(fit.intercept),
    halfLife: Math.log(2) / k,
    r2: fit.r2,
  };
}

// ── Compute half-lives for all kinetic measurements in an experiment ──────────

async function computeHalfLives(experimentId) {
  const measurements = await Measurement.find({ experiment: experimentId, excluded: false });

  let updated = 0;
  for (const m of measurements) {
    if (m.metadata?.dataType === 'thermal_ramp') continue; // handled by computeApparentTm
    const hasTimeSeries = m.rawReadings?.some(r => r.timepoint != null);
    if (!hasTimeSeries) continue;

    const result = fitDecay(m.rawReadings);
    if (!result) continue;

    const filtered = (m.derivedMetrics || []).filter(
      d => d.metricType !== 'half_life' && d.metricType !== 'rate_constant',
    );

    filtered.push({
      metricType: 'half_life',
      value: parseFloat(result.halfLife.toFixed(2)),
      unit: 'min',
      goodnessOfFit: parseFloat(result.r2.toFixed(4)),
      analyticsVersion: '1.1',
    });

    filtered.push({
      metricType: 'rate_constant',
      value: parseFloat(result.k.toFixed(6)),
      unit: 'min^-1',
      goodnessOfFit: parseFloat(result.r2.toFixed(4)),
      analyticsVersion: '1.1',
    });

    const qcFlags = (m.qcFlags || []).filter(f => f !== 'poor_fit');
    if (result.r2 < 0.8) qcFlags.push('poor_fit');

    await Measurement.findByIdAndUpdate(m._id, { derivedMetrics: filtered, qcFlags });
    updated++;
  }

  return updated;
}

// ── Normalise endpoint fluorescence to WT_HSFAST_FUSION reference ─────────────

async function normalizeToReference(experimentId) {
  const measurements = await Measurement.find({ experiment: experimentId, excluded: false });

  // Reference = REFERENCE-type with at least one endpoint reading
  const refReadings = measurements
    .filter(m => m.sampleType === 'REFERENCE')
    .flatMap(m => m.rawReadings.filter(r => r.timepoint == null && r.fluorescence > 0))
    .map(r => r.fluorescence);

  if (refReadings.length === 0) return 0;

  const refMean = refReadings.reduce((a, b) => a + b, 0) / refReadings.length;

  let updated = 0;
  for (const m of measurements) {
    const ep = m.rawReadings?.find(r => r.timepoint == null && r.fluorescence != null);
    if (!ep) continue;

    const foldChange = parseFloat((ep.fluorescence / refMean).toFixed(4));

    const filtered = (m.derivedMetrics || []).filter(d => d.metricType !== 'fold_change');
    filtered.push({
      metricType: 'fold_change',
      value: foldChange,
      unit: 'fold vs WT',
      analyticsVersion: '1.1',
    });

    await Measurement.findByIdAndUpdate(m._id, { derivedMetrics: filtered });
    updated++;
  }

  return updated;
}

// ── Compute apparent Tm for thermal-ramp measurements in an experiment ─────────

async function computeApparentTm(experimentId) {
  const measurements = await Measurement.find({
    experiment: experimentId,
    excluded: false,
    'metadata.dataType': 'thermal_ramp',
  });

  let updated = 0;
  for (const m of measurements) {
    if (!m.rawReadings || m.rawReadings.length < 5) continue;

    const result = fitSigmoid(m.rawReadings);
    if (!result) continue;

    const filtered = (m.derivedMetrics || []).filter(d => d.metricType !== 'apparent_tm');
    filtered.push({
      metricType:      'apparent_tm',
      value:           result.Tm,
      unit:            'C',
      goodnessOfFit:   result.r2,
      analyticsVersion: '1.2',
    });

    const qcFlags = (m.qcFlags || []).filter(f => f !== 'poor_sigmoid_fit');
    if (result.r2 < 0.85) qcFlags.push('poor_sigmoid_fit');

    await Measurement.findByIdAndUpdate(m._id, { derivedMetrics: filtered, qcFlags });
    updated++;
  }

  return updated;
}

// ── Grubbs single-outlier test (α=0.05, two-sided) ───────────────────────────
// Returns the index of the outlier in `values`, or null if none detected.
// Requires n≥4: for n=3 the G statistic is algebraically capped at G_crit,
// so the test can never fire — better to skip than give misleading results.

const GRUBBS_CRIT = {
  4: 1.481, 5: 1.715, 6: 1.887, 7: 2.020, 8: 2.127, 9: 2.215,
  10: 2.290, 11: 2.355, 12: 2.412, 13: 2.462, 14: 2.507, 15: 2.549,
  16: 2.585, 17: 2.620, 18: 2.651, 19: 2.681, 20: 2.709,
  25: 2.822, 30: 2.908,
};

function grubbsTest(values) {
  const n = values.length;
  if (n < 4) return null;

  const mean = values.reduce((a, b) => a + b, 0) / n;
  const s    = Math.sqrt(values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (n - 1));
  if (s < 1e-10) return null; // all values identical

  let maxG = 0, maxIdx = -1;
  for (let i = 0; i < n; i++) {
    const G = Math.abs(values[i] - mean) / s;
    if (G > maxG) { maxG = G; maxIdx = i; }
  }

  // For n > 30, use the n=30 critical value (conservative)
  const gcrit = GRUBBS_CRIT[n] ?? GRUBBS_CRIT[30];
  return maxG > gcrit ? maxIdx : null;
}

// ── Run Grubbs test across all replicate groups in an experiment ───────────────
// Groups measurements by sample base (strips _R{n} suffix from replicateGroup).
// Tests half_life, fold_change, and apparent_tm independently per group.
// Flags outliers with 'grubbs_outlier' in qcFlags; clears stale flags first.

async function runGrubbsTest(experimentId) {
  // Clear any flags from a prior run so re-compute is idempotent
  await Measurement.updateMany(
    { experiment: experimentId },
    { $pull: { qcFlags: 'grubbs_outlier' } },
  );

  const measurements = await Measurement.find({
    experiment: experimentId,
    excluded: false,
    replicateGroup: { $ne: null },
  });

  // Group by sample base (e.g. "WT_HSFAST_FUSION_R2" → "WT_HSFAST_FUSION")
  const groups = {};
  for (const m of measurements) {
    const base = m.replicateGroup.replace(/_R\d+$/, '');
    if (!groups[base]) groups[base] = [];
    groups[base].push(m);
  }

  let flagged = 0;
  const METRIC_TYPES = ['half_life', 'fold_change', 'apparent_tm'];

  for (const group of Object.values(groups)) {
    if (group.length < 4) continue; // Grubbs requires ≥4

    for (const metricType of METRIC_TYPES) {
      const entries = group
        .map(m => ({ m, value: m.derivedMetrics?.find(d => d.metricType === metricType)?.value }))
        .filter(e => e.value != null);

      if (entries.length < 4) continue;

      const outlierIdx = grubbsTest(entries.map(e => e.value));
      if (outlierIdx === null) continue;

      await Measurement.findByIdAndUpdate(entries[outlierIdx].m._id, {
        $addToSet: { qcFlags: 'grubbs_outlier' },
      });
      flagged++;
    }
  }

  return flagged;
}

module.exports = { computeHalfLives, normalizeToReference, computeApparentTm, fitSigmoid, grubbsTest, runGrubbsTest };
