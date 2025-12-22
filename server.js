const express = require('express')
const config = require('./config')
const mongoose = require('./lib/mongo')
const autoCatch = require('./lib/auto-catch')
const authTestRouter = require('./api/auth-test')
const proactiveInternalRouter = require('./api/proactive-internal')
const healthpoint = require('healthpoint')
const authMiddleware = require('./middleware')

const app = express()

// Middleware
app.use(express.json())

// Health check endpoint
app.get(
  '/health',
  healthpoint(function (callback) {
    mongoose
      .checkHealth()
      .then(() => callback(null))
      .catch((err) => callback(err))
  }),
)

// API routes
app.use('/auth', authMiddleware, authTestRouter)

// Internal proactive messaging routes (localhost-only)
app.use('/internal/proactive', proactiveInternalRouter)

// Error handling middleware
app.use((err, req, res, next) => {
  // Log error
  if (process.env.NODE_ENV !== 'test') {
    console.error('Unhandled error:', err)
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message })
  }

  // Handle other errors
  res
    .status(err.status || 500)
    .json({ error: err.message || 'Internal Server Error' })
})

module.exports = app
