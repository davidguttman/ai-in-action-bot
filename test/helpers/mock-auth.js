const config = require('../../config')

function mockAuth (req, res, next) {
  req.user = { email: config.whitelist[0] }
  next()
}

module.exports = mockAuth
