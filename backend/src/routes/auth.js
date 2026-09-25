const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Shared with routes/users.js so accounts are stored and looked up identically.
// The validator default removes dots from Gmail addresses, which made an account
// created as first.last@gmail.com unreachable at sign-in.
const EMAIL_NORMALIZE = { gmail_remove_dots: false };

const signAccess = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' });

const signRefresh = (userId) =>
  jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

const refreshExpiry = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

// POST /api/auth/register — closed.
// Accounts are created by an administrator (POST /api/users) so that every user
// has been approved by StrataBio. The route stays defined, rather than removed,
// so an old client or a direct request gets a clear answer instead of a 404.
router.post('/register', (req, res) => {
  res.status(403).json({
    error: 'Accounts are by invitation only. Please request access from the StrataBio team.',
  });
});

// POST /api/auth/login
router.post(
  '/login',
  [body('email').isEmail().normalizeEmail(EMAIL_NORMALIZE), body('password').notEmpty()],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    try {
      const user = await User.findOne({ email }).select('+passwordHash');
      if (!user || !(await user.comparePassword(password))) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      if (!user.isActive) return res.status(403).json({ error: 'Account is disabled' });

      const refreshToken = signRefresh(user._id);
      user.refreshTokens.push({ token: refreshToken, expiresAt: refreshExpiry() });
      // Keep only last 5 sessions
      if (user.refreshTokens.length > 5) user.refreshTokens.shift();
      await user.save();

      res.json({
        user,
        accessToken: signAccess(user._id),
        refreshToken,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(payload.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    // A deactivated account must not be able to mint new access tokens from a
    // refresh token it obtained while it was still active.
    if (!user.isActive) return res.status(403).json({ error: 'Account is disabled' });

    const stored = user.refreshTokens.find(
      (t) => t.token === refreshToken && t.expiresAt > new Date()
    );
    if (!stored) return res.status(401).json({ error: 'Invalid or expired refresh token' });

    // Rotate
    user.refreshTokens = user.refreshTokens.filter((t) => t.token !== refreshToken);
    const newRefresh = signRefresh(user._id);
    user.refreshTokens.push({ token: newRefresh, expiresAt: refreshExpiry() });
    await user.save();

    res.json({ accessToken: signAccess(user._id), refreshToken: newRefresh });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res, next) => {
  const { refreshToken } = req.body;
  try {
    if (refreshToken) {
      await User.findByIdAndUpdate(req.user._id, {
        $pull: { refreshTokens: { token: refreshToken } },
      });
    }
    res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
module.exports.EMAIL_NORMALIZE = EMAIL_NORMALIZE;
