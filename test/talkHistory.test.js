const test = require('tape')
const mongoose = require('../lib/mongo')
const ScheduledSpeaker = require('../models/scheduledSpeaker')
const mockLlm = require('./mocks/llm')
const proxyquire = require('proxyquire')
const talkHistory = proxyquire('../lib/talkHistory', {
  './llm': mockLlm,
})

function normalizeDate(date) {
  const normalized = new Date(date)
  normalized.setUTCHours(0, 0, 0, 0)
  return normalized
}

test('talkHistory - getPastTalks returns all past talks', async (t) => {
  const mockPastTalks = [
    {
      _id: '1',
      discordUserId: 'user1',
      discordUsername: 'user1',
      topic: 'Introduction to AI Agents',
      scheduledDate: normalizeDate(new Date('2023-01-01')),
      talkCompleted: true,
    },
    {
      _id: '2',
      discordUserId: 'user2',
      discordUsername: 'user2',
      topic: 'Machine Learning Basics',
      scheduledDate: normalizeDate(new Date('2023-02-01')),
      talkCompleted: true,
    },
  ]

  const originalFind = ScheduledSpeaker.find

  ScheduledSpeaker.find = () => ({
    lean: () => Promise.resolve(mockPastTalks),
  })

  try {
    const pastTalks = await talkHistory.getPastTalks()

    t.equal(pastTalks.length, 2, 'Should return 2 past talks')
    t.equal(
      pastTalks[0].topic,
      'Introduction to AI Agents',
      'First talk topic should match',
    )
    t.equal(
      pastTalks[1].topic,
      'Machine Learning Basics',
      'Second talk topic should match',
    )

    t.end()
  } finally {
    ScheduledSpeaker.find = originalFind
  }
})

test('talkHistory - hasTopicBeenCovered returns true for similar topics', async (t) => {
  const originalFind = ScheduledSpeaker.find

  ScheduledSpeaker.find = () => ({
    lean: () =>
      Promise.resolve([
        {
          _id: '1',
          topic: 'Introduction to AI Agents',
          scheduledDate: normalizeDate(new Date('2023-01-01')),
        },
      ]),
  })

  try {
    const result = await talkHistory.hasTopicBeenCovered('AI Agents')

    t.equal(result, true, 'Should return true for similar topic')

    t.end()
  } finally {
    ScheduledSpeaker.find = originalFind
  }
})

test('talkHistory - hasTopicBeenCovered returns false for unrelated topics', async (t) => {
  const originalFind = ScheduledSpeaker.find

  ScheduledSpeaker.find = () => ({
    lean: () =>
      Promise.resolve([
        {
          _id: '1',
          topic: 'Introduction to AI Agents',
          scheduledDate: normalizeDate(new Date('2023-01-01')),
        },
      ]),
  })

  try {
    const result = await talkHistory.hasTopicBeenCovered('Quantum Computing')

    t.equal(result, false, 'Should return false for unrelated topic')

    t.end()
  } finally {
    ScheduledSpeaker.find = originalFind
  }
})

test('talkHistory - findRelatedTalks returns matching talks', async (t) => {
  const mockPastTalks = [
    {
      _id: '1', // This ID matches what our mock LLM returns
      discordUserId: 'user1',
      discordUsername: 'user1',
      topic: 'Introduction to AI Agents',
      scheduledDate: normalizeDate(new Date('2023-01-01')),
    },
    {
      _id: '2',
      discordUserId: 'user2',
      discordUsername: 'user2',
      topic: 'Machine Learning Basics',
      scheduledDate: normalizeDate(new Date('2023-02-01')),
    },
  ]

  const originalFind = ScheduledSpeaker.find

  ScheduledSpeaker.find = () => ({
    lean: () => Promise.resolve(mockPastTalks),
  })

  try {
    const relatedTalks = await talkHistory.findRelatedTalks('AI Agents')

    t.equal(relatedTalks.length, 1, 'Should return 1 related talk')
    t.equal(
      relatedTalks[0].topic,
      'Introduction to AI Agents',
      'Related talk topic should match',
    )

    t.end()
  } finally {
    ScheduledSpeaker.find = originalFind
  }
})

test('talkHistory - findRelatedTalks returns empty array when no matches', async (t) => {
  const mockPastTalks = [
    {
      _id: '1',
      topic: 'Introduction to AI Agents',
    },
    {
      _id: '2',
      topic: 'Machine Learning Basics',
    },
  ]

  const originalFind = ScheduledSpeaker.find

  ScheduledSpeaker.find = () => ({
    lean: () => Promise.resolve(mockPastTalks),
  })

  try {
    const relatedTalks = await talkHistory.findRelatedTalks('Quantum Computing')

    t.deepEqual(relatedTalks, [], 'Should return empty array when no matches')

    t.end()
  } finally {
    ScheduledSpeaker.find = originalFind
  }
})
