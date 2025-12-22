const config = require('../config')

/**
 * Middleware that only allows requests from localhost (loopback).
 * Optionally validates X-Cron-Secret header if CRON_SECRET is configured.
 */
function loopbackOnlyMiddleware(req, res, next) {
  const remoteAddress = req.socket.remoteAddress || req.ip

  // Check if request is from loopback (127.0.0.1 or ::1)
  const isLoopback =
    remoteAddress === '127.0.0.1' ||
    remoteAddress === '::1' ||
    remoteAddress === '::ffff:127.0.0.1' ||
    remoteAddress?.startsWith('127.0.0.1') ||
    remoteAddress?.startsWith('::1')

  if (!isLoopback) {
    // If not loopback, require CRON_SECRET header
    if (config.proactive.cronSecret) {
      const providedSecret = req.headers['x-cron-secret']
      if (providedSecret !== config.proactive.cronSecret) {
        return res.status(403).json({
          error: 'Forbidden: Invalid or missing X-Cron-Secret header',
        })
      }
    } else {
      // No secret configured and not loopback - reject
      return res.status(403).json({
        error: 'Forbidden: Internal endpoints only accept loopback connections',
      })
    }
  }

  next()
}

module.exports = loopbackOnlyMiddleware
