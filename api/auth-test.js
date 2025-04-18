const express = require('express')
const router = express.Router()
const authMiddleware = require('../middleware/auth')
const autoCatch = require('../lib/auto-catch')

// TODO: Remove this route before production
router.get('/authTest', authMiddleware, autoCatch(async (req, res) => {
  // Simulate some async operation
  await new Promise(resolve => setTimeout(resolve, 100))

  res.json({
    message: 'Auth successful',
    user: req.user
  })
}))

// Example of error handling
router.get('/errorTest', authMiddleware, autoCatch(async (req, res) => {
  throw new Error('Test error')
}))

module.exports = router
