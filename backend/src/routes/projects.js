const express = require('express');
const { body, validationResult } = require('express-validator');
const Project = require('../models/Project');
const Experiment = require('../models/Experiment');
const Prediction = require('../models/Prediction');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/projects
router.get('/', async (req, res, next) => {
  try {
    const filter = req.user.role === 'ADMIN' ? {} : { org: req.user.org };
    const projects = await Project.find(filter).sort({ createdAt: -1 });

    // Attach counts
    const withCounts = await Promise.all(
      projects.map(async (p) => {
        const [expCount, predCount] = await Promise.all([
          Experiment.countDocuments({ project: p._id }),
          Prediction.countDocuments({ project: p._id }),
        ]);
        return { ...p.toJSON(), experimentCount: expCount, predictionCount: predCount };
      })
    );

    res.json({ projects: withCounts });
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/:id
router.get('/:id', async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const experiments = await Experiment.find({ project: project._id })
      .populate('createdBy', 'name email')
      .sort({ date: -1 });

    res.json({ project, experiments });
  } catch (err) {
    next(err);
  }
});

// POST /api/projects
router.post(
  '/',
  [body('name').trim().notEmpty()],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const project = await Project.create({
        name: req.body.name,
        description: req.body.description,
        targetEnzyme: req.body.targetEnzyme,
        org: req.user.org,
        createdBy: req.user._id,
      });
      res.status(201).json({ project });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/projects/:id
router.patch('/:id', async (req, res, next) => {
  const { name, description, targetEnzyme } = req.body;
  try {
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { name, description, targetEnzyme },
      { new: true, runValidators: true }
    );
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({ project });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/projects/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await Project.findByIdAndDelete(req.params.id);
    res.json({ message: 'Project deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
