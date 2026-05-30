const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/users/me
router.get('/me', (req, res) => res.json({ user: req.user }));

// PATCH /api/users/me
router.patch(
  '/me',
  [body('name').optional().trim().notEmpty(), body('password').optional().isLength({ min: 6 })],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, password, institution } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (institution !== undefined) updates.institution = institution;
    if (password) updates.passwordHash = await User.hashPassword(password);

    try {
      const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true })
        .select('-passwordHash -refreshTokens');
      res.json({ user });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/users — admin only
router.get('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const users = await User.find().select('-passwordHash -refreshTokens').sort({ createdAt: -1 });
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/users/:id/tier — admin only
router.patch('/:id/tier', requireRole('ADMIN'), async (req, res, next) => {
  const { tier } = req.body;
  if (!['BRONZE', 'SILVER', 'GOLD'].includes(tier)) {
    return res.status(400).json({ error: 'Invalid tier' });
  }
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { tier }, { new: true })
      .select('-passwordHash -refreshTokens');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
