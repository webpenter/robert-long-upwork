const express = require('express');
const { body, validationResult } = require('express-validator');
const Variant = require('../models/Variant');
const Measurement = require('../models/Measurement');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/variants?projectId=&position=&from=&to=
router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.projectId) filter.project = req.query.projectId;
    if (req.query.position) filter['mutations.position'] = Number(req.query.position);
    if (req.query.from) filter['mutations.from'] = req.query.from.toUpperCase();
    if (req.query.to) filter['mutations.to'] = req.query.to.toUpperCase();

    const variants = await Variant.find(filter)
      .populate('parent', 'name')
      .sort({ createdAt: -1 });
    res.json({ variants });
  } catch (err) {
    next(err);
  }
});

// GET /api/variants/:id — full detail with all measurements
router.get('/:id', async (req, res, next) => {
  try {
    const variant = await Variant.findById(req.params.id).populate('parent', 'name fastaSequence');
    if (!variant) return res.status(404).json({ error: 'Variant not found' });

    const measurements = await Measurement.find({ variant: variant._id })
      .populate({ path: 'experiment', select: 'name date assayType' })
      .sort({ createdAt: -1 });

    res.json({ variant, measurements });
  } catch (err) {
    next(err);
  }
});

// POST /api/variants
router.post(
  '/',
  [body('projectId').notEmpty(), body('name').trim().notEmpty()],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const variant = await Variant.create({
        project: req.body.projectId,
        name: req.body.name,
        parent: req.body.parentId || undefined,
        fastaSequence: req.body.fastaSequence,
        mutations: req.body.mutations || [],
        familyAnnotation: req.body.familyAnnotation,
        structurePdbId: req.body.structurePdbId,
        structureSource: req.body.structureSource,
      });
      res.status(201).json({ variant });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/variants/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const variant = await Variant.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!variant) return res.status(404).json({ error: 'Variant not found' });
    res.json({ variant });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
