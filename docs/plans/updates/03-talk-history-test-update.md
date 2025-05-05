# Updated Test Plan for Talk History Query Feature

This document updates the testing approach for the Talk History Query Feature (issue #3) to align with the project's existing testing conventions.

## Testing Approach

Instead of using sinon and proxyquire (which aren't used in other tests), we'll use direct function replacement for mocking, following the pattern established in existing tests like `test/api/health.test.js`.

## Modified Test File: `test/talkHistory.test.js`

```javascript
const test = require('tape')
const mongoose = require('../lib/mongo')
const ScheduledSpeaker = require('../models/scheduledSpeaker')
const { completion } = require('../lib/llm')
const talkHistory = require('../lib/talkHistory')

// Helper function to get normalized date
function normalizeDate(date) {
  const normalized = new Date(date)
  normalized.setUTCHours(0, 0, 0, 0)
  return normalized
}

test('talkHistory - getPastTalks returns all past talks', async (t) => {
  // Mock data setup
  const mockPastTalks = [
    {
      _id: '1',
      discordUserId: 'user1',
      discordUsername: 'user1',
      topic: 'Introduction to AI Agents',
      scheduledDate: normalizeDate(new Date('2023-01-01')),
      talkCompleted: true
    },
    {
      _id: '2',
      discordUserId: 'user2',
      discordUsername: 'user2',
      topic: 'Machine Learning Basics',
      scheduledDate: normalizeDate(new Date('2023-02-01')),
      talkCompleted: true
    }
  ]

  // Save original function
  const originalFind = ScheduledSpeaker.find
  
  // Replace with mock implementation
  ScheduledSpeaker.find = () => ({
    lean: () => Promise.resolve(mockPastTalks)
  })
  
  try {
    const pastTalks = await talkHistory.getPastTalks()
    
    t.equal(pastTalks.length, 2, 'Should return 2 past talks')
    t.equal(pastTalks[0].topic, 'Introduction to AI Agents', 'First talk topic should match')
    t.equal(pastTalks[1].topic, 'Machine Learning Basics', 'Second talk topic should match')
    
    t.end()
  } finally {
    // Restore original function
    ScheduledSpeaker.find = originalFind
  }
})

test('talkHistory - hasTopicBeenCovered returns true for similar topics', async (t) => {
  // Save original functions
  const originalFind = ScheduledSpeaker.find
  const originalCompletion = completion
  
  // Replace with mock implementations
  ScheduledSpeaker.find = () => ({
    lean: () => Promise.resolve([
      {
        _id: '1',
        topic: 'Introduction to AI Agents',
        scheduledDate: normalizeDate(new Date('2023-01-01'))
      }
    ])
  })
  
  // Mock the LLM response
  completion = async () => 'yes'
  
  try {
    const result = await talkHistory.hasTopicBeenCovered('AI Agents')
    
    t.equal(result, true, 'Should return true for similar topic')
    
    t.end()
  } finally {
    // Restore original functions
    ScheduledSpeaker.find = originalFind
    completion = originalCompletion
  }
})

test('talkHistory - hasTopicBeenCovered returns false for unrelated topics', async (t) => {
  // Save original functions
  const originalFind = ScheduledSpeaker.find
  const originalCompletion = completion
  
  // Replace with mock implementations
  ScheduledSpeaker.find = () => ({
    lean: () => Promise.resolve([
      {
        _id: '1',
        topic: 'Introduction to AI Agents',
        scheduledDate: normalizeDate(new Date('2023-01-01'))
      }
    ])
  })
  
  // Mock the LLM response
  completion = async () => 'no'
  
  try {
    const result = await talkHistory.hasTopicBeenCovered('Quantum Computing')
    
    t.equal(result, false, 'Should return false for unrelated topic')
    
    t.end()
  } finally {
    // Restore original functions
    ScheduledSpeaker.find = originalFind
    completion = originalCompletion
  }
})

test('talkHistory - findRelatedTalks returns matching talks', async (t) => {
  // Mock data
  const mockPastTalks = [
    {
      _id: '1',
      discordUserId: 'user1',
      discordUsername: 'user1',
      topic: 'Introduction to AI Agents',
      scheduledDate: normalizeDate(new Date('2023-01-01'))
    },
    {
      _id: '2',
      discordUserId: 'user2',
      discordUsername: 'user2',
      topic: 'Machine Learning Basics',
      scheduledDate: normalizeDate(new Date('2023-02-01'))
    }
  ]
  
  // Save original functions
  const originalFind = ScheduledSpeaker.find
  const originalCompletion = completion
  
  // Replace with mock implementations
  ScheduledSpeaker.find = () => ({
    lean: () => Promise.resolve(mockPastTalks)
  })
  
  // Mock the LLM response to return the ID of the first talk
  completion = async () => '1'
  
  try {
    const relatedTalks = await talkHistory.findRelatedTalks('AI Agents')
    
    t.equal(relatedTalks.length, 1, 'Should return 1 related talk')
    t.equal(relatedTalks[0].topic, 'Introduction to AI Agents', 'Related talk topic should match')
    
    t.end()
  } finally {
    // Restore original functions
    ScheduledSpeaker.find = originalFind
    completion = originalCompletion
  }
})

test('talkHistory - findRelatedTalks returns empty array when no matches', async (t) => {
  // Mock data
  const mockPastTalks = [
    {
      _id: '1',
      topic: 'Introduction to AI Agents',
    },
    {
      _id: '2',
      topic: 'Machine Learning Basics',
    }
  ]
  
  // Save original functions
  const originalFind = ScheduledSpeaker.find
  const originalCompletion = completion
  
  // Replace with mock implementations
  ScheduledSpeaker.find = () => ({
    lean: () => Promise.resolve(mockPastTalks)
  })
  
  // Mock the LLM response
  completion = async () => 'none'
  
  try {
    const relatedTalks = await talkHistory.findRelatedTalks('Quantum Computing')
    
    t.deepEqual(relatedTalks, [], 'Should return empty array when no matches')
    
    t.end()
  } finally {
    // Restore original functions
    ScheduledSpeaker.find = originalFind
    completion = originalCompletion
  }
})
```

## Key Differences from Original Approach

1. **Removed Dependencies**:
   - Removed sinon and proxyquire
   - No need to add new dependencies to the project

2. **Mocking Strategy**:
   - Uses direct function replacement instead of sinon stubs
   - Saves original functions and restores them in finally blocks to ensure cleanup
   - Uses the same pattern established in existing tests like `test/api/health.test.js`

3. **Test Structure**:
   - Maintains the same test cases and coverage as the original plan
   - Follows the project's existing test conventions
   - Uses tape assertions in the same way as other tests

This approach:
- Matches the project's established testing conventions
- Avoids introducing unnecessary dependencies
- Maintains the same functionality and test coverage
- Makes it easier for other developers to understand and maintain the tests
