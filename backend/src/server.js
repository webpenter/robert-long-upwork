require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const connectDB = require('./db');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const projectRoutes = require('./routes/projects');
const experimentRoutes = require('./routes/experiments');
const variantRoutes = require('./routes/variants');
const predictionRoutes = require('./routes/predictions');
const uploadRoutes = require('./routes/uploads');
const analyticsRoutes  = require('./routes/analytics');
const dashboardRoutes  = require('./routes/dashboard');
const mlRoutes         = require('./routes/ml');
const exportRoutes     = require('./routes/exports');
const { errorHandler } = require('./middleware/errorHandler');
const { startQueue } = require('./services/jobQueue');

// Connect to MongoDB
connectDB().then(() => startQueue()).catch(console.error);

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(morgan('dev'));

const isDev = process.env.NODE_ENV !== 'production';

// Production allow-list: comma-separated FRONTEND_URL entries (trailing slashes
// stripped) plus any *.vercel.app origin so Vercel preview deploys keep working.
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

function corsOrigin(origin, cb) {
  // Dev: reflect any origin (127.0.0.1, localhost, any Vite port).
  if (isDev) return cb(null, origin || '*');
  // Allow server-to-server / curl (no Origin header).
  if (!origin) return cb(null, true);
  const clean = origin.replace(/\/$/, '');
  let host = '';
  try { host = new URL(clean).hostname; } catch { /* ignore */ }
  if (allowedOrigins.includes(clean) || /\.vercel\.app$/.test(host)) {
    return cb(null, true);
  }
  return cb(new Error(`Not allowed by CORS: ${origin}`));
}

app.use(cors({ origin: corsOrigin, credentials: true }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 500 : 20,
  message: { error: 'Too many requests, please try again later.' },
  skip: () => isDev,
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/experiments', experimentRoutes);
app.use('/api/variants', variantRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/analytics',  analyticsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/ml',        mlRoutes);
app.use('/api/exports',   exportRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', db: 'mongodb', timestamp: new Date().toISOString() });
});

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

module.exports = app;
