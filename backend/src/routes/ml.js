'use strict';
const express  = require('express');
const { mlFetch } = require('../services/mlClient');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ── Generic ML-service HTTP client ───────────────────────────────────────────
// Thin wrapper over the shared HTTPS-aware client (handles hosted https URLs).

function mlRequest(path, method = 'GET', body = null, timeoutMs = 6000) {
  return mlFetch(path, { method, body, timeoutMs });
}

// ── GET /api/ml/info ──────────────────────────────────────────────────────────

router.get('/info', async (req, res) => {
  try {
    const info = await mlRequest('/model/info', 'GET', null, 6000);
    res.json(info);
  } catch (err) {
    res.status(503).json({ error: err.message, offline: true });
  }
});

// ── GET /api/ml/dataset-stats ─────────────────────────────────────────────────

router.get('/dataset-stats', async (req, res) => {
  try {
    const stats = await mlRequest('/dataset/stats', 'GET', null, 8000);
    res.json(stats);
  } catch (err) {
    res.status(503).json({ error: err.message, offline: true });
  }
});

// ── POST /api/ml/retrain  (ADMIN only) ───────────────────────────────────────
// Training subprocess can take up to 120 s; socket timeout set explicitly.

router.post('/retrain', requireRole('ADMIN'), async (req, res, next) => {
  req.socket.setTimeout(150_000);
  res.setTimeout(150_000);

  try {
    const result = await mlRequest('/train', 'POST', { fromCsv: true }, 140_000);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/ml/retrain-advanced  (ADMIN only) ───────────────────────────────
// Supports CNN, DMS, augment-DMS options. Timeout raised to 320 s.

router.post('/retrain-advanced', requireRole('ADMIN'), async (req, res, next) => {
  req.socket.setTimeout(330_000);
  res.setTimeout(330_000);

  const { fromDms = false, augmentDms = false, useCnn = false } = req.body;
  try {
    const result = await mlRequest(
      '/train', 'POST',
      { fromCsv: !fromDms && !augmentDms, fromDms, augmentDms, useCnn },
      320_000,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
