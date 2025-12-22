const test = require('tape')
const supertest = require('supertest')
const mongoose = require('../../lib/mongo')

// Import server but don't start it
const server = require('../../server')

// Mock the proactive module to avoid Discord client dependency
const proactive = require('../../lib/proactive')
const originalRunTalkReminders = proactive.runTalkReminders
const originalRunWeeklyAnnouncement = proactive.runWeeklyAnnouncement

test('proactive internal - check-reminders endpoint - requires loopback', async (t) => {
  // Temporarily unset CRON_SECRET to test loopback-only behavior
  const originalSecret = process.env.CRON_SECRET
  delete process.env.CRON_SECRET

  // Reload config to pick up env change
  delete require.cache[require.resolve('../../config')]

  const res = await supertest(server)
    .post('/internal/proactive/check-reminders')
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

test('proactive internal - check-reminders endpoint - calls job function', async (t) => {
  // Mock the job function
  const mockResult = {
    job: 'talk-reminders',
    status: 'success',
    duration: 10,
    reminders: {
      tminus1Sent: 2,
      dayOfSent: 1,
      errors: [],
    },
    timestamp: new Date().toISOString(),
  }

  proactive.runTalkReminders = async () => mockResult

  const res = await supertest(server)
    .post('/internal/proactive/check-reminders')
    .set('X-Forwarded-For', '127.0.0.1')
    .expect(200)

  t.equal(res.body.job, 'talk-reminders')
  t.equal(res.body.status, 'success')
  t.equal(res.body.reminders.tminus1Sent, 2)
  t.equal(res.body.reminders.dayOfSent, 1)

  // Restore original function
  proactive.runTalkReminders = originalRunTalkReminders
  t.end()
})

test('proactive internal - weekly-announcement endpoint - calls job function', async (t) => {
  // Mock the job function
  const mockResult = {
    job: 'weekly-announcement',
    status: 'success',
    duration: 5,
    announcement: {
      posted: true,
      talksCount: 3,
      error: null,
    },
    timestamp: new Date().toISOString(),
  }

  proactive.runWeeklyAnnouncement = async () => mockResult

  const res = await supertest(server)
    .post('/internal/proactive/weekly-announcement')
    .set('X-Forwarded-For', '127.0.0.1')
    .expect(200)

  t.equal(res.body.job, 'weekly-announcement')
  t.equal(res.body.status, 'success')
  t.equal(res.body.announcement.posted, true)
  t.equal(res.body.announcement.talksCount, 3)

  // Restore original function
  proactive.runWeeklyAnnouncement = originalRunWeeklyAnnouncement
  t.end()
})
