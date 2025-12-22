/**
 * Proactive messaging module.
 * Provides job execution functions for proactive messaging features.
 */

const locks = require('./locks')
const { runTalkRemindersJob } = require('./jobs/talkReminders')
const { runWeeklyAnnouncementJob } = require('./jobs/weeklyAnnouncement')

/**
 * Run a job with locking to prevent overlapping executions.
 * @param {string} jobName - Name of the job
 * @param {Function} jobFn - Async function that runs the job
 * @returns {Promise<Object>} - Job result with status, duration, and job-specific data
 */
async function runJobWithLock(jobName, jobFn) {
  const startTime = Date.now()

  // Try to acquire lock
  if (!locks.acquireLock(jobName)) {
    const lockTime = locks.getLockTime(jobName)
    return {
      job: jobName,
      status: 'skipped',
      reason: 'already_running',
      lockAcquiredAt: lockTime,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    }
  }

  try {
    const result = await jobFn()
    return {
      job: jobName,
      status: 'success',
      duration: Date.now() - startTime,
      ...result,
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    return {
      job: jobName,
      status: 'error',
      error: error.message,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    }
  } finally {
    locks.releaseLock(jobName)
  }
}

/**
 * Run the talk reminders job.
 * @param {Object} discordClient - Discord.js client instance
 * @returns {Promise<Object>} - Job result
 */
async function runTalkReminders(discordClient) {
  return runJobWithLock('talk-reminders', () =>
    runTalkRemindersJob(discordClient),
  )
}

/**
 * Run the weekly announcement job.
 * @param {Object} discordClient - Discord.js client instance
 * @returns {Promise<Object>} - Job result
 */
async function runWeeklyAnnouncement(discordClient) {
  return runJobWithLock('weekly-announcement', () =>
    runWeeklyAnnouncementJob(discordClient),
  )
}

module.exports = {
  runTalkReminders,
  runWeeklyAnnouncement,
}
