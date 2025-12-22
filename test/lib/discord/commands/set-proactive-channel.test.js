const test = require('tape')
const mongoose = require('../../../../lib/mongo')
const GuildSettings = require('../../../../models/guildSettings')
const setProactiveChannelCommand = require('../../../../lib/discord/commands/set-proactive-channel')

// Mock Discord interaction
function createMockInteraction(options = {}) {
  const {
    guildId = 'test-guild-123',
    userId = 'test-user-456',
    channelId = 'test-channel-789',
    channelName = 'announcements',
    hasPermission = true,
    channelExists = true,
  } = options

  const mockChannel = {
    id: channelId,
    name: channelName,
    type: 0, // GuildText
    permissionsFor: (member) => {
      return {
        has: (permission) => hasPermission,
      }
    },
  }

  const mockGuild = {
    id: guildId,
    members: {
      fetch: async (id) => ({
        id,
        permissions: {
          has: () => hasPermission,
        },
      }),
    },
  }

  const mockClient = {
    channels: {
      fetch: async (id) => {
        if (!channelExists) {
          throw new Error('Channel not found')
        }
        return mockChannel
      },
    },
    user: {
      id: 'bot-user-id',
    },
  }

  return {
    guildId,
    user: {
      id: userId,
      tag: 'testuser#1234',
    },
    guild: mockGuild,
    client: mockClient,
    options: {
      getChannel: (name) => {
        if (name === 'channel') {
          return mockChannel
        }
        return null
      },
    },
    reply: async (options) => {
      return {
        content: options.content,
        ephemeral: options.ephemeral || false,
      }
    },
  }
}

test('set-proactive-channel - validates channel and saves to MongoDB', async (t) => {
  await GuildSettings.deleteMany({})

  const interaction = createMockInteraction({
    guildId: 'guild-save-test',
    userId: 'user-save-test',
    channelId: 'channel-save-test',
    channelName: 'announcements',
    hasPermission: true,
    channelExists: true,
  })

  const result = await setProactiveChannelCommand.execute(interaction)

  t.ok(result.content.includes('✅'))
  t.ok(result.content.includes('announcements'))
  t.equal(result.ephemeral, false)

  // Verify saved in MongoDB
  const settings = await GuildSettings.findOne({ guildId: 'guild-save-test' })
  t.ok(settings)
  t.equal(settings.proactiveAnnouncementsChannelId, 'channel-save-test')
  t.equal(settings.updatedBy, 'user-save-test')
  t.ok(settings.updatedAt instanceof Date)

  await GuildSettings.deleteMany({})
  t.end()
})

test('set-proactive-channel - handles missing permission', async (t) => {
  await GuildSettings.deleteMany({})

  const interaction = createMockInteraction({
    guildId: 'guild-perm-test',
    hasPermission: false,
  })

  const result = await setProactiveChannelCommand.execute(interaction)

  t.ok(result.content.includes('❌'))
  t.ok(result.content.includes('permission'))
  t.equal(result.ephemeral, true)

  // Verify NOT saved in MongoDB
  const settings = await GuildSettings.findOne({ guildId: 'guild-perm-test' })
  t.equal(settings, null)

  await GuildSettings.deleteMany({})
  t.end()
})

test('set-proactive-channel - handles channel not found', async (t) => {
  await GuildSettings.deleteMany({})

  const interaction = createMockInteraction({
    guildId: 'guild-notfound-test',
    channelExists: false,
  })

  const result = await setProactiveChannelCommand.execute(interaction)

  t.ok(result.content.includes('❌'))
  t.equal(result.ephemeral, true)

  // Verify NOT saved in MongoDB
  const settings = await GuildSettings.findOne({
    guildId: 'guild-notfound-test',
  })
  t.equal(settings, null)

  await GuildSettings.deleteMany({})
  t.end()
})

test('set-proactive-channel - updates existing guild settings', async (t) => {
  await GuildSettings.deleteMany({})

  const guildId = 'guild-update-test'
  const oldChannelId = 'old-channel-123'

  // Create existing settings
  await GuildSettings.create({
    guildId,
    proactiveAnnouncementsChannelId: oldChannelId,
    updatedBy: 'old-user',
  })

  const interaction = createMockInteraction({
    guildId,
    userId: 'new-user-456',
    channelId: 'new-channel-789',
    channelName: 'new-announcements',
  })

  const result = await setProactiveChannelCommand.execute(interaction)

  t.ok(result.content.includes('✅'))
  // Channel mention format may vary, just check that update succeeded
  t.ok(result.content.includes('Proactive announcements channel set'))

  // Verify updated in MongoDB
  const settings = await GuildSettings.findOne({ guildId })
  t.ok(settings)
  t.equal(settings.proactiveAnnouncementsChannelId, 'new-channel-789')
  t.equal(settings.updatedBy, 'new-user-456')
  t.notEqual(settings.proactiveAnnouncementsChannelId, oldChannelId)

  await GuildSettings.deleteMany({})
  t.end()
})
