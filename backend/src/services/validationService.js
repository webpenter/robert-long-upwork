const Measurement = require('../models/Measurement');
const Prediction  = require('../models/Prediction');
const Experiment  = require('../models/Experiment');
// Required for its registration side effect, not for a binding: the populate
// calls below resolve the "Variant" model by name, and a caller that has not
// already loaded it otherwise gets MissingSchemaError at query time.
require('../models/Variant');
const { rankableMetric } = require('./analyticsService');

// ── Direction of each measured metric ────────────────────────────────────────
// The model and the bench do not agree on which way "good" points, and getting
// this backwards is not hypothetical — an unlabelled axis is exactly what made
// an earlier error-analysis table read upside down for everyone on the thread.
// So direction is declared once, here, and every comparison below is expressed
// in a single orientation: STABILITY, where larger is always more stable.
//
//   stored Prediction.dG  -> more NEGATIVE is more stable (the API flips sign)
//   apparent Tm / t-half  -> larger is more stable
//   rate constant k       -> larger means faster decay, so LESS stable
const METRIC_DIRECTION = {
  apparent_tm:   { higherIsMoreStable: true,  label: 'Apparent Tm',   unit: '°C'     },
  half_life:     { higherIsMoreStable: true,  label: 'Half-life',     unit: 'min'    },
  fold_change:   { higherIsMoreStable: true,  label: 'Fold vs WT',    unit: '×'      },
  rate_constant: { higherIsMoreStable: false, label: 'Rate constant', unit: 'min^-1' },
  ec50:          { higherIsMoreStable: true,  label: 'EC50',          unit: ''       },
};

const SUPPORTED_METRICS = Object.keys(METRIC_DIRECTION);

// ── Statistics ───────────────────────────────────────────────────────────────

const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;

function stdDev(arr) {
  if (arr.length < 2) return null;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((acc, v) => acc + (v - m) ** 2, 0) / (arr.length - 1));
}

/** Ranks, 1-based, with tied values sharing the average of the ranks they span. */
function averageRanks(values) {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].v === order[i].v) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[order[k].i] = avg;
    i = j + 1;
  }
  return ranks;
}

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  if (dx === 0 || dy === 0) return null; // one side constant — undefined, not zero
  return num / Math.sqrt(dx * dy);
}

function spearman(xs, ys) {
  if (xs.length < 3) return null;
  return pearson(averageRanks(xs), averageRanks(ys));
}

/**
 * Two-sided permutation p-value for a Spearman correlation.
 *
 * Deliberately not the usual t-approximation. The first panels off a new bench
 * will have n around 10-20, where that approximation is unreliable, and the
 * whole point of this screen is to say honestly whether an encouraging-looking
 * number means anything yet. Shuffling assumes no distribution.
 */
function permutationP(xs, ys, observed, iterations = 20000) {
  if (observed == null || xs.length < 3) return null;
  const xr = averageRanks(xs);
  const yr = averageRanks(ys);
  const shuffled = yr.slice();
  const target = Math.abs(observed) - 1e-12;
  let atLeastAsExtreme = 0;

  for (let it = 0; it < iterations; it++) {
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const r = pearson(xr, shuffled);
    if (r != null && Math.abs(r) >= target) atLeastAsExtreme++;
  }
  // +1 on both sides: the observed arrangement is itself one of the possible
  // orderings, which stops the estimate reporting an impossible p = 0.
  return (atLeastAsExtreme + 1) / (iterations + 1);
}

function linearFit(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = mean(xs), my = mean(ys);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  return { slope, intercept: my - slope * mx };
}

// ── Pairing predictions to measurements ──────────────────────────────────────

/**
 * Joins predicted stability to measured stability through Variant, the only key
 * the two halves of the platform share.
 *
 * Absolute error is deliberately NOT reported. A predicted dG is in kcal/mol and
 * an apparent Tm is in degrees Celsius; subtracting them would be meaningless.
 * What does transfer across units is the ORDER — which is also the part of the
 * output we have evidence for, since ranking survived the projector fix that
 * rescaled every absolute value.
 */
