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
const { errorHandler } = require('./middleware/errorHandler');

// Connect to MongoDB
connectDB();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(morgan('dev'));

const isDev = process.env.NODE_ENV !== 'production';

// In dev, reflect any origin back (127.0.0.1, localhost, any Vite port)
app.use(cors({
  origin: isDev
    ? (origin, cb) => cb(null, origin || '*')
    : (process.env.FRONTEND_URL || 'http://localhost:5173'),
  credentials: true,
}));

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

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', db: 'mongodb', timestamp: new Date().toISOString() });
});

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

module.exports = app;
