require('dotenv').config()
const productionize = require('productionize')

// Default configuration
const defaults = {
  port: 3000,
  mongoUri: 'mongodb://localhost:27017/example',
  googleProjectId: '',
  googleApplicationCredentials: '',
  authenticServer: '',
  whitelist: ['david@davidguttman.com'],
}

// Merge defaults with environment variables
const config = {
  ...defaults,
  port: process.env.PORT || defaults.port,
  mongoUri: process.env.MONGO_URI || defaults.mongoUri,
  googleProjectId: process.env.GOOGLE_PROJECT_ID || defaults.googleProjectId,
  googleApplicationCredentials:
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    defaults.googleApplicationCredentials,
  authenticServer: process.env.AUTHENTIC_SERVER || defaults.authenticServer,
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId: process.env.DISCORD_GUILD_ID,
    logsChannelId: process.env.DISCORD_LOGS_CHANNEL_ID,
  },
  openrouterApiKey: process.env.OPENROUTER_API_KEY,
  zoomLink: process.env.ZOOM_LINK,
  zoomPassword: process.env.ZOOM_PASSWORD,
  whitelist: (process.env.WHITELIST || defaults.whitelist.join(',')).split(','),
  proactive: {
    remindersEnabled: true,
    weeklyEnabled: true,
    cronSecret: process.env.CRON_SECRET,
    // Schedule times (UTC)
    remindersHour: 16, // 8AM Pacific
    remindersMinute: 0,
    weeklyHour: 17, // 9AM Pacific
    weeklyMinute: 0,
    weeklyDayOfWeek: 1, // Monday
    // Interval check frequency (60 seconds)
    checkIntervalMs: 60000,
  },
}

// Configure logging based on environment
const logger = productionize({
  projectId: config.googleProjectId,
  keyFilename: config.googleApplicationCredentials,
  defaultMetadata: {
    service: 'dg-node-express',
  },
})

// Configure auth
const auth = require('authentic-service')({
  server: config.authenticServer,
})

module.exports = {
  ...config,
  logger,
  auth,
}