async function predictedVsMeasured({ projectId, experimentId, metricType = 'apparent_tm' }) {
  if (!SUPPORTED_METRICS.includes(metricType)) {
    const err = new Error(`Unsupported metric "${metricType}"`);
    err.status = 400;
    throw err;
  }
  const direction = METRIC_DIRECTION[metricType];

  let experimentIds;
  if (experimentId) {
    experimentIds = [experimentId];
  } else {
    const exps = await Experiment.find({ project: projectId }).select('_id');
    experimentIds = exps.map(e => e._id);
  }
  if (experimentIds.length === 0) return emptyResult(metricType, direction);

  const measurements = await Measurement.find({
    experiment: { $in: experimentIds },
    excluded: false,
    variant: { $ne: null },
  }).populate({ path: 'variant', select: 'name mutations parent', populate: { path: 'parent', select: 'name' } });

  // Which metrics does this scope actually hold? An assay records one or two of
  // them, not all five, so defaulting the UI to a metric nobody measured shows an
  // empty page that looks like a fault. Counted over the same measurement pass.
  const availability = Object.fromEntries(SUPPORTED_METRICS.map(t => [t, new Set()]));
  for (const m of measurements) {
    if (!m.variant) continue;
    for (const type of SUPPORTED_METRICS) {
      const g = rankableMetric(m, type);
      if (g?.value != null) availability[type].add(String(m.variant._id));
    }
  }
  const availableMetrics = SUPPORTED_METRICS
    .map(type => ({ type, label: METRIC_DIRECTION[type].label, nVariants: availability[type].size }))
    .filter(a => a.nVariants > 0)
    .sort((a, b) => b.nVariants - a.nVariants);

  // Collapse replicates to one value per variant. Wells failing the R2 gate are
  // dropped: a flat well fits with k near zero and yields an enormous half-life,
  // which would otherwise dominate the correlation by itself.
  const byVariant = new Map();
  let excludedPoorFit = 0;

  for (const m of measurements) {
    if (!m.variant) continue;
    const raw   = (m.derivedMetrics || []).find(d => d.metricType === metricType);
    const gated = rankableMetric(m, metricType);
    if (raw?.value != null && !gated) { excludedPoorFit++; continue; }
    if (!gated || gated.value == null) continue;

    const key = String(m.variant._id);
    if (!byVariant.has(key)) {
      byVariant.set(key, { variant: m.variant, values: [], unit: gated.unit || direction.unit });
    }
    byVariant.get(key).values.push(gated.value);
  }

  const variantIds = [...byVariant.keys()];
  if (variantIds.length === 0) {
    return {
      ...emptyResult(metricType, direction),
      availableMetrics,
      coverage: { variantsWithMeasurements: 0, variantsWithPredictions: 0, paired: 0, excludedPoorFit },
    };
  }

  // Newest completed prediction per variant.
  const predictions = await Prediction.find({
    variant: { $in: variantIds },
    status: 'COMPLETED',
    dG: { $ne: null },
  })
    .sort({ createdAt: -1 })
    .select('variant dG modelVersion inDistribution flags seqLen createdAt');

  const predByVariant = new Map();
  for (const p of predictions) {
    const key = String(p.variant);
    if (!predByVariant.has(key)) predByVariant.set(key, p); // sorted newest-first
  }

  const rows = [];
  for (const [key, entry] of byVariant) {
    const pred = predByVariant.get(key);
    if (!pred) continue;

    const measuredMean = mean(entry.values);
    rows.push({
      variantId:      key,
      name:           entry.variant.name,
      mutations:      (entry.variant.mutations || []).map(mu => mu.notation || `${mu.from}${mu.position}${mu.to}`),
      parentId:       entry.variant.parent ? String(entry.variant.parent._id || entry.variant.parent) : null,
      parentName:     entry.variant.parent?.name || null,
      predictedDg:    pred.dG,
      modelVersion:   pred.modelVersion,
      inDistribution: pred.inDistribution !== false,
      flags:          pred.flags || [],
      measured:       parseFloat(measuredMean.toFixed(3)),
      measuredSd:     entry.values.length > 1 ? parseFloat(stdDev(entry.values).toFixed(3)) : null,
      nReplicates:    entry.values.length,
      unit:           entry.unit,
      // One orientation for both sides: larger = more stable.
      predictedStability: -pred.dG,
      measuredStability:  direction.higherIsMoreStable ? measuredMean : -measuredMean,
    });
  }

  const stats = correlate(rows);
  assignRanks(rows);

  return {
    metric: { type: metricType, ...direction },
    ...stats,
    rows: rows.sort((a, b) => a.predictedRank - b.predictedRank),
    byParent: perParent(rows),
    availableMetrics,
    coverage: {
      variantsWithMeasurements: byVariant.size,
      variantsWithPredictions:  predByVariant.size,
      paired:                   rows.length,
      excludedPoorFit,
    },
    modelVersions: [...new Set(rows.map(r => r.modelVersion).filter(Boolean))],
  };
}

