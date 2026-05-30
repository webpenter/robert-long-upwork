const Measurement = require('../models/Measurement');

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

module.exports = { computeHalfLives, normalizeToReference };
