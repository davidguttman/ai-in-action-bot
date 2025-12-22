const mongoose = require('mongoose')

const guildSettingsSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  proactiveAnnouncementsChannelId: {
    type: String,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  updatedBy: {
    type: String,
  },
})

// Update updatedAt timestamp on save
guildSettingsSchema.pre('save', function (next) {
  this.updatedAt = new Date()
  next()
})

const GuildSettings = mongoose.model('GuildSettings', guildSettingsSchema)

module.exports = GuildSettings
