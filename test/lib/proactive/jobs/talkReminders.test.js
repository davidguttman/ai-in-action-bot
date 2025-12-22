const test = require('tape')
const mongoose = require('../../../../lib/mongo')
const ScheduledSpeaker = require('../../../../models/scheduledSpeaker')
const {
  runTalkRemindersJob,
} = require('../../../../lib/proactive/jobs/talkReminders')
const config = require('../../../../config')

// Mock Discord client
function createMockDiscordClient() {
  const sentMessages = []
  const users = new Map()
  const channels = new Map()

  return {
    users: {
      fetch: async (userId) => {
        if (!users.has(userId)) {
          users.set(userId, {
            id: userId,
            send: async (content) => {
              sentMessages.push({ type: 'dm', userId, content })
              return { id: 'msg-1', content }
            },
          })
        }
        return users.get(userId)
      },
    },
    channels: {
      fetch: async (channelId) => {
        if (!channels.has(channelId)) {
          channels.set(channelId, {
            id: channelId,
            send: async (content) => {
              sentMessages.push({ type: 'thread', channelId, content })
              return { id: 'msg-1', content }
            },
          })
        }
        return channels.get(channelId)
      },
    },
    getSentMessages: () => sentMessages,
    clearSentMessages: () => {
      sentMessages.length = 0
    },
  }
}

test('talk reminders job - finds talks for tomorrow (T-1)', async (t) => {
  await ScheduledSpeaker.deleteMany({})

  const client = createMockDiscordClient()
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)

  // Create a talk scheduled for tomorrow
  const talk = await ScheduledSpeaker.create({
    discordUserId: 'user-123',
    discordUsername: 'testuser',
    topic: 'Test Topic',
    scheduledDate: tomorrow,
    threadId: 'thread-123',
  })

  // Mock config to enable reminders
  const originalEnabled = config.proactive.remindersEnabled
  config.proactive.remindersEnabled = true

  const result = await runTalkRemindersJob(client)

  t.equal(result.reminders.tminus1Sent, 1)
  t.equal(result.reminders.dayOfSent, 0)
  t.equal(result.reminders.errors.length, 0)

  // Verify reminder was sent
  const sentMessages = client.getSentMessages()
  t.equal(sentMessages.length, 1)
  t.equal(sentMessages[0].type, 'dm')
  t.equal(sentMessages[0].userId, 'user-123')

  // Verify reminder timestamp was set
  const updatedTalk = await ScheduledSpeaker.findById(talk._id)
  t.ok(updatedTalk.reminders.sentTminus1At)
  t.ok(!updatedTalk.reminders.sentDayOfAt)

  // Cleanup
  await ScheduledSpeaker.deleteMany({})
  config.proactive.remindersEnabled = originalEnabled
  t.end()
})

test('talk reminders job - finds talks for today (day-of)', async (t) => {
  await ScheduledSpeaker.deleteMany({})

  const client = createMockDiscordClient()
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  // Create a talk scheduled for today
  const talk = await ScheduledSpeaker.create({
    discordUserId: 'user-456',
    discordUsername: 'testuser2',
    topic: 'Test Topic 2',
    scheduledDate: today,
    threadId: 'thread-456',
  })

  // Mock config to enable reminders
  const originalEnabled = config.proactive.remindersEnabled
  config.proactive.remindersEnabled = true

  const result = await runTalkRemindersJob(client)

  t.equal(result.reminders.tminus1Sent, 0)
  t.equal(result.reminders.dayOfSent, 1)
  t.equal(result.reminders.errors.length, 0)

  // Verify reminder was sent
  const sentMessages = client.getSentMessages()
  t.equal(sentMessages.length, 1)
  t.equal(sentMessages[0].type, 'dm')
  t.equal(sentMessages[0].userId, 'user-456')

  // Verify reminder timestamp was set
  const updatedTalk = await ScheduledSpeaker.findById(talk._id)
  t.ok(!updatedTalk.reminders.sentTminus1At)
  t.ok(updatedTalk.reminders.sentDayOfAt)

  // Cleanup
  await ScheduledSpeaker.deleteMany({})
  config.proactive.remindersEnabled = originalEnabled
  t.end()
})

test('talk reminders job - idempotency - does not send duplicate reminders', async (t) => {
  await ScheduledSpeaker.deleteMany({})

  const client = createMockDiscordClient()
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)

  // Create a talk with reminder already sent
  const talk = await ScheduledSpeaker.create({
    discordUserId: 'user-789',
    discordUsername: 'testuser3',
    topic: 'Test Topic 3',
    scheduledDate: tomorrow,
    threadId: 'thread-789',
    reminders: {
      sentTminus1At: new Date(),
    },
  })

  // Mock config to enable reminders
  const originalEnabled = config.proactive.remindersEnabled
  config.proactive.remindersEnabled = true

  const result = await runTalkRemindersJob(client)

  t.equal(result.reminders.tminus1Sent, 0)
  t.equal(result.reminders.dayOfSent, 0)
  t.equal(result.reminders.errors.length, 0)

  // Verify no messages were sent
  const sentMessages = client.getSentMessages()
  t.equal(sentMessages.length, 0)

  // Cleanup
  await ScheduledSpeaker.deleteMany({})
  config.proactive.remindersEnabled = originalEnabled
  t.end()
})

test('talk reminders job - respects disabled flag', async (t) => {
  await ScheduledSpeaker.deleteMany({})

  const client = createMockDiscordClient()

  // Mock config to disable reminders
  const originalEnabled = config.proactive.remindersEnabled
  config.proactive.remindersEnabled = false

  const result = await runTalkRemindersJob(client)

  t.equal(result.skipped, true)
  t.equal(result.reason, 'disabled')
  t.equal(result.reminders.tminus1Sent, 0)
  t.equal(result.reminders.dayOfSent, 0)

  // Cleanup
  await ScheduledSpeaker.deleteMany({})
  config.proactive.remindersEnabled = originalEnabled
  t.end()
})

test('talk reminders job - falls back to thread if DM fails', async (t) => {
  await ScheduledSpeaker.deleteMany({})

  const client = createMockDiscordClient()
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  // Create a talk scheduled for today
  const talk = await ScheduledSpeaker.create({
    discordUserId: 'user-fail',
    discordUsername: 'testuser4',
    topic: 'Test Topic 4',
    scheduledDate: today,
    threadId: 'thread-fail',
  })

  // Mock users.fetch to throw error (DM fails)
  const originalFetch = client.users.fetch
  client.users.fetch = async () => {
    throw new Error('DM failed')
  }

  // Mock config to enable reminders
  const originalEnabled = config.proactive.remindersEnabled
  config.proactive.remindersEnabled = true

  const result = await runTalkRemindersJob(client)

  t.equal(result.reminders.dayOfSent, 1)
  t.equal(result.reminders.errors.length, 0)

  // Verify message was sent to thread
  const sentMessages = client.getSentMessages()
  t.equal(sentMessages.length, 1)
  t.equal(sentMessages[0].type, 'thread')
  t.equal(sentMessages[0].channelId, 'thread-fail')

  // Verify reminder timestamp was set
  const updatedTalk = await ScheduledSpeaker.findById(talk._id)
  t.ok(updatedTalk.reminders.sentDayOfAt)

  // Restore original fetch
  client.users.fetch = originalFetch

  // Cleanup
  await ScheduledSpeaker.deleteMany({})
  config.proactive.remindersEnabled = originalEnabled
  t.end()
})
