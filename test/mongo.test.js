const test = require('tape')
const mongoose = require('../lib/mongo')

test('MongoDB health check', async (t) => {
  try {
    const result = await mongoose.checkHealth()
    t.ok(result.duration >= 0, 'health check returns duration')
    t.ok(result.duration < 1000, 'health check is reasonably fast')
    t.end()
  } catch (err) {
    t.error(err)
    t.end()
  }
})
