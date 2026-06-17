'use strict';
const express  = require('express');
const { mlFetch } = require('../services/mlClient');
const Project  = require('../models/Project');
const Experiment = require('../models/Experiment');
const Variant  = require('../models/Variant');
const Prediction = require('../models/Prediction');
const Measurement = require('../models/Measurement');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ── Lightweight proxy to ML service (3 s timeout, never throws) ─────────────

function fetchML(path) {
  return mlFetch(path, { timeoutMs: 3000 }).catch(() => null);
}

// ── GET /api/dashboard/stats ─────────────────────────────────────────────────

router.get('/stats', async (req, res, next) => {
  try {
    const isAdmin   = req.user.role === 'ADMIN';
    const predFilter = isAdmin ? {} : { user: req.user._id };

    const [
      projectCount,
      experimentCount,
      variantCount,
      measurementCount,
      predTotal,
      predCompleted,
      predFailed,
      predActive,
      assayAgg,
      mutationsAgg,
      recentPredictions,
      recentExperiments,
      mlHealth,
      mlInfo,
    ] = await Promise.all([
      Project.countDocuments(),
      Experiment.countDocuments(),
      Variant.countDocuments(),
      Measurement.countDocuments(),
      Prediction.countDocuments(predFilter),
      Prediction.countDocuments({ ...predFilter, status: 'COMPLETED' }),
      Prediction.countDocuments({ ...predFilter, status: 'FAILED' }),
      Prediction.countDocuments({ ...predFilter, status: { $in: ['QUEUED', 'RUNNING'] } }),
      Experiment.aggregate([
        { $group: { _id: '$assayType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Prediction.aggregate([
        { $match: { ...predFilter, status: 'COMPLETED' } },
        { $group: { _id: null, total: { $sum: '$candidatesCount' } } },
      ]),
      Prediction.find(predFilter)
        .select('status fastaSequence conditions candidatesCount createdAt modelVersion tier')
        .populate('project', 'name')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Experiment.find()
        .select('name assayType date operator instrument project')
        .populate('project', 'name')
        .sort({ date: -1, createdAt: -1 })
        .limit(5)
        .lean(),
      fetchML('/health'),
      fetchML('/model/info'),
    ]);

    res.json({
      counts: {
        projects:          projectCount,
        experiments:       experimentCount,
        variants:          variantCount,
        measurements:      measurementCount,
        mutationsAnalyzed: mutationsAgg[0]?.total || 0,
        predictions: {
          total:     predTotal,
          completed: predCompleted,
          failed:    predFailed,
          active:    predActive,
        },
      },
      assayBreakdown: Object.fromEntries(
        assayAgg.map(({ _id, count }) => [_id, count])
      ),
      recentPredictions,
      recentExperiments,
      mlService: {
        online:     mlHealth?.status === 'ok',
        modelReady: mlHealth?.modelReady ?? false,
        ...(mlInfo ?? {}),
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
