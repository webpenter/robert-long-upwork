const express = require('express');
const { body, validationResult } = require('express-validator');
const Experiment = require('../models/Experiment');
const Measurement = require('../models/Measurement');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/experiments?projectId=
router.get('/', async (req, res, next) => {
  try {
    const filter = req.query.projectId ? { project: req.query.projectId } : {};
    const experiments = await Experiment.find(filter)
      .populate('createdBy', 'name email')
      .sort({ date: -1 });
    res.json({ experiments });
  } catch (err) {
    next(err);
  }
});

// GET /api/experiments/:id — full detail with measurements
router.get('/:id', async (req, res, next) => {
  try {
    const experiment = await Experiment.findById(req.params.id)
      .populate('project', 'name')
      .populate('createdBy', 'name email');
    if (!experiment) return res.status(404).json({ error: 'Experiment not found' });

    const measurements = await Measurement.find({ experiment: experiment._id })
      .populate('variant', 'name mutations');

    res.json({ experiment, measurements });
  } catch (err) {
    next(err);
  }
});

// POST /api/experiments
router.post(
  '/',
  [
    body('projectId').notEmpty(),
    body('name').trim().notEmpty(),
    body('date').isISO8601(),
    body('assayType').isIn(['THERMAL', 'PH', 'SOLVENT', 'IONIC_STRENGTH', 'OTHER']),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const experiment = await Experiment.create({
        project: req.body.projectId,
        name: req.body.name,
        date: new Date(req.body.date),
        operator: req.body.operator,
        instrument: req.body.instrument,
        assayType: req.body.assayType,
        notes: req.body.notes,
        createdBy: req.user._id,
      });
      res.status(201).json({ experiment });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/experiments/:id
router.patch('/:id', async (req, res, next) => {
  const { name, date, operator, instrument, assayType, notes } = req.body;
  try {
    const experiment = await Experiment.findByIdAndUpdate(
      req.params.id,
      { name, date: date ? new Date(date) : undefined, operator, instrument, assayType, notes },
      { new: true, runValidators: true }
    );
    if (!experiment) return res.status(404).json({ error: 'Experiment not found' });
    res.json({ experiment });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
