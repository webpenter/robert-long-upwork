'use strict';
const express  = require('express');
const http     = require('http');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ── Generic ML-service HTTP client ───────────────────────────────────────────

function mlRequest(path, method = 'GET', body = null, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const base     = process.env.ML_SERVICE_URL || 'http://localhost:8000';
    const hostname = base.replace(/^https?:\/\//, '').split(':')[0];
    const port     = parseInt(base.split(':')[2] || '8000', 10);
    const payload  = body ? JSON.stringify(body) : null;

    const options = {
      hostname, port, path, method,
      timeout: timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          if (res.statusCode >= 400) {
            reject(new Error(data.detail || `ML service returned ${res.statusCode}`));
          } else {
            resolve(data);
          }
        } catch {
          reject(new Error('ML service returned invalid JSON'));
        }
      });
    });

    req.on('error',   (err) => reject(new Error(err.message)));
    req.on('timeout', () => { req.destroy(); reject(new Error('ML service request timed out')); });
    if (payload) req.write(payload);
    req.end();
  });
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
