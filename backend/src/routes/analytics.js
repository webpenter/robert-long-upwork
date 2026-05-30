const express = require('express');
const Experiment = require('../models/Experiment');
const Measurement = require('../models/Measurement');
const { authenticate } = require('../middleware/auth');
const { computeHalfLives, normalizeToReference } = require('../services/analyticsService');

const router = express.Router();
router.use(authenticate);

// POST /api/analytics/compute/:experimentId
// Runs all applicable analytics for the experiment:
//   - Exponential decay half-life fit (kinetic/denaturation data)
//   - Fold-change normalisation to WT_HSFAST_FUSION reference (endpoint data)
router.post('/compute/:experimentId', async (req, res, next) => {
  try {
    const experiment = await Experiment.findById(req.params.experimentId);
    if (!experiment) return res.status(404).json({ error: 'Experiment not found' });

    const [halfLifeCount, normalizedCount] = await Promise.all([
      computeHalfLives(req.params.experimentId),
      normalizeToReference(req.params.experimentId),
    ]);

    res.json({
      halfLifeCount,
      normalizedCount,
      message: `Analytics complete: ${halfLifeCount} half-life fits, ${normalizedCount} fold-changes computed.`,
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

    for (const m of measurements) {
      const hl = m.derivedMetrics?.find(d => d.metricType === 'half_life');
      const fc = m.derivedMetrics?.find(d => d.metricType === 'fold_change');
      if (hl?.value != null) halfLives.push({ value: hl.value, r2: hl.goodnessOfFit, measurement: m });
      if (fc?.value != null) foldChanges.push({ value: fc.value, measurement: m });
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

    res.json({
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
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
