const express = require('express')
const router = express.Router()
const autoCatch = require('../lib/auto-catch')
const proactive = require('../lib/proactive')
const discordClient = require('../lib/discord')

/**
 * POST /internal/proactive/check-reminders
 * Triggers the talk reminders job.
 * Returns JSON summary with counts, duration, and errors.
 */
router.post(
  '/check-reminders',
  autoCatch(async (req, res) => {
    const result = await proactive.runTalkReminders(discordClient)
    res.json(result)
  }),
)

/**
 * POST /internal/proactive/weekly-announcement
 * Triggers the weekly schedule announcement job.
 * Returns JSON summary with counts, duration, and errors.
 */
router.post(
  '/weekly-announcement',
  autoCatch(async (req, res) => {
    const result = await proactive.runWeeklyAnnouncement(discordClient)
    res.json(result)
  }),
)

module.exports = router
