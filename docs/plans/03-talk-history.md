# Talk History Query Feature

## Overview
This issue outlines the implementation of a feature that enables users to query information about previous talks in the AI in Action Discord bot. The feature will allow users to ask questions like "@bot has there been a talk about A2A before?" or "@bot what talks have been about agents?".

## Architecture

### Data Storage
We'll extend the existing `ScheduledSpeaker` model to track past talks rather than creating a separate collection. This approach simplifies the data model while maintaining all necessary information.

#### Model Extension
The current `scheduledSpeaker.js` model already contains the essential fields we need:
- `discordUserId` - Speaker's Discord ID
- `discordUsername` - Speaker's username
- `topic` - Talk topic
- `scheduledDate` - When the talk was scheduled
- `threadId` - Associated Discord thread

We'll add a new field to indicate if a talk has already occurred:
```javascript
talkCompleted: {
  type: Boolean,
  default: false
}
```

### Component Design
The implementation will follow a modular approach with these key components:

1. **Talk History Repository** - Responsible for retrieving talk data from MongoDB
2. **Talk Query Processor** - Uses LLM to match user queries with relevant talks
3. **Discord Intent Handler** - Detects and routes talk history queries
4. **Response Formatter** - Formats matched talks into user-friendly responses

## Implementation Steps

### 1. Extend the ScheduledSpeaker Model
Update the model to include the `talkCompleted` field and any other metadata needed.

### 2. Create Talk History Module
Implement a new module (`lib/talkHistory.js`) with functions for:
- Retrieving all past talks
- Finding talks by topic similarity
- Checking if specific topics have been covered

### 3. Add Query Intent Detection
Extend the LLM intent detection in `lib/discord/index.js` to recognize talk history queries.

### 4. Implement LLM-Based Talk Matching
Create a function in the LLM module to match user queries with relevant talks.

### 5. Add Response Handling
Implement response formatting for different query types.

### 6. Add Unit Tests
Create tests for each component to ensure independent testability.

## File Modifications

### 1. `models/scheduledSpeaker.js`
```javascript
// Add talkCompleted field
talkCompleted: {
  type: Boolean,
  default: false
}
```

### 2. Create `lib/talkHistory.js`
```javascript
const ScheduledSpeaker = require('../models/scheduledSpeaker')
const { completion } = require('./llm')

// Get all past talks
async function getPastTalks() {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  
  return ScheduledSpeaker.find({
    $or: [
      { scheduledDate: { $lt: today } },
      { talkCompleted: true }
    ]
  }).lean()
}

// Check if a specific topic has been covered
async function hasTopicBeenCovered(queryTopic) {
  const pastTalks = await getPastTalks()
  
  if (pastTalks.length === 0) return false
  
  // Use LLM to check topic similarity
  const topicsForLLM = pastTalks.map(talk => talk.topic).join('\n')
  
  const systemMessage = `You are an assistant helping determine if a specific topic has been covered in past talks. 
Given a list of past talk topics and a query topic, determine if the query topic is similar to any past topic.
Respond with ONLY 'yes' if the topic has been covered or 'no' if it hasn't.`
  
  const prompt = `Past talk topics:\n${topicsForLLM}\n\nQuery topic: ${queryTopic}`
  
  const response = await completion({
    systemMessage,
    prompt,
    maxTokens: 10
  })
  
  return response.trim().toLowerCase() === 'yes'
}

// Find talks related to a topic
async function findRelatedTalks(queryTopic) {
  const pastTalks = await getPastTalks()
  
  if (pastTalks.length === 0) return []
  
  // Use LLM to find related talks
  const talksForLLM = pastTalks.map(talk => 
    `ID: ${talk._id}, Topic: ${talk.topic}, Speaker: ${talk.discordUsername}, Date: ${talk.scheduledDate.toISOString()}`
  ).join('\n')
  
  const systemMessage = `You are an assistant helping find talks related to a specific topic.
Given a list of past talks and a query topic, return the IDs of talks that are related to the query topic.
Respond with ONLY a comma-separated list of IDs (e.g., "ID1,ID2,ID3") or "none" if no talks are related.`
  
  const prompt = `Past talks:\n${talksForLLM}\n\nQuery topic: ${queryTopic}`
  
  const response = await completion({
    systemMessage,
    prompt,
    maxTokens: 100
  })
  
  const relatedIds = response.trim().toLowerCase()
  
  if (relatedIds === 'none') return []
  
  // Filter talks by the IDs returned by the LLM
  const ids = relatedIds.split(',').map(id => id.trim())
  return pastTalks.filter(talk => ids.includes(talk._id.toString()))
}

