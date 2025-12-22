---
Title: Message Sending and Runtime Architecture Analysis
Ticket: ADD_PROACTIVE_MESSAGES
Status: active
Topics:
    - discord
    - bot
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: config/index.js
      Note: Configuration management loading environment variables for Discord
    - Path: index.js
      Note: Application entry point that starts both Discord client and HTTP server
    - Path: lib/discord/commands/check.js
      Note: Example slash command implementation showing interaction.reply() pattern
    - Path: lib/discord/index.js
      Note: Discord client creation
    - Path: lib/llm/index.js
      Note: LLM integration service using OpenRouter API for intent detection and natural language processing
    - Path: lib/mongo/index.js
      Note: MongoDB connection and health check used by HTTP server
    - Path: lib/schedulingLogic.js
      Note: Core scheduling functions used by message handler to find dates and book talks
    - Path: lib/shared/message-handler.js
      Note: Centralized message handling logic with intent detection and state machine for thread conversations
    - Path: lib/talkHistory.js
      Note: Talk history queries used for query_talks intent handling
    - Path: server.js
      Note: Express HTTP server with health check endpoint and API routes
ExternalSources: []
Summary: Comprehensive analysis of how messages are sent in the Discord bot application, including runtime architecture, event handling, and message flow patterns
LastUpdated: 2025-12-19T13:08:16.98119-08:00
---



# Message Sending and Runtime Architecture Analysis

## Goal

This document provides a comprehensive overview of how messages are sent in the AI in Action Discord bot application, including the runtime architecture, event handling mechanisms, and all code paths that result in messages being sent to Discord channels or users.

## Context

The bot operates as a dual-purpose application:
1. **Discord Bot**: Responds to user messages and slash commands in Discord
2. **HTTP Server**: Provides health checks and API endpoints

Understanding the message sending mechanisms is critical for implementing proactive messaging features, as we need to know:
- Where messages can be sent from
- What APIs are available for sending messages
- How the runtime initializes and maintains connections
- What patterns exist for message composition and delivery

## Runtime Architecture

### Application Entry Point

The application starts in `index.js`, which:
1. Imports the Discord client (`lib/discord/index.js`)
2. Imports the Express server (`server.js`)
3. Waits for Discord client to be ready
4. Starts the HTTP server on port 3000 (or `process.env.PORT`)

**Key Files:**
- `index.js` - Entry point, coordinates Discord and HTTP server startup
- `server.js` - Express HTTP server with health check and API routes
- `lib/discord/index.js` - Discord client creation and event registration

### Discord Client Initialization

The Discord client is created in `lib/discord/index.js` via `createClient()`:

1. **Client Configuration**: Uses `discord.js` Client with intents:
   - `GatewayIntentBits.Guilds` - Access to guild information
   - `GatewayIntentBits.GuildMessages` - Access to guild messages
   - `GatewayIntentBits.MessageContent` - Access to message content

2. **Command Loading**: Dynamically loads slash commands from `lib/discord/commands/`

3. **Event Handlers Registered**:
   - `Events.ClientReady` - Logs ready status, sets bot activity
   - `interactionCreate` - Handles slash commands, buttons, autocomplete
   - `Events.MessageCreate` - Handles all incoming messages

4. **Message Handler**: Creates shared message handler via `createMessageHandler()` from `lib/shared/message-handler.js`

5. **Login**: Calls `client.login(token)` to connect to Discord

### State Management

The bot maintains in-memory state:
- `activeSignups` object: Maps thread IDs to signup state objects
  - Structure: `{ threadId: { userId, state, topic?, proposedDates?, targetUserId?, targetUsername?, lastUpdated? } }`
  - States include: `awaiting_topic`, `awaiting_date_selection`, `awaiting_reschedule_date_selection`, etc.

## Message Sending Mechanisms

### 1. Reply to Messages (`message.reply()`)

**Primary Method**: Used throughout `lib/shared/message-handler.js`

**Pattern**:
```javascript
await message.reply("Response text here")
```

**Usage Locations**:
- Thread state handlers (topic collection, date selection)
- Intent-based responses (sign_up, view_schedule, cancel_talk, etc.)
- Error messages and clarifications

**Key Characteristics**:
- Replies in the same channel/thread as the original message
- Mentions the original author
- Returns a Promise that resolves to the sent Message object

### 2. Thread Creation and Messaging (`message.startThread()` + `thread.send()`)

**Pattern**:
```javascript
const thread = await message.startThread({
  name: `Thread Name - ${message.author.username}`,
  autoArchiveDuration: 60,
  reason: 'Reason for thread creation'
})
await thread.send("Message in new thread")
```

**Usage Locations**:
- Sign-up flow: Creates thread for speaker sign-up process
- Reschedule flow: Creates thread for rescheduling conversations
- Schedule-for-others: Creates thread for scheduling other users
- Zoom link requests: Creates thread for link sharing

**Key Characteristics**:
- Threads auto-archive after 60 minutes of inactivity
- Thread name includes username for identification
- Initial message sent via `thread.send()` after creation

### 3. Slash Command Responses (`interaction.reply()`)

**Pattern**:
```javascript
await interaction.reply({
  content: "Response text",
  ephemeral: true  // Optional: only visible to command user
})
```

**Usage Locations**:
- `lib/discord/commands/check.js` - Test command
- Error handling in `handleInteraction()` for failed commands
- Guild restriction messages for non-configured guilds

**Key Characteristics**:
- Must reply within 3 seconds or use `interaction.deferReply()`
- Ephemeral replies are only visible to the command user
- Can use `interaction.followUp()` for additional messages after initial reply

### 4. Button Interaction Responses

