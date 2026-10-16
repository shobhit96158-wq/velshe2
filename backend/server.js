
const path = require('path');

// Load backend/.env locally.
// On Vercel, configure variables through Project Settings.
require('dotenv').config({
  path: path.join(__dirname, '.env'),
});

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================
// CORS CONFIGURATION
// ============================================

const isProduction = process.env.NODE_ENV === 'production';

const defaultOrigins = isProduction
  ? []
  : [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
    ];

const configuredOrigins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set([
  ...defaultOrigins,
  ...configuredOrigins,
]);

// ============================================
// MIDDLEWARE
// ============================================

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests without an Origin header.
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      console.warn(`CORS blocked origin: ${origin}`);
      return callback(new Error('Origin is not allowed by CORS'));
    },
  }),
);

app.use(express.json({ limit: '1mb' }));

// Uploaded images are served locally only.
// Vercel deployments need persistent image storage.
if (process.env.VERCEL !== '1') {
  app.use(
    '/uploads',
    express.static(path.join(__dirname, 'uploads'), {
      dotfiles: 'deny',
      index: false,
    }),
  );
}

// ============================================
// MONGODB CONNECTION
// Connect lazily for Vercel Function requests.
// Reuse an existing connection when available.
// ============================================

let mongoConnectionPromise = null;

async function connectToMongo() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is missing from the environment');
  }

  if (mongoose.connection.readyState === 1) {
    return;
  }

  if (!mongoConnectionPromise) {
    mongoConnectionPromise = mongoose
      .connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 10000,
      })
      .then(() => {
        console.log('MongoDB connected successfully');
        console.log(`Database: ${mongoose.connection.name}`);
      })
      .catch((error) => {
        console.error('MongoDB connection failed:', error.message);
        throw error;
      })
      .finally(() => {
        mongoConnectionPromise = null;
      });
  }

  await mongoConnectionPromise;
}

// Make sure database operations have a connection.
// If MongoDB is unavailable, return a controlled error.
app.use(async (req, res, next) => {
  try {
    await connectToMongo();
    return next();
  } catch (_error) {
    return res.status(503).json({
      success: false,
      message: 'Database connection unavailable',
    });
  }
});

// ============================================
// API ROUTES
// ============================================

app.use('/api/products', require('./routes/products'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/payments', require('./routes/payments'));
// ============================================
// HEALTH CHECK
// ============================================

app.get('/api/health', (req, res) => {
  const connected = mongoose.connection.readyState === 1;

  return res.status(connected ? 200 : 503).json({
    success: connected,
    message: 'VELSHE API is running',
    database: connected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// 404 HANDLER
// ============================================

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: 'API route not found',
  });
});

// ============================================
// CENTRAL ERROR HANDLER
// ============================================

app.use((err, req, res, next) => {
  console.error('API error:', err.message);

  if (res.headersSent) {
    return next(err);
  }

  if (err.message === 'Origin is not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'This origin is not allowed to access the API',
    });
  }

  return res.status(500).json({
    success: false,
    message: 'An unexpected server error occurred',
  });
});

// ============================================
// EXPORT EXPRESS APP FOR VERCEL
// ============================================

// Vercel needs to discover the Express application.
// Do not start a persistent listener inside Vercel Functions.
module.exports = app;

// ============================================
// LOCAL DEVELOPMENT SERVER
// ============================================

async function startLocalServer() {
  await connectToMongo();

  app.listen(PORT, () => {
    console.log(`VELSHE API running at http://localhost:${PORT}`);
    console.log('Registered API routes:');
    console.log('  - GET  /api/health');
    console.log('  - /api/products');
    console.log('  - /api/admin');
    console.log('  - /api/orders');
    console.log('Environment:', isProduction ? 'production' : 'development');
    console.log('Allowed frontend origins:');

    [...allowedOrigins].forEach((origin) => {
      console.log(`  - ${origin}`);
    });
  });
}

// Only start a persistent listener when running locally.
if (require.main === module && process.env.VERCEL !== '1') {
  startLocalServer().catch((error) => {
    console.error('VELSHE API failed to start:', error.message);
    process.exitCode = 1;
  });
}
