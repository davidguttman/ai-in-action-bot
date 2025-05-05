// lib/schedulingLogic.js
const ScheduledSpeaker = require('../models/scheduledSpeaker')

/**
 * Finds the next available Fridays that are not booked.
 * @param {number} [count=3] - The number of available Fridays to find.
 * @returns {Promise<Date[]>} - A promise that resolves to an array of available Date objects (normalized to midnight UTC).
 */
async function findAvailableFridays(count = 3) {
  const availableFridays = []
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0) // Normalize today to midnight UTC

  // Start searching from the next day
  let currentDate = new Date(today)
  currentDate.setUTCDate(currentDate.getUTCDate() + 1)

  try {
    while (availableFridays.length < count) {
      // Move to the next Friday
      const dayOfWeek = currentDate.getUTCDay() // 0 = Sunday, 5 = Friday, 6 = Saturday
      const daysUntilFriday = (5 - dayOfWeek + 7) % 7
      // If it's already Friday or later, move to *next* week's Friday unless it's Friday today (handled by starting search tomorrow)
      const daysToAdd =
        daysUntilFriday === 0 ? (dayOfWeek === 5 ? 7 : 0) : daysUntilFriday

      if (daysToAdd > 0) {
        currentDate.setUTCDate(currentDate.getUTCDate() + daysToAdd)
      }
      currentDate.setUTCHours(0, 0, 0, 0) // Ensure we check against midnight UTC

      // Check if this Friday is booked
      const existingSpeaker = await ScheduledSpeaker.findOne({
        scheduledDate: currentDate,
      }).lean() // .lean() for performance if we only need to check existence

      if (!existingSpeaker) {
        availableFridays.push(new Date(currentDate)) // Add a copy of the date
      }

      // Move to the next day to continue the search for the *next* Friday slot
      currentDate.setUTCDate(currentDate.getUTCDate() + 1)
    }
    return availableFridays
  } catch (error) {
    console.error('Error finding available Fridays:', error)
    return [] // Return empty array on error
  }
}

/**
 * Schedules a speaker for a specific date.
 * @param {object} options - Scheduling options.
 * @param {string} options.discordUserId - The Discord User ID.
 * @param {string} options.discordUsername - The Discord Username.
 * @param {string} options.topic - The speaker's topic.
 * @param {Date} options.scheduledDate - The date to schedule for.
 * @param {string} [options.threadId] - Optional Discord thread ID.
 * @returns {Promise<object|null|string>} - A promise resolving to the saved speaker document, null if date is booked, or throws an error.
 */
async function scheduleSpeaker({
  discordUserId,
  discordUsername,
  topic,
  scheduledDate,
  threadId,
}) {
  try {
    // Normalize date to midnight UTC before saving/checking
    const dateToSchedule = new Date(scheduledDate)
    dateToSchedule.setUTCHours(0, 0, 0, 0)

    const speaker = new ScheduledSpeaker({
      discordUserId,
      discordUsername,
      topic,
      scheduledDate: dateToSchedule, // Use normalized date
      threadId, // Optional
    })
    const savedSpeaker = await speaker.save()
    return savedSpeaker
  } catch (error) {
    // Check for duplicate key error (code 11000) on scheduledDate
    if (
      error.code === 11000 &&
      error.keyPattern &&
      error.keyPattern.scheduledDate
    ) {
      console.warn(
        `Attempted to book an already scheduled date: ${scheduledDate.toISOString().split('T')[0]}`,
      )
      return null // Indicate date is already booked
    }
    console.error('Error scheduling speaker:', error)
    throw error // Re-throw other errors
  }
}

/**
 * Gets the upcoming scheduled speakers.
 * @param {number} [limit=5] - The maximum number of upcoming speakers to retrieve.
 * @returns {Promise<object[]>} - A promise resolving to an array of scheduled speaker documents.
 */
async function getUpcomingSchedule(limit = 5) {
  try {
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0) // Normalize to midnight UTC

    const upcoming = await ScheduledSpeaker.find({
      scheduledDate: { $gte: today },
    })
      .sort({ scheduledDate: 1 }) // Sort by date ascending
      .limit(limit)
      .lean() // Use .lean() if you don't need Mongoose documents features downstream

    return upcoming
  } catch (error) {
    console.error('Error fetching upcoming schedule:', error)
    return [] // Return empty array on error
  }
}

/**
 * Cancels an upcoming talk for a specific user.
 * @param {string} discordUserId - The Discord User ID of the speaker wishing to cancel.
 * @returns {Promise<object|null>} - A promise resolving to the deleted speaker document, or null if no upcoming talk was found for the user.
 * @throws {Error} If there's a database error during deletion.
 */
async function cancelSpeaker(discordUserId) {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0) // Ensure we compare dates correctly

  try {
    // Find and delete the speaker's *upcoming* scheduled talk
    const deletedSpeaker = await ScheduledSpeaker.findOneAndDelete({
      discordUserId: discordUserId,
      scheduledDate: { $gte: today }, // Only allow cancelling future talks
    }).lean() // .lean() returns a plain JS object, good if we just need the data

    if (deletedSpeaker) {
      console.log(
        `Cancelled talk for user ${discordUserId} on ${deletedSpeaker.scheduledDate}`,
      )
    } else {
      console.log(`No upcoming talk found to cancel for user ${discordUserId}`)
    }
    return deletedSpeaker // Will be null if nothing was found/deleted
  } catch (error) {
    console.error(`Error cancelling talk for user ${discordUserId}:`, error)
    throw error // Re-throw the error to be handled by the caller
  }
}

module.exports = {
  findAvailableFridays,
  scheduleSpeaker,
  getUpcomingSchedule,
  cancelSpeaker,
}
