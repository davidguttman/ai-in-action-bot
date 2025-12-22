/**
 * Talk reminders job.
 * Sends reminders to speakers for upcoming talks.
 */

const ScheduledSpeaker = require('../../../models/scheduledSpeaker')
const config = require('../../../config')

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
 * Get tomorrow's date normalized to midnight UTC.
 * @returns {Date} - Tomorrow at midnight UTC
 */
function getTomorrowUTC() {
  const tomorrow = new Date()
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  return normalizeToMidnightUTC(tomorrow)
}

/**
 * Send a DM to a user. Falls back to thread if DM fails.
 * @param {Object} client - Discord.js client
 * @param {string} userId - Discord user ID
 * @param {string} threadId - Optional thread ID for fallback
 * @param {string} content - Message content
 * @returns {Promise<boolean>} - True if sent successfully, false otherwise
 */
async function sendReminder(client, userId, threadId, content) {
  try {
    // Try DM first
    const user = await client.users.fetch(userId)
    await user.send(content)
    return true
  } catch (dmError) {
    // If DM fails and threadId exists, try thread
    if (threadId) {
      try {
        const thread = await client.channels.fetch(threadId)
        await thread.send(content)
        return true
      } catch (threadError) {
        console.error(
          `Failed to send reminder to user ${userId} via DM and thread ${threadId}:`,
          dmError.message,
          threadError.message,
        )
        return false
      }
    }
    console.error(`Failed to send reminder to user ${userId}:`, dmError.message)
    return false
  }
}

/**
 * Run the talk reminders job.
 * @param {Object} client - Discord.js client instance
 * @returns {Promise<Object>} - Job result with counts and errors
 */
async function runTalkRemindersJob(client) {
  if (!config.proactive.remindersEnabled) {
    return {
      reminders: {
        tminus1Sent: 0,
        dayOfSent: 0,
        errors: [],
      },
      skipped: true,
      reason: 'disabled',
    }
  }

  const today = getTodayUTC()
  const tomorrow = getTomorrowUTC()
  const errors = []
  let tminus1Sent = 0
  let dayOfSent = 0

  try {
    // Find talks scheduled for tomorrow that haven't received T-1 reminder
    const tomorrowTalks = await ScheduledSpeaker.find({
      scheduledDate: tomorrow,
      $or: [
        { 'reminders.sentTminus1At': { $exists: false } },
        { 'reminders.sentTminus1At': null },
      ],
    })

    // Find talks scheduled for today that haven't received day-of reminder
    const todayTalks = await ScheduledSpeaker.find({
      scheduledDate: today,
      $or: [
        { 'reminders.sentDayOfAt': { $exists: false } },
        { 'reminders.sentDayOfAt': null },
      ],
    })

    // Send T-1 reminders
    for (const talk of tomorrowTalks) {
      const content = `Hi ${talk.discordUsername}! This is a reminder that you're scheduled to speak tomorrow (${talk.scheduledDate.toISOString().split('T')[0]}) about "${talk.topic}". Looking forward to your talk!`
      const sent = await sendReminder(
        client,
        talk.discordUserId,
        talk.threadId,
        content,
      )

      if (sent) {
        talk.reminders = talk.reminders || {}
        talk.reminders.sentTminus1At = new Date()
        await talk.save()
        tminus1Sent++
      } else {
        errors.push({
          type: 'tminus1',
          talkId: talk._id,
          userId: talk.discordUserId,
          error: 'Failed to send reminder',
        })
      }
    }

    // Send day-of reminders
    for (const talk of todayTalks) {
      const content = `Hi ${talk.discordUsername}! This is a reminder that you're speaking today (${talk.scheduledDate.toISOString().split('T')[0]}) about "${talk.topic}". See you soon!`
      const sent = await sendReminder(
        client,
        talk.discordUserId,
        talk.threadId,
        content,
      )

      if (sent) {
        talk.reminders = talk.reminders || {}
        talk.reminders.sentDayOfAt = new Date()
        await talk.save()
        dayOfSent++
      } else {
        errors.push({
          type: 'dayOf',
          talkId: talk._id,
          userId: talk.discordUserId,
          error: 'Failed to send reminder',
        })
      }
    }

    return {
      reminders: {
        tminus1Sent,
        dayOfSent,
        errors,
      },
    }
  } catch (error) {
    throw new Error(`Talk reminders job failed: ${error.message}`)
  }
}

module.exports = {
  runTalkRemindersJob,
}
