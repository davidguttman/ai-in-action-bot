const test = require('tape')
const mongoose = require('../../../../lib/mongo')
const ScheduledSpeaker = require('../../../../models/scheduledSpeaker')
const GuildSettings = require('../../../../models/guildSettings')
const {
  runWeeklyAnnouncementJob,
} = require('../../../../lib/proactive/jobs/weeklyAnnouncement')
const config = require('../../../../config')

// Mock Discord client
function createMockDiscordClient() {
  const channelMessages = []
  const channels = new Map()

  return {
    channels: {
      fetch: async (channelId) => {
        if (!channels.has(channelId)) {
          channels.set(channelId, {
            id: channelId,
            name: 'announcements',
            send: async (content) => {
              channelMessages.push({ channelId, content })
              return { id: 'msg-1', content }
            },
          })
        }
        return channels.get(channelId)
      },
    },
    getChannelMessages: (channelId) => {
      return channelMessages.filter((m) => m.channelId === channelId)
    },
    clearChannelMessages: () => {
      channelMessages.length = 0
    },
  }
}

test('weekly announcement - shows CTA when no talks this week but talks exist later', async (t) => {
  await ScheduledSpeaker.deleteMany({})

  const client = createMockDiscordClient()
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  // Create a talk scheduled for 2 weeks from now (beyond this week)
  const twoWeeksFromNow = new Date(today)
  twoWeeksFromNow.setUTCDate(twoWeeksFromNow.getUTCDate() + 14)

  await ScheduledSpeaker.create({
    discordUserId: 'user-123',
    discordUsername: 'testuser',
    topic: 'Talk in Two Weeks',
    scheduledDate: twoWeeksFromNow,
  })

  // Mock config
  const originalEnabled = config.proactive.weeklyEnabled
  const originalGuildId = config.discord.guildId
  config.proactive.weeklyEnabled = true
  config.discord.guildId = 'test-guild-123'

  // Set up MongoDB channel config
  await GuildSettings.deleteMany({})
  await GuildSettings.create({
    guildId: 'test-guild-123',
    proactiveAnnouncementsChannelId: 'announcements-channel',
  })

  const result = await runWeeklyAnnouncementJob(client)

  t.equal(result.announcement.posted, true)
  t.equal(
    result.announcement.talksCount,
    0,
    'Should find 0 talks for this week',
  )

  // Verify message contains CTA
  const messages = client.getChannelMessages('announcements-channel')
  t.equal(messages.length, 1)
  t.ok(
    messages[0].content.includes('Want to volunteer to speak?'),
    'Message should include CTA',
  )
  t.ok(
    messages[0].content.includes('No talks scheduled for this week'),
    'Message should indicate no talks this week',
  )

  // Cleanup
  await ScheduledSpeaker.deleteMany({})
  await GuildSettings.deleteMany({})
  config.proactive.weeklyEnabled = originalEnabled
  config.discord.guildId = originalGuildId
  t.end()
})

test('weekly announcement - shows talks when talks exist this week', async (t) => {
  await ScheduledSpeaker.deleteMany({})

  const client = createMockDiscordClient()
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  // Create a talk scheduled for 3 days from now (within this week)
  const threeDaysFromNow = new Date(today)
  threeDaysFromNow.setUTCDate(threeDaysFromNow.getUTCDate() + 3)

  await ScheduledSpeaker.create({
    discordUserId: 'user-123',
    discordUsername: 'testuser',
    topic: 'Talk This Week',
    scheduledDate: threeDaysFromNow,
  })

  // Mock config
  const originalEnabled = config.proactive.weeklyEnabled
  const originalGuildId = config.discord.guildId
  config.proactive.weeklyEnabled = true
  config.discord.guildId = 'test-guild-123'

  // Set up MongoDB channel config
  await GuildSettings.deleteMany({})
  await GuildSettings.create({
    guildId: 'test-guild-123',
    proactiveAnnouncementsChannelId: 'announcements-channel',
  })

  const result = await runWeeklyAnnouncementJob(client)

  t.equal(result.announcement.posted, true)
  t.equal(result.announcement.talksCount, 1, 'Should find 1 talk for this week')

  // Verify message shows talks (not CTA)
  const messages = client.getChannelMessages('announcements-channel')
  t.equal(messages.length, 1)
  t.ok(
    messages[0].content.includes('Upcoming Talks'),
    'Message should show upcoming talks',
  )
  t.ok(
    messages[0].content.includes('Talk This Week'),
    'Message should include talk topic',
  )
  t.ok(
    !messages[0].content.includes('Want to volunteer to speak?'),
    'Message should NOT include CTA when talks exist',
  )

  // Cleanup
  await ScheduledSpeaker.deleteMany({})
  await GuildSettings.deleteMany({})
  config.proactive.weeklyEnabled = originalEnabled
  config.discord.guildId = originalGuildId
  t.end()
})

test('weekly announcement - shows CTA when no talks at all', async (t) => {
  await ScheduledSpeaker.deleteMany({})

  const client = createMockDiscordClient()

  // Mock config
  const originalEnabled = config.proactive.weeklyEnabled
  const originalGuildId = config.discord.guildId
  config.proactive.weeklyEnabled = true
  config.discord.guildId = 'test-guild-123'

  // Set up MongoDB channel config
  await GuildSettings.deleteMany({})
  await GuildSettings.create({
    guildId: 'test-guild-123',
    proactiveAnnouncementsChannelId: 'announcements-channel',
  })

  const result = await runWeeklyAnnouncementJob(client)

  t.equal(result.announcement.posted, true)
  t.equal(result.announcement.talksCount, 0)

  // Verify message contains CTA
  const messages = client.getChannelMessages('announcements-channel')
  t.equal(messages.length, 1)
  t.ok(
    messages[0].content.includes('Want to volunteer to speak?'),
    'Message should include CTA',
  )

  // Cleanup
  await ScheduledSpeaker.deleteMany({})
  await GuildSettings.deleteMany({})
  config.proactive.weeklyEnabled = originalEnabled
  config.discord.guildId = originalGuildId
  t.end()
})

test('weekly announcement - handles missing configuration', async (t) => {
  await ScheduledSpeaker.deleteMany({})
  await GuildSettings.deleteMany({})

  const client = createMockDiscordClient()

  // Mock config
  const originalEnabled = config.proactive.weeklyEnabled
  const originalGuildId = config.discord.guildId
  config.proactive.weeklyEnabled = true
  config.discord.guildId = 'test-guild-no-config'

  // No MongoDB config and no fallback
  const result = await runWeeklyAnnouncementJob(client)

  t.equal(result.announcement.posted, false)
  t.ok(result.announcement.error.includes('not configured'))
  t.ok(result.announcement.error.includes('/set-proactive-channel'))

  // Cleanup
  await ScheduledSpeaker.deleteMany({})
  await GuildSettings.deleteMany({})
  config.proactive.weeklyEnabled = originalEnabled
  config.discord.guildId = originalGuildId
  t.end()
})
