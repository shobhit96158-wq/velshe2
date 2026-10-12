
require('dotenv').config()

const express = require('express')
const cors = require('cors')

const app = express()
const PORT = process.env.PORT || 5000

const allowedOrigins = (
  process.env.CLIENT_ORIGIN || 'http://localhost:5173'
)
  .split(',')
  .map((origin) => origin.trim())

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests without a browser Origin, such as local health checks.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true)
      }

      return callback(new Error('Origin is not allowed by CORS'))
    },
  }),
)

app.use(express.json({ limit: '1mb' }))

// Basic API health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'VELSHE API is running',
    timestamp: new Date().toISOString(),
  })
})

// Return JSON for routes that do not exist.
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'API route not found',
  })
})

// Handle unexpected errors without exposing internal details.
app.use((err, req, res, next) => {
  console.error('API error:', err.message)

  if (res.headersSent) {
    return next(err)
  }

  res.status(500).json({
    success: false,
    message: 'An unexpected server error occurred',
  })
})

app.listen(PORT, () => {
  console.log(`VELSHE API running at http://localhost:${PORT}`)
  console.log(`Health check: http://localhost:${PORT}/api/health`)
})
