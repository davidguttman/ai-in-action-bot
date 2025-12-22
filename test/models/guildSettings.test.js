const test = require('tape')
const mongoose = require('../../lib/mongo')
const GuildSettings = require('../../models/guildSettings')
const {
  getGuildSettings,
  getProactiveChannelId,
} = require('../../lib/proactive/getGuildSettings')

test('guildSettings - create and update', async (t) => {
  await GuildSettings.deleteMany({})

  const guildId = 'guild-123'
  const channelId = 'channel-456'
  const userId = 'user-789'

  // Create initial settings
  const settings = await GuildSettings.create({
    guildId,
    proactiveAnnouncementsChannelId: channelId,
    updatedBy: userId,
  })

  t.equal(settings.guildId, guildId)
  t.equal(settings.proactiveAnnouncementsChannelId, channelId)
  t.equal(settings.updatedBy, userId)
  t.ok(settings.updatedAt instanceof Date)

  // Update channel ID
  const newChannelId = 'channel-789'
  settings.proactiveAnnouncementsChannelId = newChannelId
  await settings.save()

  const updated = await GuildSettings.findOne({ guildId })
  t.equal(updated.proactiveAnnouncementsChannelId, newChannelId)
  t.ok(updated.updatedAt instanceof Date)

  await GuildSettings.deleteMany({})
  t.end()
})

test('guildSettings - unique constraint on guildId', async (t) => {
  await GuildSettings.deleteMany({})

  const guildId = 'guild-unique-test'

  // Create first document
  await GuildSettings.create({
    guildId,
    proactiveAnnouncementsChannelId: 'channel-1',
  })

  // Try to create duplicate - should fail
  try {
    await GuildSettings.create({
      guildId,
      proactiveAnnouncementsChannelId: 'channel-2',
    })
    t.fail('Should have thrown error for duplicate guildId')
  } catch (err) {
    t.ok(
      err.message.includes('duplicate key') || err.message.includes('E11000'),
      'Should throw duplicate key error',
    )
  }

  await GuildSettings.deleteMany({})
  t.end()
})

test('guildSettings - query by guildId', async (t) => {
  await GuildSettings.deleteMany({})

  const guildId1 = 'guild-1'
  const guildId2 = 'guild-2'

  await GuildSettings.create({
    guildId: guildId1,
    proactiveAnnouncementsChannelId: 'channel-1',
  })

  await GuildSettings.create({
    guildId: guildId2,
    proactiveAnnouncementsChannelId: 'channel-2',
  })

  const found1 = await GuildSettings.findOne({ guildId: guildId1 })
  t.equal(found1.guildId, guildId1)
  t.equal(found1.proactiveAnnouncementsChannelId, 'channel-1')

  const found2 = await GuildSettings.findOne({ guildId: guildId2 })
  t.equal(found2.guildId, guildId2)
  t.equal(found2.proactiveAnnouncementsChannelId, 'channel-2')

  await GuildSettings.deleteMany({})
  t.end()
})

test('getGuildSettings - returns settings when found', async (t) => {
  await GuildSettings.deleteMany({})

  const guildId = 'guild-get-test'
  const channelId = 'channel-get-test'

  await GuildSettings.create({
    guildId,
    proactiveAnnouncementsChannelId: channelId,
  })

  const settings = await getGuildSettings(guildId)
  t.ok(settings)
  t.equal(settings.guildId, guildId)
  t.equal(settings.proactiveAnnouncementsChannelId, channelId)

  await GuildSettings.deleteMany({})
  t.end()
})

test('getGuildSettings - returns null when not found', async (t) => {
  await GuildSettings.deleteMany({})

  const settings = await getGuildSettings('non-existent-guild')
  t.equal(settings, null)

  t.end()
})

test('getGuildSettings - returns null for null/undefined guildId', async (t) => {
  const settings1 = await getGuildSettings(null)
  t.equal(settings1, null)

  const settings2 = await getGuildSettings(undefined)
  t.equal(settings2, null)

  t.end()
})

test('getProactiveChannelId - returns channel ID when configured', async (t) => {
  await GuildSettings.deleteMany({})

  const guildId = 'guild-channel-test'
  const channelId = 'channel-channel-test'

  await GuildSettings.create({
    guildId,
    proactiveAnnouncementsChannelId: channelId,
  })

  const result = await getProactiveChannelId(guildId)
  t.equal(result, channelId)

  await GuildSettings.deleteMany({})
  t.end()
})

test('getProactiveChannelId - returns null when not configured', async (t) => {
  await GuildSettings.deleteMany({})

  const result = await getProactiveChannelId('non-existent-guild')
  t.equal(result, null)

  t.end()
})

test('getProactiveChannelId - returns null when channel ID not set', async (t) => {
  await GuildSettings.deleteMany({})

  const guildId = 'guild-no-channel'

  await GuildSettings.create({
    guildId,
    // proactiveAnnouncementsChannelId not set
  })

  const result = await getProactiveChannelId(guildId)
  t.equal(result, null)

  await GuildSettings.deleteMany({})
  t.end()
})
