const express = require('express');
const Experiment = require('../models/Experiment');
const Measurement = require('../models/Measurement');
const { authenticate } = require('../middleware/auth');
const { computeHalfLives, normalizeToReference, computeApparentTm, runGrubbsTest,
        rankableMetric, isRankable, MIN_R2 } = require('../services/analyticsService');
const Project = require('../models/Project');
const { predictedVsMeasured } = require('../services/validationService');

const router = express.Router();
router.use(authenticate);

// POST /api/analytics/compute/:experimentId
// Runs all applicable analytics for the experiment:
//   - Exponential decay half-life fit (kinetic time-series data)
//   - Boltzmann sigmoid fit → apparent Tm (thermal ramp data)
//   - Fold-change normalisation to WT_HSFAST_FUSION reference (endpoint data)
//   - Grubbs single-outlier test across replicate groups (runs after metrics are written)
router.post('/compute/:experimentId', async (req, res, next) => {
  try {
    const experiment = await Experiment.findById(req.params.experimentId);
    if (!experiment) return res.status(404).json({ error: 'Experiment not found' });

    const [halfLifeCount, normalizedCount, apparentTmCount] = await Promise.all([
      computeHalfLives(req.params.experimentId),
      normalizeToReference(req.params.experimentId),
      computeApparentTm(req.params.experimentId),
    ]);

    // Grubbs runs after metrics are written — it reads the derived values just computed
    const grubbsFlagCount = await runGrubbsTest(req.params.experimentId);

    res.json({
      halfLifeCount,
      normalizedCount,
      apparentTmCount,
      grubbsFlagCount,
      message: `Analytics complete: ${halfLifeCount} half-life fits, ${normalizedCount} fold-changes, ${apparentTmCount} apparent Tm fits, ${grubbsFlagCount} Grubbs outlier(s) flagged.`,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/summary/:experimentId
// Returns aggregate stats across all measurements (mean half-life, best variant, etc.)
router.get('/summary/:experimentId', async (req, res, next) => {
  try {
    const measurements = await Measurement.find({
      experiment: req.params.experimentId,
      excluded: false,
    }).populate('variant', 'name mutations');

    const halfLives = [];
    const foldChanges = [];
    const apparentTms = [];

    // Only fits that pass the R2 gate are eligible for the rankings below — a
    // non-decaying well fits with k ~ 0 and produces an enormous, meaningless t-half.
    let excludedPoorFit = 0;
    for (const m of measurements) {
      const hlRaw = m.derivedMetrics?.find(d => d.metricType === 'half_life');
      const tmRaw = m.derivedMetrics?.find(d => d.metricType === 'apparent_tm');
      const hl = rankableMetric(m, 'half_life');
      const fc = rankableMetric(m, 'fold_change');
      const tm = rankableMetric(m, 'apparent_tm');
      if (hlRaw?.value != null && !hl) excludedPoorFit++;
      if (tmRaw?.value != null && !tm) excludedPoorFit++;
      if (hl?.value != null) halfLives.push({ value: hl.value, r2: hl.goodnessOfFit, measurement: m });
      if (fc?.value != null) foldChanges.push({ value: fc.value, measurement: m });
      if (tm?.value != null) apparentTms.push({ value: tm.value, r2: tm.goodnessOfFit, measurement: m });
    }

    const mean = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    const topByHalfLife = halfLives
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .map(({ value, r2, measurement }) => ({
        sampleId: measurement.replicateGroup?.split('_R')[0] || measurement.sampleType,
        variant: measurement.variant?.name || null,
        halfLife: value,
        r2,
        wellPosition: measurement.wellPosition,
      }));

    const topByFoldChange = foldChanges
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .map(({ value, measurement }) => ({
        sampleId: measurement.replicateGroup?.split('_R')[0] || measurement.sampleType,
        variant: measurement.variant?.name || null,
        foldChange: value,
        wellPosition: measurement.wellPosition,
      }));

    const topByTm = apparentTms
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .map(({ value, r2, measurement }) => ({
        sampleId: measurement.replicateGroup?.split('_R')[0] || measurement.sampleType,
        variant: measurement.variant?.name || null,
        apparentTm: value,
        r2,
        wellPosition: measurement.wellPosition,
      }));

    res.json({
      fitGate: {
        minR2: MIN_R2,
        excludedPoorFit,
        note: excludedPoorFit
          ? `${excludedPoorFit} metric(s) excluded from rankings for failing the goodness-of-fit threshold. They remain stored and visible in the measurement table.`
          : 'All fits passed the goodness-of-fit threshold.',
      },
      halfLifeStats: {
        count: halfLives.length,
        mean: mean(halfLives.map(h => h.value))?.toFixed(2) ?? null,
        max: halfLives.length ? Math.max(...halfLives.map(h => h.value)).toFixed(2) : null,
        top10: topByHalfLife,
      },
      foldChangeStats: {
        count: foldChanges.length,
        mean: mean(foldChanges.map(f => f.value))?.toFixed(4) ?? null,
        max: foldChanges.length ? Math.max(...foldChanges.map(f => f.value)).toFixed(4) : null,
        top10: topByFoldChange,
      },
      apparentTmStats: {
        count: apparentTms.length,
        mean: mean(apparentTms.map(t => t.value))?.toFixed(2) ?? null,
        max: apparentTms.length ? Math.max(...apparentTms.map(t => t.value)).toFixed(2) : null,
        top10: topByTm,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/mutations/:projectId
// Returns per-position stability summary for all single-point mutations in the project.
// Each position lists every substitution tested, with mean half-life / fold-change and
// delta vs the WT_HSFAST_FUSION reference so scientists can see which hotspots tolerate
// stabilising mutations.
router.get('/mutations/:projectId', async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.projectId).select('name');
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const Variant = require('../models/Variant');

    // All variants with at least one point mutation
    const variants = await Variant.find({
      project: req.params.projectId,
      'mutations.0': { $exists: true },
    }).select('name mutations').lean();

    if (variants.length === 0) return res.json({ project: project.name, wtHalfLife: null, positions: [] });

    const variantIds = variants.map(v => v._id);

    // Pull derived metrics for all variant measurements (exclude WT/controls)
    const measurements = await Measurement.find({
      variant: { $in: variantIds },
      excluded: false,
    }).select('variant derivedMetrics').lean();

    // Bucket metrics by variantId
    const metricsByVariant = {};
    for (const m of measurements) {
      const vid = String(m.variant);
      if (!metricsByVariant[vid]) metricsByVariant[vid] = { halfLives: [], foldChanges: [] };
      // Same fit gate — a failed decay fit would otherwise dominate bestDelta.
      for (const d of m.derivedMetrics || []) {
        if (d.value == null || !isRankable(d)) continue;
        if (d.metricType === 'half_life')   metricsByVariant[vid].halfLives.push(d.value);
        if (d.metricType === 'fold_change') metricsByVariant[vid].foldChanges.push(d.value);
      }
    }

    // WT reference half-life (REFERENCE sampleType in any experiment of this project)
    const expIds = await Experiment.find({ project: req.params.projectId }).distinct('_id');
    const wtMs = await Measurement.find({
      experiment: { $in: expIds },
      sampleType: 'REFERENCE',
      excluded: false,
    }).select('derivedMetrics').lean();

    const wtHalfLives = wtMs.flatMap(m =>
      (m.derivedMetrics || [])
        .filter(d => d.metricType === 'half_life' && isRankable(d))
        .map(d => d.value)
    ).filter(v => v != null);
    const wtHalfLife = wtHalfLives.length
      ? parseFloat((wtHalfLives.reduce((a, b) => a + b, 0) / wtHalfLives.length).toFixed(3))
      : null;

    const avg = arr => arr.length ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(3)) : null;

    // Build per-position map
    const posMap = {};
    for (const v of variants) {
      const vid = String(v._id);
      const mets = metricsByVariant[vid] || { halfLives: [], foldChanges: [] };
      const meanHL = avg(mets.halfLives);
      const meanFC = avg(mets.foldChanges);

      for (const mut of v.mutations) {
        const pos = mut.position;
        if (!posMap[pos]) posMap[pos] = { position: pos, fromAa: mut.from, mutations: [] };

        posMap[pos].mutations.push({
          to:          mut.to,
          notation:    mut.notation || `${mut.from}${pos}${mut.to}`,
          variantId:   v._id,
          variantName: v.name,
          meanHalfLife:   meanHL,
          meanFoldChange: meanFC,
          deltaHalfLife:  meanHL != null && wtHalfLife != null
            ? parseFloat((meanHL - wtHalfLife).toFixed(3))
            : null,
          n: mets.halfLives.length,
        });
      }
    }

    // Summarise each position (best delta, mean across substitutions at the position)
    const positions = Object.values(posMap)
      .map(p => {
        const deltas = p.mutations.map(m => m.deltaHalfLife).filter(d => d != null);
        const hls    = p.mutations.map(m => m.meanHalfLife).filter(h => h != null);
        return {
          ...p,
          bestDelta:       deltas.length ? parseFloat(Math.max(...deltas).toFixed(3)) : null,
          meanHalfLife:    avg(hls),
          mutationCount:   p.mutations.length,
        };
      })
      .sort((a, b) => a.position - b.position);

    res.json({ project: project.name, wtHalfLife, positions });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/campaign/:projectId
// Returns per-experiment stability metrics (mean + max half-life, fold-change, Tm) sorted by date.
// Only experiments that have had analytics run (i.e. have derived metrics) contribute numeric values;
// experiments without measurements still appear so scientists can see gaps in the timeline.
router.get('/campaign/:projectId', async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.projectId).select('name');
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const experiments = await Experiment.find({ project: req.params.projectId })
      .select('name date assayType')
      .sort({ date: 1 })
      .lean();

    if (experiments.length === 0) return res.json({ project: project.name, experiments: [] });

    const expIds = experiments.map(e => e._id);

    const measurements = await Measurement.find({
      experiment: { $in: expIds },
      excluded: false,
    }).select('experiment derivedMetrics').lean();

    const byExp = {};
    for (const m of measurements) {
      const eid = String(m.experiment);
      if (!byExp[eid]) byExp[eid] = { halfLives: [], foldChanges: [], apparentTms: [], n: 0 };
      byExp[eid].n += 1;
      // Fit gate: poor fits are excluded so `bestHalfLife`/`bestTm` (a Math.max)
      // cannot be won by a well that failed to fit.
      for (const d of m.derivedMetrics || []) {
        if (d.value == null || !isRankable(d)) continue;
        if (d.metricType === 'half_life')   byExp[eid].halfLives.push(d.value);
        if (d.metricType === 'fold_change') byExp[eid].foldChanges.push(d.value);
        if (d.metricType === 'apparent_tm') byExp[eid].apparentTms.push(d.value);
      }
    }

    const avg  = arr => arr.length ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(3)) : null;
    const best = arr => arr.length ? parseFloat(Math.max(...arr).toFixed(3)) : null;

    const result = experiments.map(exp => {
      const d = byExp[String(exp._id)] || { halfLives: [], foldChanges: [], apparentTms: [], n: 0 };
      return {
        experimentId: exp._id,
        name:         exp.name,
        date:         exp.date,
        assayType:    exp.assayType,
        measurements: d.n,
        meanHalfLife:   avg(d.halfLives),
        bestHalfLife:   best(d.halfLives),
        meanFoldChange: avg(d.foldChanges),
        bestFoldChange: best(d.foldChanges),
        meanTm:         avg(d.apparentTms),
        bestTm:         best(d.apparentTms),
      };
    });

    res.json({ project: project.name, experiments: result });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/predicted-vs-measured?projectId=&experimentId=&metric=
//
// Joins model predictions to bench measurements through Variant and reports how
// well the predicted ordering matched the measured one. Scope is a whole project
// by default, or a single experiment when experimentId is given.
router.get('/predicted-vs-measured', async (req, res, next) => {
  try {
    const { projectId, experimentId, metric } = req.query;
    if (!projectId && !experimentId) {
      return res.status(400).json({ error: 'projectId or experimentId is required' });
    }

    const result = await predictedVsMeasured({
      projectId,
      experimentId,
      metricType: metric || 'apparent_tm',
    });
    res.json(result);
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
