const crypto = require('crypto');
const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticate, requireRole } = require('../middleware/auth');
const { EMAIL_NORMALIZE } = require('./auth');

const router = express.Router();
router.use(authenticate);

// GET /api/users/me
router.get('/me', (req, res) => res.json({ user: req.user }));

// PATCH /api/users/me
router.patch(
  '/me',
  [body('name').optional().trim().notEmpty(), body('password').optional().isLength({ min: 8 }).withMessage('Password must be at least 8 characters')],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, password, currentPassword, institution } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (institution !== undefined) updates.institution = institution;

    try {
      if (password) {
        // Changing a password requires the current one, so a session left open on
        // someone else's machine cannot be used to take the account over.
        const me = await User.findById(req.user._id);
        if (!currentPassword || !(await me.comparePassword(currentPassword))) {
          return res.status(400).json({ error: 'Current password is incorrect' });
        }
        updates.passwordHash = await User.hashPassword(password);
      }
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

// ── Admin account management ─────────────────────────────────────────────────
// Public sign-up is closed (see routes/auth.js), so this is the only way an
// account comes into existence. The server generates the first password and
// returns it once; the admin passes it on and the user changes it in Settings.

const ROLES = ['ADMIN', 'INTERNAL_SCIENTIST', 'INTERNAL_PROJECT_LEAD', 'EXTERNAL_CUSTOMER'];
const TIERS = ['BRONZE', 'SILVER', 'GOLD'];
const tempPassword = () => crypto.randomBytes(12).toString('base64url');  // 16 chars

// POST /api/users — admin only: create an account
router.post(
  '/',
  requireRole('ADMIN'),
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('A valid email is required').normalizeEmail(EMAIL_NORMALIZE),
    body('role').optional().isIn(ROLES),
    body('tier').optional().isIn(TIERS),
    body('institution').optional().trim(),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, email, role = 'EXTERNAL_CUSTOMER', tier = 'BRONZE', institution } = req.body;
    try {
      if (await User.findOne({ email })) {
        return res.status(409).json({ error: 'An account with that email already exists' });
      }
      const password = tempPassword();
      const user = await User.create({
        name, email, role, tier, institution,
        // New accounts join the creating admin's organisation by default.
        org: req.user.org,
        passwordHash: await User.hashPassword(password),
      });
      res.status(201).json({ user, temporaryPassword: password });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/users/:id/active — admin only: enable or disable an account
router.patch('/:id/active', requireRole('ADMIN'), async (req, res, next) => {
  const isActive = req.body.isActive === true;
  if (!isActive && String(req.params.id) === String(req.user._id)) {
    return res.status(400).json({ error: 'You cannot disable your own account' });
  }
  try {
    // Disabling also ends every open session; the auth middleware rejects the
    // account on its next request either way.
    const update = isActive ? { isActive } : { isActive, refreshTokens: [] };
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true })
      .select('-passwordHash -refreshTokens');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// POST /api/users/:id/reset-password — admin only: issue a new temporary password
router.post('/:id/reset-password', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const password = tempPassword();
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { passwordHash: await User.hashPassword(password), refreshTokens: [] },
      { new: true },
    ).select('-passwordHash -refreshTokens');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user, temporaryPassword: password });
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
