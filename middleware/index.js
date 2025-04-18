const authMiddleware = require('./auth')
const authTestMiddleware = require('./auth-test')

module.exports = process.env.NODE_ENV === 'test' ? [authTestMiddleware] : [authMiddleware]
