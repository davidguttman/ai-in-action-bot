const test = require('tape')
const express = require('express')
const supertest = require('supertest')
const autoCatch = require('../lib/auto-catch')

test('autoCatch - successful handler', async (t) => {
  const app = express()
  app.use('/test', autoCatch(async (req, res) => {
    await new Promise(resolve => setTimeout(resolve, 50))
    res.json({ success: true })
  }))

  const res = await supertest(app)
    .get('/test')
    .expect(200)

  t.ok(res.body.success)
  t.end()
})

test('autoCatch - error handler', async (t) => {
  const app = express()

  app.use('/test', autoCatch(async (req, res) => {
    throw new Error('Test error')
  }))

  // Error handling middleware
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ error: err.message })
  })

  const res = await supertest(app)
    .get('/test')
    .expect(500)

  t.equal(res.body.error, 'Test error')
  t.end()
})

test('autoCatch - passes through next()', async (t) => {
  const app = express()

  app.use('/test', autoCatch(async (req, res, next) => {
    next()
  }))

  app.use('/test', (req, res) => {
    res.json({ passed: true })
  })

  const res = await supertest(app)
    .get('/test')
    .expect(200)

  t.ok(res.body.passed)
  t.end()
})
