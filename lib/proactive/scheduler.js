/**
 * Proactive messaging scheduler.
 * Runs periodic checks and executes jobs when their scheduled time matches.
 */

const config = require('../../config')
const { runTalkReminders, runWeeklyAnnouncement } = require('./index')

class ProactiveScheduler {
  /**
   * Create a new ProactiveScheduler.
   * @param {Object} client - Discord.js client instance
   */
  constructor(client) {
    this.client = client
    this.intervalId = null
    this.lastRuns = new Map() // Track when jobs last ran to prevent duplicates
  }

  /**
   * Start the scheduler.
   * Runs checks at the configured interval (default: every minute).
   */
  start() {
    const intervalMs = config.proactive.checkIntervalMs || 60000
    console.log(
      `[Scheduler] Starting proactive scheduler (check interval: ${intervalMs}ms)`,
    )

    // Run checks at the configured interval
    this.intervalId = setInterval(() => this.tick(), intervalMs)

    // Also check immediately on startup
    this.tick()
  }

  /**
   * Stop the scheduler.
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      console.log('[Scheduler] Stopped proactive scheduler')
    }
  }

  /**
   * Perform a single tick: check all jobs and run any that are due.
   */
  async tick() {
    // Check talk reminders (daily)
    await this.checkAndRunJob('talkReminders', {
      hour: config.proactive.remindersHour,
      minute: config.proactive.remindersMinute,
      // Runs daily (no dayOfWeek restriction)
    })

    // Check weekly announcement (weekly on configured day)
    await this.checkAndRunJob('weeklyAnnouncement', {
      hour: config.proactive.weeklyHour,
      minute: config.proactive.weeklyMinute,
      dayOfWeek: config.proactive.weeklyDayOfWeek,
    })
  }

  /**
   * Check if a job should run based on current time and schedule, and run it if so.
   * @param {string} jobName - Name of the job
   * @param {Object} schedule - Schedule configuration
   * @param {number} schedule.hour - UTC hour (0-23)
   * @param {number} schedule.minute - UTC minute (0-59)
   * @param {number} [schedule.dayOfWeek] - UTC day of week (0=Sunday, 1=Monday, ..., 6=Saturday)
   */
  async checkAndRunJob(jobName, schedule) {
    const now = new Date()
    const utcHour = now.getUTCHours()
    const utcMinute = now.getUTCMinutes()
    const utcDayOfWeek = now.getUTCDay()

    // Check if current time matches schedule
    if (utcHour !== schedule.hour) return
    if (utcMinute !== schedule.minute) return
    if (
      schedule.dayOfWeek !== undefined &&
      utcDayOfWeek !== schedule.dayOfWeek
    ) {
      return
    }

    // Check if we already ran this job in the current time window
    // Use hour-key to prevent multiple runs within the same scheduled minute
    const hourKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${utcHour}-${utcMinute}`
    const lastRun = this.lastRuns.get(jobName)
    if (lastRun === hourKey) {
      return // Already ran in this time window
    }

    // Mark as running for this time window
    this.lastRuns.set(jobName, hourKey)

    console.log(`[Scheduler] Running job: ${jobName} at ${now.toISOString()}`)

    try {
      let result
      if (jobName === 'talkReminders') {
        result = await runTalkReminders(this.client)
      } else if (jobName === 'weeklyAnnouncement') {
        result = await runWeeklyAnnouncement(this.client)
      }

      console.log(`[Scheduler] Job ${jobName} completed:`, result)
    } catch (error) {
      console.error(`[Scheduler] Job ${jobName} failed:`, error)
    }
  }

  /**
   * Get the current status of the scheduler.
   * @returns {Object} - Scheduler status
   */
  getStatus() {
    return {
      running: this.intervalId !== null,
      lastRuns: Object.fromEntries(this.lastRuns),
      config: {
        checkIntervalMs: config.proactive.checkIntervalMs || 60000,
        remindersHour: config.proactive.remindersHour,
        remindersMinute: config.proactive.remindersMinute,
        remindersEnabled: config.proactive.remindersEnabled,
        weeklyHour: config.proactive.weeklyHour,
        weeklyMinute: config.proactive.weeklyMinute,
        weeklyDayOfWeek: config.proactive.weeklyDayOfWeek,
        weeklyEnabled: config.proactive.weeklyEnabled,
      },
    }
  }
}

module.exports = { ProactiveScheduler }