**Pattern**:
```javascript
// Button handlers are defined in command files
cmd.handleButton(interaction, button)
```

**Usage Locations**:
- Button interactions parsed via `parse(interaction.customId)`
- Routed to command-specific handlers via `handleButton()` function

## Message Flow Patterns

### Incoming Message Flow

1. **Message Received**: Discord.js emits `Events.MessageCreate`
2. **Handler Invoked**: `sharedHandleMessage(message)` called
3. **Filtering**:
   - Ignores bot messages (`message.author.bot`)
   - Filters by guild ID (only configured guild)
4. **Routing**:
   - **Thread Messages**: Checks `activeSignups[threadId]` for state-based handling
   - **Mention Messages**: Checks if message starts with bot mention (`<@botId>`)
   - **Intent Detection**: Uses LLM to classify user intent
   - **State Machine**: Routes to appropriate handler based on detected intent and current state

### Intent Detection Flow

1. **LLM Classification**: Uses `completion()` from `lib/llm/index.js`
2. **System Message**: Provides intent classification instructions
3. **Detected Intents**:
   - `sign_up` - User wants to schedule themselves
   - `view_schedule` - User wants to see upcoming talks
   - `cancel_talk` - User wants to cancel their talk
   - `reschedule_talk` - User wants to reschedule their talk
   - `schedule_for_others` - User wants to schedule someone else
   - `cancel_talk_for_others` - User wants to cancel someone else's talk
   - `reschedule_talk_for_others` - User wants to reschedule someone else's talk
   - `query_talks` - User wants to search past talks
   - `zoom_link` - User wants the zoom meeting link
   - `repo` - User wants the GitHub repository link
   - `other` - Fallback for unclear requests

### Thread State Machine

Thread-based conversations use a state machine pattern:

**States**:
- `awaiting_topic` - Waiting for user to provide presentation topic
- `awaiting_date_selection` - Waiting for user to select from proposed dates
- `awaiting_reschedule_date_selection` - Waiting for user to select new date
- `awaiting_target_user` - Waiting for user to mention target person
- `awaiting_topic_for_others` - Waiting for topic for scheduling others
- `awaiting_date_selection_for_others` - Waiting for date selection for others
- `awaiting_reschedule_date_selection_for_others` - Waiting for reschedule date for others
- `awaiting_target_user_for_cancel` - Waiting for target user mention for cancellation
- `awaiting_target_user_for_reschedule` - Waiting for target user mention for rescheduling

**State Transitions**:
- State stored in `activeSignups[threadId].state`
- Updated as conversation progresses
- Cleared when conversation completes or errors occur

## LLM Integration

### LLM Service (`lib/llm/index.js`)

**Function**: `completion({ prompt, messages, systemMessage, maxTokens, model })`

**Configuration**:
- API: OpenRouter (`https://openrouter.ai/api/v1/chat/completions`)
- Default Model: `openai/gpt-4o-mini`
- Default Max Tokens: 100
- Authentication: Bearer token from `config.openrouterApiKey`

**Usage Patterns**:
1. **Intent Detection**: Classifies user messages into action intents
2. **Topic Validation**: Determines if user message is a valid presentation topic
3. **Date Parsing**: Parses natural language date selections
4. **Query Classification**: Classifies talk history queries

## HTTP Server

### Express Server (`server.js`)

**Endpoints**:
- `GET /health` - Health check with MongoDB connectivity check
- `POST /auth` - Authentication test endpoint (requires auth middleware)

**Middleware**:
- JSON body parsing
- Authentication middleware (`middleware/auth.js`)
- Error handling middleware

**Purpose**:
- Health checks for deployment monitoring
- API endpoints for external integrations (future)

## Key Symbols and Functions

### Discord Client Methods
- `client.login(token)` - Connects to Discord Gateway
- `client.user.setActivity()` - Sets bot's "watching" status
- `client.users.fetch(userId)` - Fetches user object by ID
- `client.commands.get(name)` - Gets registered slash command

### Message Object Methods
- `message.reply(content)` - Replies to message in same channel
- `message.startThread(options)` - Creates thread from message
- `message.channel.send(content)` - Sends message to channel (used by chat-sim)

### Thread Object Methods
- `thread.send(content)` - Sends message to thread

### Interaction Object Methods
- `interaction.reply(options)` - Replies to slash command
- `interaction.followUp(options)` - Sends follow-up message
- `interaction.deferReply()` - Defers reply (gives more time)
- `interaction.isRepliable()` - Checks if interaction can be replied to
- `interaction.isAutocomplete()` - Checks if autocomplete interaction
- `interaction.isButton()` - Checks if button interaction
- `interaction.isChatInputCommand()` - Checks if slash command

## Usage Examples

### Example 1: Simple Reply
```javascript
// In message handler
await message.reply("Thanks for your message!")
```

### Example 2: Create Thread and Send Initial Message
```javascript
const thread = await message.startThread({
  name: `Sign-up - ${message.author.username}`,
  autoArchiveDuration: 60
})
await thread.send(`Hi ${message.author}, what's your topic?`)
```

### Example 3: Slash Command Response
```javascript
// In command execute function
await interaction.reply({
  content: `Hello ${userMention(user.id)}!`,
  ephemeral: false
})
```

### Example 4: State-Based Thread Response
```javascript
// In message handler, within thread state check
if (signupInfo.state === 'awaiting_topic') {
  signupInfo.topic = message.content.trim()
  signupInfo.state = 'awaiting_date_selection'
  await message.reply("Great! Here are available dates...")
}
```

## Related

- Design docs for proactive messaging implementation
- Reference docs for Discord.js API patterns
- Playbooks for testing message flows
