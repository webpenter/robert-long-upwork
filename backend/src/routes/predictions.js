const express = require('express');
const { body, validationResult } = require('express-validator');
const Prediction = require('../models/Prediction');
const { authenticate } = require('../middleware/auth');
const { generateChatResponse } = require('../services/claudeChat');
const { runPrediction } = require('../services/predictionService');

const router = express.Router();
router.use(authenticate);

// GET /api/predictions?projectId=&status=
router.get('/', async (req, res, next) => {
  try {
    const filter = req.user.role === 'ADMIN' ? {} : { user: req.user._id };
    if (req.query.projectId) filter.project = req.query.projectId;
    if (req.query.status) filter.status = req.query.status;

    const predictions = await Prediction.find(filter)
      .select('-candidates -hotspotMap -chatMessages')
      .populate('project', 'name')
      .sort({ createdAt: -1 });

    res.json({ predictions });
  } catch (err) {
    next(err);
  }
});

// GET /api/predictions/:id
router.get('/:id', async (req, res, next) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role !== 'ADMIN') filter.user = req.user._id;

    const prediction = await Prediction.findOne(filter)
      .populate('project', 'name')
      .populate('variant', 'name');

    if (!prediction) return res.status(404).json({ error: 'Prediction not found' });

    res.json({ prediction: applyTierFilter(prediction.toJSON(), req.user.tier) });
  } catch (err) {
    next(err);
  }
});

// POST /api/predictions
router.post(
  '/',
  [
    body('fastaSequence').notEmpty().withMessage('FASTA sequence is required'),
    body('conditions').optional().isObject().withMessage('Conditions must be an object'),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { fastaSequence, conditions, projectId, variantId, proposedMutations, constraints } = req.body;
    try {
      const prediction = await Prediction.create({
        user: req.user._id,
        project: projectId || undefined,
        variant: variantId || undefined,
        fastaSequence,
        conditions,
        proposedMutations: proposedMutations || [],
        constraints: constraints || '',
        tier: req.user.tier,
        status: 'QUEUED',
      });

      // Fire-and-forget: CNN inference is <50ms, no need for a job queue
      runPrediction(prediction._id).catch(console.error);

      res.status(201).json({ prediction });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/predictions/batch — create one prediction per sequence
router.post(
  '/batch',
  [
    body('sequences').isArray({ min: 1 }).withMessage('sequences must be a non-empty array'),
    body('conditions').optional().isObject(),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { sequences, conditions, projectId } = req.body;
    if (sequences.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 sequences per batch' });
    }

    try {
      const created = [];
      for (const s of sequences) {
        // Accept either a ready FASTA string or {header, sequence}
        const fastaSequence =
          s.fastaSequence ||
          (s.header ? `>${s.header}\n${s.sequence}` : s.sequence);
        if (!fastaSequence || !String(fastaSequence).trim()) continue;

        const prediction = await Prediction.create({
          user: req.user._id,
          project: projectId || undefined,
          fastaSequence,
          conditions,
          tier: req.user.tier,
          status: 'QUEUED',
        });
        runPrediction(prediction._id).catch(console.error);
        created.push(prediction);
      }

      if (created.length === 0) {
        return res.status(400).json({ error: 'No valid sequences provided' });
      }
      res.status(201).json({ predictions: created });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/predictions/:id/chat — Gold tier only
router.post('/:id/chat', async (req, res, next) => {
  if (req.user.tier !== 'GOLD') {
    return res.status(403).json({ error: 'AI chat assistant requires Gold tier.' });
  }
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Message is required' });

  try {
    const prediction = await Prediction.findOne({ _id: req.params.id, user: req.user._id });
    if (!prediction) return res.status(404).json({ error: 'Prediction not found' });

    prediction.chatMessages.push({ role: 'user', content: message });

    const chatHistory = prediction.chatMessages.map(m => ({ role: m.role, content: m.content }));
    const reply = await generateChatResponse(prediction.toJSON(), chatHistory);

    prediction.chatMessages.push({ role: 'assistant', content: reply, citations: [] });

    await prediction.save();
    const msgs = prediction.chatMessages.slice(-2);
    res.json({ messages: msgs });
  } catch (err) {
    next(err);
  }
});

// Bronze tier: only return rank + mutation, hide science
function applyTierFilter(prediction, tier) {
  if (tier === 'BRONZE' && prediction.candidates) {
    return {
      ...prediction,
      candidates: prediction.candidates.map(({ rank, mutation, position, originalAa, substitutedAa }) => ({
        rank, mutation, position, originalAa, substitutedAa,
      })),
      hotspotMap: [],
      chatMessages: [],
    };
  }
  return prediction;
}

module.exports = router;
