#!/usr/bin/env node
/* Test proactive messaging using the chat simulation client (no Discord required). */
const mongoose = require('mongoose')
const { ChatClient } = require('../lib/chat-sim/client')
const { User } = require('../lib/chat-sim/entities')
const config = require('../config')
const proactive = require('../lib/proactive')
const GuildSettings = require('../models/guildSettings')

// Connect to MongoDB directly (avoid deasync dependency)
async function connectMongo() {
  try {
    await mongoose.connect(config.mongoUri)
    console.log('✓ Connected to MongoDB')
  } catch (error) {
    console.error('MongoDB connection error:', error)
    process.exit(1)
  }
}

// Extend ChatClient to support proactive messaging methods
class ProactiveTestClient extends ChatClient {
  constructor(options) {
    super(options)
    // Track DMs sent to users
    this.dmMessages = new Map()
    // Track channel messages
    this.channelMessages = new Map()

    // Store original channels Map
    this._channelsMap = this.channels

    // Override users getter to add send() method for DMs
    const self = this
    Object.defineProperty(this, 'users', {
      get() {
        return {
          fetch: async (userId) => {
            const user = await self._users.get(userId)
            if (!user) {
              throw new Error(`User ${userId} not found`)
            }
            // Add send method for DMs if not already added
            if (!user.send) {
              user.send = async (content) => {
                if (!self.dmMessages.has(userId)) {
                  self.dmMessages.set(userId, [])
                }
                self.dmMessages.get(userId).push({
                  content,
                  timestamp: new Date(),
                })
                console.log(
                  `\x1b[35m[DM to @${user.username}]\x1b[0m ${content}`,
                )
                return { id: `dm-${Date.now()}`, content }
              }
            }
            return user
          },
        }
      },
      configurable: true,
    })

    // Add channels.fetch method for Discord.js compatibility
    const channelsMap = this._channelsMap
    Object.defineProperty(this, 'channels', {
      get() {
        const self = this
        const fetchMethod = async (channelId) => {
          // Check if it's a known channel
          let channel = channelsMap.get(channelId)
          if (channel) {
            // Override send to track messages if not already done
            if (!channel._sendTracked) {
              const originalSend = channel.send.bind(channel)
              channel.send = async (content) => {
                if (!self.channelMessages.has(channelId)) {
                  self.channelMessages.set(channelId, [])
                }
                self.channelMessages.get(channelId).push({
                  content,
                  timestamp: new Date(),
                })
                console.log(
                  `\x1b[36m[Channel #${channel.name}]\x1b[0m\n${content}`,
                )
                return originalSend(content)
              }
              channel._sendTracked = true
            }
            return channel
          }
          // Create a virtual channel for announcements if it doesn't exist
          const virtualChannel = self.createTextChannel({
            id: channelId,
            name: 'announcements',
          })
          // Override send to track messages
          const originalSend = virtualChannel.send.bind(virtualChannel)
          virtualChannel.send = async (content) => {
            if (!self.channelMessages.has(channelId)) {
              self.channelMessages.set(channelId, [])
            }
            self.channelMessages.get(channelId).push({
              content,
              timestamp: new Date(),
            })
            console.log(`\x1b[36m[Channel #announcements]\x1b[0m\n${content}`)
            return originalSend(content)
          }
          virtualChannel._sendTracked = true
          return virtualChannel
        }
        // Return object that has both Map methods and fetch
        return Object.assign(channelsMap, { fetch: fetchMethod })
      },
      configurable: true,
    })
  }

  // Helper to get all DMs sent to a user
  getDMsForUser(userId) {
    return this.dmMessages.get(userId) || []
  }

  // Helper to get all messages sent to a channel
  getChannelMessages(channelId) {
    return this.channelMessages.get(channelId) || []
  }

  // Helper to clear all messages (for testing)
  clearMessages() {
    this.dmMessages.clear()
    this.channelMessages.clear()
  }
}

