/**
 * Weekly announcement job.
 * Posts upcoming schedule to the configured announcements channel.
 */

const ScheduledSpeaker = require('../../../models/scheduledSpeaker')
const config = require('../../../config')
const { getProactiveChannelId } = require('../getGuildSettings')

/**
 * Normalize a date to midnight UTC for comparison.
 * @param {Date} date - Date to normalize
 * @returns {Date} - Date normalized to midnight UTC
 */
function normalizeToMidnightUTC(date) {
  const d = new Date(date)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/**
 * Get today's date normalized to midnight UTC.
 * @returns {Date} - Today at midnight UTC
 */
function getTodayUTC() {
  return normalizeToMidnightUTC(new Date())
}

/**
 * Format upcoming talks for announcement.
 * @param {Array} talks - Array of ScheduledSpeaker documents
 * @returns {string} - Formatted message
 */
function formatUpcomingSchedule(talks) {
  if (talks.length === 0) {
    return (
      '## Upcoming Talks\n\n' +
      'No talks scheduled for this week.\n\n' +
      '**Want to volunteer to speak?** Just mention the bot and say you want to sign up! ' +
      "I'll help you pick a date and get you scheduled. We'd love to have you share your knowledge with the community! 🎤"
    )
  }

  let message = '## Upcoming Talks\n\n'
  talks.forEach((talk, index) => {
    const dateStr = talk.scheduledDate.toISOString().split('T')[0]
    message += `${index + 1}. **${dateStr}** - ${talk.discordUsername}: "${talk.topic}"\n`
  })
  return message
}

/**
 * Run the weekly announcement job.
 * @param {Object} client - Discord.js client instance
 * @returns {Promise<Object>} - Job result
 */
async function runWeeklyAnnouncementJob(client) {
  if (!config.proactive.weeklyEnabled) {
    return {
      announcement: {
        posted: false,
        error: null,
      },
      skipped: true,
      reason: 'disabled',
    }
  }

  // Get channel ID from MongoDB
  const guildId = config.discord.guildId
  const channelId = await getProactiveChannelId(guildId)

  if (!channelId) {
    return {
      announcement: {
        posted: false,
        error:
          'Proactive announcements channel not configured. Use `/set-proactive-channel` to configure.',
      },
    }
  }

  try {
    const today = getTodayUTC()
    // Calculate end of this week (7 days from today)
    const endOfWeek = new Date(today)
    endOfWeek.setUTCDate(endOfWeek.getUTCDate() + 7)

    // Get talks scheduled for this week (next 7 days)
    const thisWeekTalks = await ScheduledSpeaker.find({
      scheduledDate: { $gte: today, $lt: endOfWeek },
      talkCompleted: { $ne: true },
    }).sort({ scheduledDate: 1 })

    const message = formatUpcomingSchedule(thisWeekTalks)

    const channel = await client.channels.fetch(channelId)
    await channel.send(message)

    return {
      announcement: {
        posted: true,
        talksCount: thisWeekTalks.length,
        error: null,
      },
    }
  } catch (error) {
    return {
      announcement: {
        posted: false,
        error: error.message,
      },
    }
  }
}

module.exports = {
  runWeeklyAnnouncementJob,
}
