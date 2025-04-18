const config = require('../config')

function authTestMiddleware (req, res, next) {
  // In test environment, we'll use a predictable test user
  const testUser = {
    email: 'test@example.com',
    id: 'test-user-id',
    name: 'Test User'
  }

  // Verify the test token format
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No bearer token provided' })
  }

  const token = authHeader.split(' ')[1]
  if (token !== 'test-token') {
    return res.status(401).json({ error: 'Invalid test token' })
  }

  // Add test user to request
  req.user = testUser
  next()
}

module.exports = authTestMiddleware