async function main() {
  // Connect to MongoDB first
  await connectMongo()

  const guildId = (config.discord && config.discord.guildId) || 'guild-1'
  const client = new ProactiveTestClient({
    guildId,
    botId: 'bot-1',
    botName: 'bot',
  })

  // Create test users
  const testUser1 = client.ensureUser('alice')
  const testUser2 = client.ensureUser('bob')

  console.log(
    '\x1b[1m=== Proactive Messaging Test (No Discord Required)\x1b[0m\n',
  )
  console.log(
    'Using chat simulation client to test proactive messaging jobs.\n',
  )

  // Set up config for testing
  const originalRemindersEnabled = config.proactive.remindersEnabled
  const originalWeeklyEnabled = config.proactive.weeklyEnabled
  const originalGuildId = config.discord.guildId

  config.proactive.remindersEnabled = true
  config.proactive.weeklyEnabled = true
  config.discord.guildId = guildId

  // Set up MongoDB channel configuration
  await GuildSettings.deleteMany({})
  await GuildSettings.create({
    guildId,
    proactiveAnnouncementsChannelId: 'announcements-channel',
  })

  try {
    // Test 1: Talk Reminders Job
    console.log('\x1b[1mTest 1: Talk Reminders Job\x1b[0m')
    console.log('─'.repeat(50))

    const ScheduledSpeaker = require('../models/scheduledSpeaker')
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)

    // Create test talks
    console.log('\nCreating test talks...')
    const talk1 = await ScheduledSpeaker.create({
      discordUserId: testUser1.id,
      discordUsername: testUser1.username,
      topic: 'Test Talk for Tomorrow',
      scheduledDate: tomorrow,
      threadId: 'thread-123',
    })
    console.log(
      `✓ Created talk: "${talk1.topic}" scheduled for ${tomorrow.toISOString().split('T')[0]}`,
    )

    const talk2 = await ScheduledSpeaker.create({
      discordUserId: testUser2.id,
      discordUsername: testUser2.username,
      topic: 'Test Talk for Today',
      scheduledDate: today,
      threadId: 'thread-456',
    })
    console.log(
      `✓ Created talk: "${talk2.topic}" scheduled for ${today.toISOString().split('T')[0]}`,
    )

    // Run reminders job
    console.log('\nRunning reminders job...')
    const remindersResult = await proactive.runTalkReminders(client)

    console.log('\nResults:')
    console.log(JSON.stringify(remindersResult, null, 2))

    // Verify DMs were sent
    console.log('\n✓ DMs sent:')
    const aliceDMs = client.getDMsForUser(testUser1.id)
    const bobDMs = client.getDMsForUser(testUser2.id)
    console.log(`  - @${testUser1.username}: ${aliceDMs.length} DM(s)`)
    console.log(`  - @${testUser2.username}: ${bobDMs.length} DM(s)`)

    // Test idempotency
    console.log('\nTesting idempotency (running job again)...')
    const remindersResult2 = await proactive.runTalkReminders(client)
    console.log(
      `✓ Reminders sent: ${remindersResult2.reminders.tminus1Sent + remindersResult2.reminders.dayOfSent} (should be 0)`,
    )

    // Test 2: Weekly Announcement Job
    console.log('\n\n\x1b[1mTest 2: Weekly Announcement Job\x1b[0m')
    console.log('─'.repeat(50))

    // Clear previous channel messages
    client.clearMessages()

    // Create additional upcoming talks
    const nextWeek = new Date(today)
    nextWeek.setUTCDate(nextWeek.getUTCDate() + 7)
    await ScheduledSpeaker.create({
      discordUserId: testUser1.id,
      discordUsername: testUser1.username,
      topic: 'Talk Next Week',
      scheduledDate: nextWeek,
    })

    console.log('\nRunning weekly announcement job (with talks)...')
    const weeklyResult = await proactive.runWeeklyAnnouncement(client)

    console.log('\nResults:')
    console.log(JSON.stringify(weeklyResult, null, 2))

    // Verify channel message was sent
    const channelMessages = client.getChannelMessages('announcements-channel')
    console.log(`\n✓ Channel messages: ${channelMessages.length}`)
    if (channelMessages.length > 0) {
      console.log('\nAnnouncement content:')
      console.log(channelMessages[0].content)
    }

    // Test 2b: Weekly Announcement with no talks THIS WEEK but talks later (CTA test)
    console.log(
      '\n\n\x1b[1mTest 2b: Weekly Announcement with No Talks This Week (CTA)\x1b[0m',
    )
    console.log('─'.repeat(50))

    // Delete talks from this week but keep future talks
    const endOfWeek = new Date(today)
    endOfWeek.setUTCDate(endOfWeek.getUTCDate() + 7)
    await ScheduledSpeaker.deleteMany({
      scheduledDate: { $gte: today, $lt: endOfWeek },
      talkCompleted: { $ne: true },
    })
    client.clearMessages()

    console.log(
      '\nRunning weekly announcement job (no talks this week, but talks later)...',
    )
    const weeklyResultEmpty = await proactive.runWeeklyAnnouncement(client)

    console.log('\nResults:')
    console.log(JSON.stringify(weeklyResultEmpty, null, 2))

    // Verify channel message was sent with CTA
    const emptyChannelMessages = client.getChannelMessages(
      'announcements-channel',
    )
    console.log(`\n✓ Channel messages: ${emptyChannelMessages.length}`)
    if (emptyChannelMessages.length > 0) {
      console.log('\nAnnouncement content (should include CTA):')
      console.log(emptyChannelMessages[0].content)
      if (emptyChannelMessages[0].content.includes('volunteer')) {
        console.log('\n✓ CTA for volunteers found!')
      }
      if (
        emptyChannelMessages[0].content.includes(
          'No talks scheduled for this week',
        )
      ) {
        console.log('\n✓ Correctly identifies no talks THIS WEEK')
      }
    }

    // Test 2c: Weekly Announcement with no talks at all (CTA test)
    console.log(
      '\n\n\x1b[1mTest 2c: Weekly Announcement with No Talks At All (CTA)\x1b[0m',
    )
    console.log('─'.repeat(50))

    // Delete all talks
    await ScheduledSpeaker.deleteMany({
      scheduledDate: { $gte: today },
      talkCompleted: { $ne: true },
    })
    client.clearMessages()

    console.log('\nRunning weekly announcement job (no talks at all)...')
    const weeklyResultNoTalks = await proactive.runWeeklyAnnouncement(client)

    console.log('\nResults:')
    console.log(JSON.stringify(weeklyResultNoTalks, null, 2))

    // Verify channel message was sent with CTA
    const noTalksMessages = client.getChannelMessages('announcements-channel')
    console.log(`\n✓ Channel messages: ${noTalksMessages.length}`)
    if (noTalksMessages.length > 0) {
      console.log('\nAnnouncement content (should include CTA):')
      console.log(noTalksMessages[0].content)
      if (noTalksMessages[0].content.includes('volunteer')) {
        console.log('\n✓ CTA for volunteers found!')
      }
    }

    // Recreate talks for remaining tests
    await ScheduledSpeaker.create({
      discordUserId: testUser1.id,
      discordUsername: testUser1.username,
      topic: 'Test Talk for Tomorrow',
      scheduledDate: tomorrow,
      threadId: 'thread-123',
    })
    await ScheduledSpeaker.create({
      discordUserId: testUser2.id,
      discordUsername: testUser2.username,
      topic: 'Test Talk for Today',
      scheduledDate: today,
      threadId: 'thread-456',
    })
    await ScheduledSpeaker.create({
      discordUserId: testUser1.id,
      discordUsername: testUser1.username,
      topic: 'Talk Next Week',
      scheduledDate: nextWeek,
    })

    // Test 3: Disabled Features
    console.log('\n\n\x1b[1mTest 3: Disabled Features\x1b[0m')
    console.log('─'.repeat(50))

    config.proactive.remindersEnabled = false
    config.proactive.weeklyEnabled = false

    const disabledReminders = await proactive.runTalkReminders(client)
    const disabledWeekly = await proactive.runWeeklyAnnouncement(client)

    console.log('\nReminders (disabled):')
    console.log(JSON.stringify(disabledReminders, null, 2))
    console.log('\nWeekly (disabled):')
    console.log(JSON.stringify(disabledWeekly, null, 2))

    // Cleanup
    console.log('\n\n\x1b[1mCleanup\x1b[0m')
    console.log('─'.repeat(50))
    await ScheduledSpeaker.deleteMany({
      topic: {
        $in: [
          'Test Talk for Tomorrow',
          'Test Talk for Today',
          'Talk Next Week',
        ],
      },
    })
    console.log('✓ Test talks deleted')

    console.log('\n\x1b[32m✓ All tests completed!\x1b[0m\n')
  } catch (error) {
    console.error('\n\x1b[31m✗ Error:\x1b[0m', error)
    process.exit(1)
  } finally {
    // Cleanup GuildSettings
    await GuildSettings.deleteMany({})

    // Restore original config
    config.proactive.remindersEnabled = originalRemindersEnabled
    config.proactive.weeklyEnabled = originalWeeklyEnabled
    config.discord.guildId = originalGuildId

    // Close MongoDB connection
    await mongoose.connection.close()
    console.log('✓ MongoDB connection closed')
  }
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
