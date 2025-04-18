function autoCatch (handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next)
    } catch (err) {
      if (!res.headersSent) {
        next(err)
      }
    }
  }
}

module.exports = autoCatch
