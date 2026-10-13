const path = require('path');

// Load environment variables from backend/.env
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

// Allow localhost only during development.
// In production, configure the frontend using CLIENT_ORIGIN.
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
      // Requests without an Origin header include many
      // local tools and server-to-server requests.
      // CORS is not a substitute for API authentication.
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      console.warn(`CORS blocked origin: ${origin}`);

      return callback(
        new Error('Origin is not allowed by CORS')
      );
    },
  })
);

// Limit JSON request body size.
app.use(express.json({ limit: '1mb' }));

// Serve product images uploaded through the admin panel.
app.use(
  '/uploads',
  express.static(path.join(__dirname, 'uploads'), {
    dotfiles: 'deny',
    index: false,
  })
);

// ============================================
// API ROUTES
// Register all API routes before the 404 handler.
// ============================================

app.use('/api/products', require('./routes/products'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/orders', require('./routes/orders'));

// ============================================
// HEALTH CHECK
// ============================================

app.get('/api/health', (req, res) => {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  const database =
    states[mongoose.connection.readyState] || 'unknown';

  const connected = mongoose.connection.readyState === 1;

  res.status(connected ? 200 : 503).json({
    success: connected,
    message: 'VELSHE API is running',
    database,
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// 404 HANDLER
// Must remain after all registered routes.
// ============================================

app.use((req, res) => {
  res.status(404).json({
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

  res.status(500).json({
    success: false,
    message: 'An unexpected server error occurred',
  });
});

// ============================================
// START SERVER
// Connect to MongoDB before accepting requests.
// ============================================

async function startServer() {
  if (!process.env.MONGODB_URI) {
    console.error(
      'MONGODB_URI is missing from backend/.env'
    );

    process.exitCode = 1;
    return;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log('✅ MongoDB connected successfully');
    console.log(`Database: ${mongoose.connection.name}`);

    app.listen(PORT, () => {
      console.log(
        `✅ VELSHE API running at http://localhost:${PORT}`
      );

      console.log('Registered API routes:');
      console.log('  - GET  /api/health');
      console.log('  - /api/products');
      console.log('  - /api/admin');
      console.log('  - /api/orders');

      console.log('Environment:', isProduction ? 'production' : 'development');
      console.log('Allowed frontend origins:');

      if (allowedOrigins.size === 0) {
        console.warn(
          '⚠️ No frontend origins configured. Set CLIENT_ORIGIN.'
        );
      }

      [...allowedOrigins].forEach((origin) => {
        console.log(`  - ${origin}`);
      });
    });
  } catch (error) {
    console.error(
      '❌ MongoDB connection failed:',
      error.message
    );

    process.exitCode = 1;
  }
}

startServer();