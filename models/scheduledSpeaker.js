const mongoose = require('mongoose')

const scheduledSpeakerSchema = new mongoose.Schema({
  discordUserId: {
    type: String,
    required: true,
  },
  discordUsername: {
    type: String,
    required: true,
  },
  topic: {
    type: String,
    required: true,
  },
  scheduledDate: {
    type: Date,
    required: true,
    unique: true,
  },
  bookingTimestamp: {
    type: Date,
    default: Date.now,
  },
  threadId: {
    type: String,
  },
  talkCompleted: {
    type: Boolean,
    default: false,
  },
})

const ScheduledSpeaker = mongoose.model(
  'ScheduledSpeaker',
  scheduledSpeakerSchema,
)

module.exports = ScheduledSpeaker
