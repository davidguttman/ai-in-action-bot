const config = require('../config')

function authMiddleware (req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No bearer token provided' })
  }

  const token = authHeader.split(' ')[1]
  config.auth.verify(token, (err, user) => {
    if (err) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    if (!user || !user.email) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    if (!config.whitelist.includes(user.email)) {
      return res.status(403).json({ error: 'Email not whitelisted' })
    }

    req.user = user
    next()
  })
}

module.exports = authMiddleware
