const GuildSettings = require('../../models/guildSettings')

/**
 * Get guild settings document for a given guild ID.
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<Object|null>} - GuildSettings document or null if not found
 */
async function getGuildSettings(guildId) {
  if (!guildId) {
    return null
  }
  return GuildSettings.findOne({ guildId })
}

/**
 * Get proactive announcements channel ID for a given guild.
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<string|null>} - Channel ID or null if not configured
 */
async function getProactiveChannelId(guildId) {
  const settings = await getGuildSettings(guildId)
  return settings?.proactiveAnnouncementsChannelId || null
}

module.exports = {
  getGuildSettings,
  getProactiveChannelId,
}
