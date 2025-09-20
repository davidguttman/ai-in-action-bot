const ScheduledSpeaker = require('../models/scheduledSpeaker')
const { completion } = require('./llm')

const DEFAULT_PAGE_SIZE = 5
const MAX_PAGE_SIZE = 15

function parseDateInput(value) {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function buildPastTalkBaseQuery() {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  return {
    $or: [{ scheduledDate: { $lt: today } }, { talkCompleted: true }],
  }
}

function normalisePageSize(size) {
  if (!size || Number.isNaN(Number(size))) return DEFAULT_PAGE_SIZE
  const numeric = Math.max(1, Math.floor(Number(size)))
  return Math.min(numeric, MAX_PAGE_SIZE)
}

function normalisePage(page) {
  if (!page || Number.isNaN(Number(page))) return 1
  return Math.max(1, Math.floor(Number(page)))
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function listPastTalks({
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  startDate,
  endDate,
  direction = 'desc',
  speaker,
  topic,
} = {}) {
  const size = normalisePageSize(pageSize)
  const currentPage = normalisePage(page)
  const skip = (currentPage - 1) * size
  const from = parseDateInput(startDate)
  const to = parseDateInput(endDate)

  const conditions = [buildPastTalkBaseQuery()]
  const dateRange = {}
  if (from) dateRange.$gte = from
  if (to) dateRange.$lte = to
  if (Object.keys(dateRange).length)
    conditions.push({ scheduledDate: dateRange })
  if (speaker) {
    conditions.push({ discordUsername: new RegExp(escapeRegExp(speaker), 'i') })
  }
  if (topic) {
    conditions.push({ topic: new RegExp(escapeRegExp(topic), 'i') })
  }

  const query = conditions.length === 1 ? conditions[0] : { $and: conditions }
  const sortDirection = direction === 'asc' ? 1 : -1

  const [talks, total] = await Promise.all([
    ScheduledSpeaker.find(query)
      .sort({ scheduledDate: sortDirection, _id: sortDirection })
      .skip(skip)
      .limit(size)
      .lean(),
    ScheduledSpeaker.countDocuments(query),
  ])

  return {
    talks,
    page: currentPage,
    pageSize: size,
    total,
    hasMore: skip + talks.length < total,
    direction: sortDirection === 1 ? 'asc' : 'desc',
    startDate: from || null,
    endDate: to || null,
  }
}

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
  listPastTalks,
}
