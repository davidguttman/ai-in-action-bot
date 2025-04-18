const test = require('tape')
const express = require('express')
const supertest = require('supertest')
const config = require('../config')
const middleware = require('../middleware')

const app = express()
app.use('/test', ...middleware, (req, res) => {
  res.json({ user: req.user })
})

test('auth middleware - no token', async (t) => {
  const res = await supertest(app)
    .get('/test')
    .expect(401)

  t.equal(res.body.error, 'No bearer token provided')
  t.end()
})

test('auth middleware - invalid token', async (t) => {
  const res = await supertest(app)
    .get('/test')
    .set('Authorization', 'Bearer invalid-token')
    .expect(401)

  t.equal(res.body.error, 'Invalid test token')
  t.end()
})

test('auth middleware - valid test token', async (t) => {
  const res = await supertest(app)
    .get('/test')
    .set('Authorization', 'Bearer test-token')
    .expect(200)

  t.equal(res.body.user.email, 'test@example.com')
  t.equal(res.body.user.id, 'test-user-id')
  t.equal(res.body.user.name, 'Test User')
  t.end()
})
