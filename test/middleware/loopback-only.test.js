const test = require('tape')
const supertest = require('supertest')
const express = require('express')

// Create a test router that uses loopback-only middleware
const loopbackOnly = require('../../middleware/loopback-only')

const app = express()
app.use(express.json())

// Test endpoint protected by loopback-only middleware
app.post('/test', loopbackOnly, (req, res) => {
  res.json({ success: true })
})

test('loopback-only middleware - allows localhost IPv4', async (t) => {
  const res = await supertest(app)
    .post('/test')
    .set('X-Forwarded-For', '127.0.0.1')
    .expect(200)

  t.equal(res.body.success, true)
  t.end()
})

test('loopback-only middleware - allows localhost IPv6', async (t) => {
  const res = await supertest(app)
    .post('/test')
    .set('X-Forwarded-For', '::1')
    .expect(200)

  t.equal(res.body.success, true)
  t.end()
})

test('loopback-only middleware - rejects non-loopback without secret', async (t) => {
  // Temporarily unset CRON_SECRET to test loopback-only behavior
  const originalSecret = process.env.CRON_SECRET
  delete process.env.CRON_SECRET

  // Reload config to pick up env change
  delete require.cache[require.resolve('../../config')]

  const res = await supertest(app)
    .post('/test')
    .set('X-Forwarded-For', '192.168.1.1')
    .expect(403)

  t.equal(
    res.body.error,
    'Forbidden: Internal endpoints only accept loopback connections',
  )

  // Restore original secret
  if (originalSecret) {
    process.env.CRON_SECRET = originalSecret
  }
  delete require.cache[require.resolve('../../config')]
  t.end()
})

test('loopback-only middleware - allows non-loopback with valid secret', async (t) => {
  const testSecret = 'test-secret-123'
  process.env.CRON_SECRET = testSecret

  // Reload config to pick up env change
  delete require.cache[require.resolve('../../config')]

  const res = await supertest(app)
    .post('/test')
    .set('X-Forwarded-For', '192.168.1.1')
    .set('X-Cron-Secret', testSecret)
    .expect(200)

  t.equal(res.body.success, true)

  delete process.env.CRON_SECRET
  delete require.cache[require.resolve('../../config')]
  t.end()
})

test('loopback-only middleware - rejects non-loopback with invalid secret', async (t) => {
  const testSecret = 'test-secret-123'
  process.env.CRON_SECRET = testSecret

  // Reload config to pick up env change
  delete require.cache[require.resolve('../../config')]

  const res = await supertest(app)
    .post('/test')
    .set('X-Forwarded-For', '192.168.1.1')
    .set('X-Cron-Secret', 'wrong-secret')
    .expect(403)

  t.equal(res.body.error, 'Forbidden: Invalid or missing X-Cron-Secret header')

  delete process.env.CRON_SECRET
  delete require.cache[require.resolve('../../config')]
  t.end()
})