module.exports = {
  getPastTalks,
  hasTopicBeenCovered,
  findRelatedTalks
}
```

### 3. Update `lib/discord/index.js`
Add a new intent for talk queries in the intent detection system:

```javascript
// In the intentSystemMessage string, add:
"- Classify as 'query_talks' if the user is asking about past talks, previous topics, or if specific topics have been covered before.\n"

// Add a new handler for the 'query_talks' intent
else if (detectedIntent === 'query_talks') {
  console.log('Query talks intent detected.')
  try {
    const talkHistory = require('../talkHistory')
    
    // Use LLM to determine query type
    const queryTypeSystemMessage = "You are an assistant classifying talk history queries. Possible types are 'existence_check' (asking if a topic has been covered), 'list_talks' (asking for talks about a topic), or 'other'. Respond with ONLY the query type followed by the topic in question, e.g., 'existence_check: AI agents' or 'list_talks: machine learning'."
    
    const queryTypeResponse = await completion({
      systemMessage: queryTypeSystemMessage,
      prompt: userMessageContent
    })
    
    const [queryType, topic] = queryTypeResponse.split(':').map(s => s.trim())
    
    if (queryType === 'existence_check' && topic) {
      const hasBeenCovered = await talkHistory.hasTopicBeenCovered(topic)
      
      if (hasBeenCovered) {
        await message.reply(`Yes, there has been a talk about ${topic} before.`)
      } else {
        await message.reply(`No, I don't see any previous talks about ${topic}.`)
      }
    } 
    else if (queryType === 'list_talks' && topic) {
      const relatedTalks = await talkHistory.findRelatedTalks(topic)
      
      if (relatedTalks.length > 0) {
        const talksList = relatedTalks.map(talk => {
          const formattedDate = talk.scheduledDate.toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
          })
          return `- ${formattedDate}: @${talk.discordUsername} - "${talk.topic}"`
        }).join('\n')
        
        await message.reply(`Here are the talks related to ${topic}:\n${talksList}`)
      } else {
        await message.reply(`I couldn't find any talks related to ${topic}.`)
      }
    }
    else {
      await message.reply("I'm not sure what you're asking about past talks. You can ask if a topic has been covered before or what talks have been about a specific topic.")
    }
  } catch (error) {
    console.error('Error processing talk query:', error)
    await message.reply("Sorry, I encountered an error while searching for past talks.")
  }
}
```

### 4. Create `test/talkHistory.test.js`
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

## Query Handling Approach

### Types of Queries
The implementation will handle two main types of queries:

1. **Existence Check** - "Has there been a talk about X before?"
   - Returns a yes/no response
   - Example: "@bot has there been a talk about A2A before?"

2. **List Talks** - "What talks have been about X?"
   - Returns a list of relevant talks
   - Example: "@bot what talks have been about agents?"

### Query Processing Flow
1. User mentions the bot with a query
2. LLM intent detection identifies it as a `query_talks` intent
3. Query type classification determines if it's an existence check or list request
4. Topic extraction identifies the subject of the query
5. Talk history module retrieves relevant talks
6. Response formatter generates appropriate reply

## Testing Strategy

### Unit Testing
Each component will be independently testable:

1. **Talk History Module**
   - Test retrieval of past talks
   - Test topic similarity matching
   - Test related talk finding

2. **Query Processing**
   - Test query type classification
   - Test topic extraction

3. **Response Formatting**
   - Test different response formats

### Integration Testing
Test the complete flow from user query to response:

1. Mock user queries for different scenarios
2. Verify correct intent detection
3. Verify appropriate talk retrieval
4. Verify response formatting

### Mocking Strategy
- Use mock MongoDB for testing database interactions
- Use direct function replacement for mocking dependencies (following project conventions)
- Save original functions and restore them in finally blocks to ensure cleanup

## Key Differences from Original Testing Approach

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

## Conclusion
This implementation provides a modular, testable approach to enabling talk history queries. By leveraging the existing LLM capabilities and MongoDB storage, we can create a robust feature that enhances the bot's functionality without requiring complex database queries.

The modular design ensures that each component can be tested independently, making the system easier to maintain and extend in the future.
