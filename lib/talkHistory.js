const ScheduledSpeaker = require('../models/scheduledSpeaker')
const { completion } = require('./llm')

/**
 * Gets all past talks.
 * @returns {Promise<object[]>} - A promise resolving to an array of past talk documents.
 */
async function getPastTalks() {
  try {
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0) // Normalize to midnight UTC

    return ScheduledSpeaker.find({
      $or: [{ scheduledDate: { $lt: today } }, { talkCompleted: true }],
    }).lean()
  } catch (error) {
    console.error('Error fetching past talks:', error)
    return [] // Return empty array on error
  }
}

/**
 * Checks if a specific topic has been covered in past talks.
 * @param {string} queryTopic - The topic to check.
 * @returns {Promise<boolean>} - A promise resolving to true if the topic has been covered, false otherwise.
 */
async function hasTopicBeenCovered(queryTopic) {
  try {
    const pastTalks = await getPastTalks()

    if (pastTalks.length === 0) return false

    const topicsForLLM = pastTalks.map((talk) => talk.topic).join('\n')

    const systemMessage = `You are an assistant helping determine if a specific topic has been covered in past talks. 
Given a list of past talk topics and a query topic, determine if the query topic is similar to any past topic.
Respond with ONLY 'yes' if the topic has been covered or 'no' if it hasn't.`

    const prompt = `Past talk topics:\n${topicsForLLM}\n\nQuery topic: ${queryTopic}`

    const response = await completion({
      systemMessage,
      prompt,
      maxTokens: 10,
    })

    return response.trim().toLowerCase() === 'yes'
  } catch (error) {
    console.error('Error checking if topic has been covered:', error)
    return false // Assume not covered on error
  }
}

/**
 * Finds talks related to a specific topic.
 * @param {string} queryTopic - The topic to find related talks for.
 * @returns {Promise<object[]>} - A promise resolving to an array of related talk documents.
 */
async function findRelatedTalks(queryTopic) {
  try {
    const pastTalks = await getPastTalks()

    if (pastTalks.length === 0) return []

    const talksForLLM = pastTalks
      .map((talk) => {
        const dateStr = talk.scheduledDate
          ? talk.scheduledDate.toISOString()
          : 'unknown date'
        return `ID: ${talk._id}, Topic: ${talk.topic}, Speaker: ${talk.discordUsername || 'unknown'}, Date: ${dateStr}`
      })
      .join('\n')

    const systemMessage = `You are an assistant helping find talks related to a specific topic.
Given a list of past talks and a query topic, return the IDs of talks that are related to the query topic.
Respond with ONLY a comma-separated list of IDs (e.g., "ID1,ID2,ID3") or "none" if no talks are related.`

    const prompt = `Past talks:\n${talksForLLM}\n\nQuery topic: ${queryTopic}`

    const response = await completion({
      systemMessage,
      prompt,
      maxTokens: 100,
    })

    const relatedIds = response.trim().toLowerCase()

    if (relatedIds === 'none') return []

    const ids = relatedIds.split(',').map((id) => id.trim())
    return pastTalks.filter((talk) => ids.includes(talk._id.toString()))
  } catch (error) {
    console.error('Error finding related talks:', error)
    return [] // Return empty array on error
  }
}

module.exports = {
  getPastTalks,
  hasTopicBeenCovered,
  findRelatedTalks,
}