/** Correlation in stability orientation: +1 means the model ordered them correctly. */
function correlate(rows) {
  if (rows.length < 3) {
    return { n: rows.length, spearman: null, spearmanP: null, pearson: null, fit: null };
  }
  const ps = rows.map(r => r.predictedStability);
  const ms = rows.map(r => r.measuredStability);
  const rho = spearman(ps, ms);
  const r   = pearson(ps, ms);
  return {
    n: rows.length,
    spearman:  rho == null ? null : parseFloat(rho.toFixed(4)),
    spearmanP: rho == null ? null : parseFloat(permutationP(ps, ms, rho).toFixed(4)),
    pearson:   r   == null ? null : parseFloat(r.toFixed(4)),
    // Fitted in display coordinates (predicted dG against the raw measured value)
    // so the chart can draw the trend line without re-deriving it.
    fit: linearFit(rows.map(r2 => r2.predictedDg), rows.map(r2 => r2.measured)),
  };
}

/** Rank 1 = most stable on each side; rankError surfaces the biggest misses. */
function assignRanks(rows) {
  [...rows].sort((a, b) => b.predictedStability - a.predictedStability)
    .forEach((r, i) => { r.predictedRank = i + 1; });
  [...rows].sort((a, b) => b.measuredStability - a.measuredStability)
    .forEach((r, i) => { r.measuredRank = i + 1; });
  rows.forEach(r => { r.rankError = Math.abs(r.predictedRank - r.measuredRank); });
}

/**
 * The same correlation computed within each parent scaffold.
 *
 * This is the number that answers the question the client actually cares about.
 * A model can rank unrelated proteins well by picking up broad properties and
 * still be unable to order two point mutants of one enzyme — pooling every
 * variant into a single figure hides precisely that failure.
 */
function perParent(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = r.parentId || '__ungrouped__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const out = [];
  for (const [parentId, group] of groups) {
    if (parentId === '__ungrouped__' || group.length < 3) continue;
    const ps = group.map(r => r.predictedStability);
    const ms = group.map(r => r.measuredStability);
    const rho = spearman(ps, ms);
    if (rho == null) continue;
    out.push({
      parentId,
      parentName: group[0].parentName,
      n: group.length,
      spearman: parseFloat(rho.toFixed(4)),
      spearmanP: parseFloat(permutationP(ps, ms, rho).toFixed(4)),
      variants: group.map(r => r.name),
    });
  }
  return out.sort((a, b) => b.n - a.n);
}

function emptyResult(metricType, direction) {
  return {
    metric: { type: metricType, ...direction },
    n: 0, spearman: null, spearmanP: null, pearson: null, fit: null,
    rows: [], byParent: [], availableMetrics: [],
    coverage: { variantsWithMeasurements: 0, variantsWithPredictions: 0, paired: 0, excludedPoorFit: 0 },
    modelVersions: [],
  };
}

module.exports = {
  predictedVsMeasured,
  SUPPORTED_METRICS,
  METRIC_DIRECTION,
  // exported for tests
  averageRanks, pearson, spearman, permutationP,
};
