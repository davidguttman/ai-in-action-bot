const test = require('tape')
const supertest = require('supertest')
const mongoose = require('../../lib/mongo')

// Import server but don't start it
const server = require('../../server')

test('health endpoint - successful check', async (t) => {
  const res = await supertest(server).get('/health').expect(200)

  t.equal(res.body.status, 'OK')
  t.end()
})

test('health endpoint - database error', async (t) => {
  // Mock mongoose.checkHealth to throw an error
  const originalCheckHealth = mongoose.checkHealth
  mongoose.checkHealth = () => {
    throw new Error('Database connection failed')
  }

  const res = await supertest(server).get('/health').expect(500)

  t.equal(res.body.error, 'Database connection failed')

  // Restore original checkHealth
  mongoose.checkHealth = originalCheckHealth
  t.end()
})
