const test = require('tape')
const { ProactiveScheduler } = require('../../../lib/proactive/scheduler')
const config = require('../../../config')

// Mock Discord client
function createMockDiscordClient() {
  return {
    users: {
      fetch: async () => ({
        send: async () => ({ id: 'msg-1' }),
      }),
    },
    channels: {
      fetch: async () => ({
        send: async () => ({ id: 'msg-1' }),
      }),
    },
  }
}

test('scheduler - creates and starts correctly', (t) => {
  const client = createMockDiscordClient()
  const scheduler = new ProactiveScheduler(client)

  t.equal(scheduler.intervalId, null, 'interval should be null before start')
  t.equal(scheduler.client, client, 'client should be set')
  t.ok(scheduler.lastRuns instanceof Map, 'lastRuns should be a Map')
  t.end()
})

test('scheduler - start and stop', (t) => {
  const client = createMockDiscordClient()
  const scheduler = new ProactiveScheduler(client)

  scheduler.start()
  t.ok(scheduler.intervalId !== null, 'interval should be set after start')

  scheduler.stop()
  t.equal(scheduler.intervalId, null, 'interval should be null after stop')
  t.end()
})

test('scheduler - getStatus returns correct info', (t) => {
  const client = createMockDiscordClient()
  const scheduler = new ProactiveScheduler(client)

  // Before starting
  let status = scheduler.getStatus()
  t.equal(status.running, false, 'should not be running before start')
  t.deepEqual(status.lastRuns, {}, 'lastRuns should be empty')
  t.ok(status.config.checkIntervalMs, 'config should have checkIntervalMs')

  // After starting
  scheduler.start()
  status = scheduler.getStatus()
  t.equal(status.running, true, 'should be running after start')

  // Clean up
  scheduler.stop()
  t.end()
})

test('scheduler - checkAndRunJob respects schedule (wrong hour)', async (t) => {
  const client = createMockDiscordClient()
  const scheduler = new ProactiveScheduler(client)

  // Set lastRuns to track if job was called
  let jobCalled = false
  scheduler.lastRuns.set = (key, value) => {
    jobCalled = true
    Map.prototype.set.call(scheduler.lastRuns, key, value)
  }

  // Call checkAndRunJob with a schedule that doesn't match current time
  // Use hour 25 which is impossible
  await scheduler.checkAndRunJob('testJob', {
    hour: 25,
    minute: 0,
  })

  t.equal(jobCalled, false, 'job should not run when hour does not match')
  t.end()
})

test('scheduler - checkAndRunJob respects dayOfWeek', async (t) => {
  const client = createMockDiscordClient()
  const scheduler = new ProactiveScheduler(client)

  let jobCalled = false
  scheduler.lastRuns.set = (key, value) => {
    jobCalled = true
    Map.prototype.set.call(scheduler.lastRuns, key, value)
  }

  // Call checkAndRunJob with dayOfWeek that doesn't match
  // Current day is 0-6, so 7 is impossible
  const now = new Date()
  await scheduler.checkAndRunJob('testJob', {
    hour: now.getUTCHours(),
    minute: now.getUTCMinutes(),
    dayOfWeek: 7, // Impossible day
  })

  t.equal(jobCalled, false, 'job should not run when dayOfWeek does not match')
  t.end()
})

test('scheduler - checkAndRunJob prevents duplicate runs in same time window', async (t) => {
  const client = createMockDiscordClient()
  const scheduler = new ProactiveScheduler(client)

  // Disable actual jobs
  const originalRemindersEnabled = config.proactive.remindersEnabled
  const originalWeeklyEnabled = config.proactive.weeklyEnabled
  config.proactive.remindersEnabled = false
  config.proactive.weeklyEnabled = false

  const now = new Date()
  const hourKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}-${now.getUTCMinutes()}`

  // Pre-set the lastRuns to simulate already having run
  scheduler.lastRuns.set('talkReminders', hourKey)

  // Track if the job function would be called
  let setCalled = false
  const originalSet = scheduler.lastRuns.set.bind(scheduler.lastRuns)
  scheduler.lastRuns.set = (key, value) => {
    setCalled = true
    return originalSet(key, value)
  }

  await scheduler.checkAndRunJob('talkReminders', {
    hour: now.getUTCHours(),
    minute: now.getUTCMinutes(),
  })

  t.equal(
    setCalled,
    false,
    'should not attempt to run if already ran in time window',
  )

  // Restore config
  config.proactive.remindersEnabled = originalRemindersEnabled
  config.proactive.weeklyEnabled = originalWeeklyEnabled
  t.end()
})

test('scheduler - config values are exposed in getStatus', (t) => {
  const client = createMockDiscordClient()
  const scheduler = new ProactiveScheduler(client)

  const status = scheduler.getStatus()

  t.equal(
    typeof status.config.remindersHour,
    'number',
    'remindersHour should be a number',
  )
  t.equal(
    typeof status.config.remindersMinute,
    'number',
    'remindersMinute should be a number',
  )
  t.equal(
    typeof status.config.weeklyHour,
    'number',
    'weeklyHour should be a number',
  )
  t.equal(
    typeof status.config.weeklyMinute,
    'number',
    'weeklyMinute should be a number',
  )
  t.equal(
    typeof status.config.weeklyDayOfWeek,
    'number',
    'weeklyDayOfWeek should be a number',
  )
  t.equal(
    typeof status.config.remindersEnabled,
    'boolean',
    'remindersEnabled should be a boolean',
  )
  t.equal(
    typeof status.config.weeklyEnabled,
    'boolean',
    'weeklyEnabled should be a boolean',
  )
  t.end()
})
