---
Title: Proactive Messaging Implementation Plan
Ticket: ADD_PROACTIVE_MESSAGES
Status: active
Topics:
    - discord
    - bot
    - scheduling
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: Dockerfile
      Note: Will be updated to install dcron and add entrypoint script for running cron alongside Node.js
    - Path: index.js
      Note: Application entry point - proactive service will start after Discord client ready
    - Path: lib/discord/index.js
      Note: Discord client initialization and event handling - will integrate proactive service
    - Path: lib/schedulingLogic.js
      Note: Scheduling functions that will trigger proactive notifications
    - Path: lib/shared/message-handler.js
      Note: Current reactive message handling - proactive messages will complement this
    - Path: models/scheduledSpeaker.js
      Note: Database model that will be extended with reminder tracking fields
ExternalSources: []
Summary: Comprehensive plan for adding proactive messaging capabilities to send unsolicited messages based on events and schedules
LastUpdated: 2025-12-19T13:11:44.318304-08:00
---



# Proactive Messaging Implementation Plan

## Executive Summary

This design proposes adding proactive messaging capabilities to the AI in Action Discord bot, enabling it to send unsolicited messages based on scheduled events, time-based triggers, and system events. Currently, the bot only responds to user messages and slash commands. This enhancement will allow the bot to proactively communicate with users for purposes such as talk reminders, weekly schedule summaries, and other time-based notifications.

The solution introduces a scheduling service using Node.js timers and a message queue system, integrated with the existing Discord client architecture. This will be implemented incrementally, starting with talk reminders and expanding to other proactive messaging use cases.

## Problem Statement

The current bot implementation is purely reactive—it only responds when users interact with it via messages or slash commands. This limitation prevents the bot from:

1. **Sending talk reminders**: Users scheduled to speak may forget about their upcoming talks without proactive reminders
2. **Weekly schedule announcements**: The community cannot receive automatic weekly summaries of upcoming speakers
3. **Event-based notifications**: The bot cannot notify users about schedule changes, cancellations, or other important events
4. **Engagement opportunities**: Missing chances to engage users proactively (e.g., "We haven't had a speaker in a while, want to sign up?")

These limitations reduce the bot's value as an automated community management tool and require manual intervention for time-sensitive communications.

## Proposed Solution

### Architecture Overview

The solution introduces three main components:

1. **Proactive Messaging Service** (`lib/proactive/index.js`): Core service that manages scheduled messages and event-driven notifications
2. **Message Queue** (`lib/proactive/queue.js`): In-memory queue for pending messages with retry logic
3. **Scheduler** (`lib/proactive/scheduler.js`): Time-based scheduler using Node.js `setInterval` and date calculations

### Core Components

#### 1. Proactive Messaging Service

A centralized service that:
- Manages all proactive message types
- Provides a unified API for sending proactive messages
- Handles message delivery failures and retries
- Tracks message state (pending, sent, failed)

**API Design:**
```javascript
// lib/proactive/index.js
async function sendProactiveMessage({
  channelId,        // Discord channel ID (required)
  userId,           // Discord user ID (optional, for DMs)
  content,         // Message content
  options = {}      // Additional Discord.js message options
})

async function scheduleMessage({
  scheduledTime,    // Date when message should be sent
  channelId,
  userId,
  content,
  options = {}
})
```

#### 2. Message Scheduler

A time-based scheduler that:
- Checks for scheduled messages at regular intervals (e.g., every minute)
- Processes messages whose scheduled time has passed
- Handles timezone considerations (using UTC for consistency)
- Manages recurring schedules (daily, weekly checks)

**Implementation Pattern:**
```javascript
// lib/proactive/scheduler.js
class MessageScheduler {
  constructor(client, proactiveService) {
    this.client = client
    this.proactiveService = proactiveService
    this.intervalId = null
  }

  start() {
    // Check every minute for messages to send
    this.intervalId = setInterval(() => {
      this.processScheduledMessages()
    }, 60 * 1000)
    
    // Also check immediately on startup
    this.processScheduledMessages()
  }

  async processScheduledMessages() {
    // Query database or in-memory queue for messages due to be sent
    // Send messages via proactiveService
  }
}
```

#### 3. Talk Reminder System

Specific implementation for talk reminders:
- Queries MongoDB for upcoming talks
- Sends reminders at configurable intervals (e.g., 1 day before, 1 hour before)
- Tracks which reminders have been sent to avoid duplicates

**Reminder Logic:**
```javascript
// lib/proactive/talkReminders.js
async function checkAndSendTalkReminders(client) {
  const upcomingTalks = await getUpcomingSchedule(10) // Get next 10 talks
  const now = new Date()
  
  for (const talk of upcomingTalks) {
    const timeUntilTalk = talk.scheduledDate - now
    const hoursUntilTalk = timeUntilTalk / (1000 * 60 * 60)
    
    // Send 24-hour reminder
    if (hoursUntilTalk <= 24 && hoursUntilTalk > 23 && !talk.reminder24hSent) {
      await sendTalkReminder(talk, '24h')
      await markReminderSent(talk._id, '24h')
    }
    
    // Send 1-hour reminder
    if (hoursUntilTalk <= 1 && hoursUntilTalk > 0 && !talk.reminder1hSent) {
      await sendTalkReminder(talk, '1h')
      await markReminderSent(talk._id, '1h')
    }
  }
}
```

### Integration Points

#### Discord Client Integration

The proactive messaging service needs access to:
- Discord client instance (for sending messages)
- Guild/channel information (for determining where to send messages)
- User information (for DMs or mentions)

**Integration in `lib/discord/index.js`:**
```javascript
const { createProactiveService } = require('../proactive')

function createClient() {
  const client = new Client({...})
  
  // ... existing setup ...
  
  client.once(Events.ClientReady, () => {
    console.log(`Ready! Logged in as ${client.user.tag}`)
    client.user.setActivity('for speaker sign-ups', { type: 'WATCHING' })
    
    // Initialize proactive messaging after client is ready
    const proactiveService = createProactiveService(client)
    proactiveService.start()
  })
  
  return client
}
```

#### Database Schema Updates

Add reminder tracking fields to `ScheduledSpeaker` model:

```javascript
// models/scheduledSpeaker.js
reminder24hSent: {
  type: Boolean,
  default: false,
},
reminder1hSent: {
  type: Boolean,
  default: false,
},
reminderSentAt: {
  type: Date,
}
```

### Use Cases

#### 1. Talk Reminders

**24-hour reminder:**
- Trigger: 24 hours before scheduled talk
- Recipient: Speaker (via DM or thread)
- Content: "Reminder: You're scheduled to speak tomorrow on [topic] at [time]"

**1-hour reminder:**
- Trigger: 1 hour before scheduled talk
- Recipient: Speaker (via DM or thread)
- Content: "Reminder: Your talk '[topic]' starts in 1 hour!"

#### 2. Weekly Schedule Announcements

**Weekly summary:**
- Trigger: Every Monday at 9 AM (configurable)
- Recipient: Announcement channel
- Content: "This week's speakers: [list of upcoming talks]"

#### 3. Schedule Change Notifications

**Reschedule notification:**
- Trigger: When a talk is rescheduled
- Recipient: Speaker (via DM or thread)
- Content: "Your talk has been rescheduled to [new date]"

**Cancellation notification:**
- Trigger: When a talk is cancelled
- Recipient: Speaker (via DM or thread)
- Content: "Your talk on [date] has been cancelled"

#### 4. Engagement Prompts

**Low activity prompt:**
- Trigger: If no talks scheduled for next 2 weeks
- Recipient: General channel
- Content: "We're looking for speakers! Interested in presenting?"

## Design Decisions

### 1. Scheduling Mechanism

**Decision**: Use Docker container cron (system cron) with HTTP endpoint triggers.

**Rationale**: 
- Bot runs in Docker (`node:lts-alpine`), so system cron is readily available
- Standard Unix cron is reliable and well-understood
- No external dependencies or additional services needed
- Precise timing control with standard cron syntax
- HTTP endpoint approach allows cron to trigger running bot instance
- Simpler than polling every 60 seconds

**Alternative Considered**: Internal polling with `setInterval` - rejected because cron is more standard and doesn't require continuous polling overhead.

### 2. Message Queue

**Decision**: Start with in-memory queue, migrate to database if needed.

**Rationale**: 
- Simpler initial implementation
- Sufficient for low-volume use cases (talk reminders)
- Can migrate to MongoDB-based queue if persistence becomes important

### 3. Reminder Tracking

**Decision**: Store reminder flags in the `ScheduledSpeaker` model.

**Rationale**:
- Simple and straightforward
- Avoids duplicate reminders
- Easy to query and update

### 4. Message Delivery Method

**Decision**: Prefer threads for talk reminders, channels for announcements.

**Rationale**:
- Threads provide context and keep conversations organized
- Channels are better for broadcast messages
- Can fall back to DMs if thread unavailable

### 5. Error Handling

**Decision**: Log errors and continue processing other messages.

**Rationale**:
- Failures in one message shouldn't block others
- Errors can be monitored via logs
- Can add retry logic later if needed

## Alternatives Considered

### 1. External Cron Service

**Alternative**: Use external cron service (e.g., GitHub Actions, AWS EventBridge) to trigger HTTP endpoints.

**Rejected because**:
- Adds external dependencies
- Requires HTTP endpoint management
- More complex deployment
- Less control over timing

**What it would look like**: See detailed explanation in "Cron Integration Approaches" section below.

### 2. Database-Driven Scheduling

**Alternative**: Store all scheduled messages in MongoDB and poll database.

**Rejected because**:
- More complex initial implementation
- Overkill for current use cases
- Can migrate to this approach later if needed

### 3. Discord Scheduled Events API

**Alternative**: Use Discord's built-in scheduled events feature.

**Rejected because**:
- Scheduled events are for calendar events, not messages
- Doesn't provide the flexibility needed for custom messaging
- Limited to specific Discord event types

### 4. Message Queue Service (Redis/RabbitMQ)

**Alternative**: Use external message queue service.

**Rejected because**:
- Adds infrastructure complexity
- Requires additional service management
- Overkill for current scale
- Can adopt later if needed

## Cron Integration Approaches

While cron-based approaches were rejected for the initial implementation, here's what they would look like if adopted:

### Approach 1: External Cron Service (GitHub Actions, AWS EventBridge, etc.)

This approach uses an external service to trigger HTTP endpoints at scheduled intervals.

#### Architecture

```
External Cron Service (GitHub Actions / AWS EventBridge / Cron-job.org)
    ↓ (HTTP POST at scheduled times)
Express HTTP Endpoint (/api/proactive/check-reminders)
    ↓
Proactive Messaging Service
    ↓
Discord Client (send messages)
```

#### Implementation

**1. Add HTTP Endpoint to Express Server**

```javascript
// api/proactive-trigger.js
const express = require('express')
const router = express.Router()
const { checkAndSendTalkReminders } = require('../lib/proactive/talkReminders')
const discord = require('../lib/discord')

router.post('/check-reminders', async (req, res) => {
  try {
    // Verify request is from authorized cron service
    const cronSecret = req.headers['x-cron-secret']
    if (cronSecret !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    // Get Discord client instance
    const client = discord // Assuming discord module exports client
    
    // Check and send reminders
    const results = await checkAndSendTalkReminders(client)
    
    res.json({ 
      success: true, 
      remindersSent: results.length,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error processing proactive reminders:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router
```

**2. Register Route in server.js**

```javascript
// server.js
const proactiveTriggerRouter = require('./api/proactive-trigger')

// ... existing code ...

app.use('/api/proactive', proactiveTriggerRouter)
```

**3. GitHub Actions Cron Example**

```yaml
# .github/workflows/proactive-reminders.yml
name: Proactive Reminders

on:
  schedule:
    # Run every hour
    - cron: '0 * * * *'
  workflow_dispatch: # Allow manual trigger

jobs:
  trigger-reminders:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Reminder Check
        run: |
          curl -X POST \
            -H "Content-Type: application/json" \
            -H "X-Cron-Secret: ${{ secrets.CRON_SECRET }}" \
            https://your-bot-domain.com/api/proactive/check-reminders
```

**4. AWS EventBridge Example**

```json
{
  "Rules": [
    {
      "Name": "ProactiveRemindersHourly",
      "ScheduleExpression": "rate(1 hour)",
      "State": "ENABLED",
      "Targets": [
        {
          "Arn": "arn:aws:lambda:region:account:function:triggerReminders",
          "Id": "1"
        }
      ]
    }
  ]
}
```

**Pros:**
- No need to keep process running continuously
- Can leverage existing infrastructure (GitHub Actions is free for public repos)
- Easy to monitor and debug (cron service logs)
- Can scale independently

**Cons:**
- Requires external service setup and configuration
- Adds HTTP endpoint that needs security (API keys/secrets)
- Less precise timing (depends on cron service schedule)
- Requires bot to be accessible via HTTP (may need reverse proxy/domain)

### Approach 2: Internal Cron Library (node-cron)

This approach uses a Node.js cron library within the bot process.

#### Architecture

```
Bot Process Startup
    ↓
Initialize node-cron scheduler
    ↓ (runs on schedule)
Proactive Messaging Service
    ↓
Discord Client (send messages)
```

#### Implementation

**1. Install node-cron**

```bash
npm install node-cron
```

**2. Create Cron-Based Scheduler**

```javascript
// lib/proactive/cronScheduler.js
const cron = require('node-cron')
const { checkAndSendTalkReminders } = require('./talkReminders')
const { sendWeeklyAnnouncement } = require('./weeklyAnnouncements')

class CronScheduler {
  constructor(client) {
    this.client = client
    this.jobs = []
  }

  start() {
    // Check for talk reminders every hour
    const reminderJob = cron.schedule('0 * * * *', async () => {
      console.log('Running scheduled reminder check...')
      try {
        await checkAndSendTalkReminders(this.client)
      } catch (error) {
        console.error('Error in scheduled reminder check:', error)
      }
    })
    this.jobs.push(reminderJob)

    // Send weekly announcement every Monday at 9 AM UTC
    const weeklyJob = cron.schedule('0 9 * * 1', async () => {
      console.log('Running weekly announcement...')
      try {
        await sendWeeklyAnnouncement(this.client)
      } catch (error) {
        console.error('Error in weekly announcement:', error)
      }
    })
    this.jobs.push(weeklyJob)

    console.log('Cron scheduler started')
  }

  stop() {
    this.jobs.forEach(job => job.stop())
    console.log('Cron scheduler stopped')
  }
}

module.exports = { CronScheduler }
```

**3. Integrate with Discord Client**

```javascript
// lib/discord/index.js
const { CronScheduler } = require('../proactive/cronScheduler')

function createClient() {
  const client = new Client({...})
  
  // ... existing setup ...
  
  client.once(Events.ClientReady, () => {
    console.log(`Ready! Logged in as ${client.user.tag}`)
    client.user.setActivity('for speaker sign-ups', { type: 'WATCHING' })
    
    // Start cron scheduler
    const cronScheduler = new CronScheduler(client)
    cronScheduler.start()
    
    // Store scheduler for cleanup on shutdown
    client.cronScheduler = cronScheduler
  })
  
  return client
}
```

**4. Handle Graceful Shutdown**

```javascript
// index.js
const discord = require('./lib/discord')

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...')
  if (discord.cronScheduler) {
    discord.cronScheduler.stop()
  }
  process.exit(0)
})
```

**Pros:**
- No external dependencies
- Precise timing control
- Simple to implement
- Works entirely within bot process

**Cons:**
- Requires bot process to run continuously
- If bot crashes, scheduled tasks are lost until restart
- Less flexible than external cron (harder to modify schedules without code changes)

### Approach 3: Docker Container Cron (System Cron)

Since the bot runs in a Docker container using `node:lts-alpine`, we can use the system cron daemon directly in the container.

#### Architecture

```
Docker Container Startup
    ↓
Start cron daemon (dcron)
    ↓ (runs on schedule)
Shell script executes Node.js script
    ↓
HTTP endpoint or direct function call
    ↓
Discord Client (send messages)
```

#### Implementation

**1. Update Dockerfile to Install Cron**

```dockerfile
FROM node:lts-alpine AS base
WORKDIR /usr/src/app

# Install dcron (lightweight cron for Alpine)
RUN apk add --no-cache dcron

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application code
COPY . .

# Run the build script (deploys Discord commands)
RUN npm run build

# Copy cron configuration
COPY crontab /etc/crontabs/root

# Copy startup script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose the port
EXPOSE ${PORT}

# Use entrypoint script that starts both cron and Node.js
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "index.js"]
```

**2. Create crontab File**

```bash
# crontab
# Check for talk reminders every hour
0 * * * * /usr/src/app/bin/check-reminders.sh

# Send weekly announcement every Monday at 9 AM UTC
0 9 * * 1 /usr/src/app/bin/weekly-announcement.sh
```

**3. Create Shell Scripts for Cron Jobs**

```bash
#!/bin/sh
# bin/check-reminders.sh

# Set working directory
cd /usr/src/app

# Call Node.js script that checks and sends reminders
node -e "
const discord = require('./lib/discord');
const { checkAndSendTalkReminders } = require('./lib/proactive/talkReminders');

discord.once('ready', async () => {
  try {
    await checkAndSendTalkReminders(discord);
    process.exit(0);
  } catch (error) {
    console.error('Error in reminder check:', error);
    process.exit(1);
  }
});
"
```

**4. Create Docker Entrypoint Script**

```bash
#!/bin/sh
# docker-entrypoint.sh

# Start cron daemon in background
crond -f -l 2 &

# Wait a moment for cron to start
sleep 1

# Execute the main command (node index.js)
exec "$@"
```

**5. Alternative: HTTP Endpoint Approach**

Instead of direct function calls, cron can trigger HTTP endpoints:

```bash
#!/bin/sh
# bin/check-reminders.sh

# Call HTTP endpoint (requires bot to be running)
curl -X POST http://localhost:3000/api/proactive/check-reminders \
  -H "X-Cron-Secret: ${CRON_SECRET}" \
  -H "Content-Type: application/json"
```

**6. Add HTTP Endpoint for Cron Triggers**

```javascript
// api/proactive-trigger.js
const express = require('express')
const router = express.Router()
const { checkAndSendTalkReminders } = require('../lib/proactive/talkReminders')
const discord = require('../lib/discord')

router.post('/check-reminders', async (req, res) => {
  try {
    // Verify request is from cron (localhost only)
    if (req.ip !== '127.0.0.1' && req.ip !== '::1') {
      const cronSecret = req.headers['x-cron-secret']
      if (cronSecret !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' })
      }
    }

    const results = await checkAndSendTalkReminders(discord)
    
    res.json({ 
      success: true, 
      remindersSent: results.length,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error processing proactive reminders:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router
```

**7. Register Route in server.js**

```javascript
// server.js
const proactiveTriggerRouter = require('./api/proactive-trigger')

// ... existing code ...

app.use('/api/proactive', proactiveTriggerRouter)
```

**Pros:**
- Uses standard Unix cron (familiar, reliable)
- No external dependencies
- Works entirely within container
- Precise timing control
- Can use standard cron syntax

**Cons:**
- Requires Dockerfile changes
- Need to manage cron daemon lifecycle
- Shell scripts add complexity
- Logs go to cron log files (need to configure)
- If using HTTP approach, requires bot to be running

**Recommended Approach:** Use HTTP endpoint approach so cron jobs can trigger the running bot instance, avoiding the need to start/stop Discord connections.

### Approach 4: Database-Driven Cron (MongoDB TTL + Change Streams)

This approach uses MongoDB's TTL indexes and change streams to trigger actions.

#### Architecture

```
MongoDB ScheduledMessage Collection
    ↓ (TTL index expires documents)
MongoDB Change Stream Listener
    ↓ (detects expired documents)
Proactive Messaging Service
    ↓
Discord Client (send messages)
```

#### Implementation

**1. Create Scheduled Message Model**

```javascript
// models/scheduledMessage.js
const mongoose = require('mongoose')

const scheduledMessageSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['talk_reminder_24h', 'talk_reminder_1h', 'weekly_announcement'],
    required: true
  },
  scheduledFor: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 } // TTL index
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  processed: {
    type: Boolean,
    default: false
  }
})

const ScheduledMessage = mongoose.model('ScheduledMessage', scheduledMessageSchema)
module.exports = ScheduledMessage
```

**2. Create Messages When Scheduling Talks**

```javascript
// lib/schedulingLogic.js
const ScheduledMessage = require('../models/scheduledMessage')

async function scheduleSpeaker({...}) {
  // ... existing scheduling logic ...
  
  const savedSpeaker = await speaker.save()
  
  // Schedule reminders
  const talkDate = savedSpeaker.scheduledDate
  const reminder24h = new Date(talkDate)
  reminder24h.setHours(reminder24h.getHours() - 24)
  
  const reminder1h = new Date(talkDate)
  reminder1h.setHours(reminder1h.getHours() - 1)
  
  await ScheduledMessage.create([
    {
      type: 'talk_reminder_24h',
      scheduledFor: reminder24h,
      payload: { speakerId: savedSpeaker._id }
    },
    {
      type: 'talk_reminder_1h',
      scheduledFor: reminder1h,
      payload: { speakerId: savedSpeaker._id }
    }
  ])
  
  return savedSpeaker
}
```

**3. Listen for Expired Documents**

```javascript
// lib/proactive/mongoScheduler.js
const ScheduledMessage = require('../../models/scheduledMessage')
const mongoose = require('mongoose')

class MongoScheduler {
  constructor(client) {
    this.client = client
    this.changeStream = null
  }

  start() {
    // Poll for expired messages every minute
    setInterval(async () => {
      await this.processExpiredMessages()
    }, 60 * 1000)
    
    // Also listen to change streams for immediate processing
    const collection = mongoose.connection.db.collection('scheduledmessages')
    this.changeStream = collection.watch(
      [{ $match: { 'fullDocument.processed': false } }],
      { fullDocument: 'updateLookup' }
    )
    
    this.changeStream.on('change', async (change) => {
      if (change.operationType === 'update') {
        await this.processMessage(change.fullDocument)
      }
    })
  }

  async processExpiredMessages() {
    const now = new Date()
    const expired = await ScheduledMessage.find({
      scheduledFor: { $lte: now },
      processed: false
    })
    
    for (const message of expired) {
      await this.processMessage(message)
    }
  }

  async processMessage(messageDoc) {
    try {
      // Process based on message type
      switch (messageDoc.type) {
        case 'talk_reminder_24h':
        case 'talk_reminder_1h':
          await this.sendTalkReminder(messageDoc)
          break
        case 'weekly_announcement':
          await this.sendWeeklyAnnouncement(messageDoc)
          break
      }
      
      // Mark as processed
      messageDoc.processed = true
      await messageDoc.save()
    } catch (error) {
      console.error('Error processing scheduled message:', error)
    }
  }
}

module.exports = { MongoScheduler }
```

**Pros:**
- Persistent across bot restarts
- Database-driven (single source of truth)
- Can query and debug scheduled messages
- Scales well

**Cons:**
- More complex implementation
- Requires MongoDB change streams (MongoDB 3.6+)
- TTL indexes have some delay (up to 60 seconds)
- More database queries

### Comparison Summary

| Approach | Complexity | Persistence | External Deps | Precision | Best For |
|---------|-----------|-------------|---------------|-----------|----------|
| External Cron | Medium | Low | Yes | Medium | Multi-instance deployments |
| node-cron | Low | Low | No | High | Single-instance bots |
| **Docker Cron** | **Low-Medium** | **Low** | **No** | **High** | **Docker deployments (RECOMMENDED)** |
| MongoDB TTL | High | High | No | Medium | Production systems needing persistence |

**Note:** Since the bot runs in Docker (`node:lts-alpine`), using system cron inside the container is a viable and simple option. It leverages standard Unix cron without external dependencies and provides precise timing control.

## Implementation Plan

### Phase 1: Foundation (Core Infrastructure)

1. **Set up Docker cron infrastructure**
   - Update `Dockerfile` to install `dcron` (Alpine cron)
   - Create `crontab` file with scheduled jobs
   - Create `docker-entrypoint.sh` to start cron daemon alongside Node.js
   - Create shell scripts for cron jobs (`bin/check-reminders.sh`, `bin/weekly-announcement.sh`)

2. **Create proactive messaging module structure**
   - Create `lib/proactive/` directory
   - Add `index.js` with basic service structure
   - Add `talkReminders.js` for reminder logic
   - Add `weeklyAnnouncements.js` for weekly schedule posts

3. **Add HTTP endpoints for cron triggers**
   - Create `api/proactive-trigger.js` with `/check-reminders` endpoint
   - Register route in `server.js`
   - Add authentication (CRON_SECRET env var or localhost-only)

4. **Add database schema updates**
   - Update `models/scheduledSpeaker.js` to include reminder tracking fields
   - Create migration script if needed

### Phase 2: Talk Reminders

4. **Implement talk reminder logic**
   - Create `lib/proactive/talkReminders.js`
   - Implement 24-hour reminder check
   - Implement 1-hour reminder check
   - Add reminder message templates

5. **Add reminder sending functionality**
   - Implement `sendTalkReminder()` function
   - Handle thread vs DM fallback
   - Add error handling and logging

6. **Test talk reminders**
   - Create test cases for reminder timing
   - Test with scheduled talks
   - Verify reminder flags are set correctly

### Phase 3: Weekly Announcements

7. **Implement weekly schedule announcements**
   - Create `lib/proactive/weeklyAnnouncements.js`
   - Add configuration for announcement channel and time
   - Format upcoming schedule for announcement

8. **Add announcement scheduling**
   - Schedule weekly checks (every Monday)
   - Send formatted schedule to announcement channel

### Phase 4: Event-Based Notifications

9. **Add reschedule notifications**
   - Hook into `rescheduleSpeaker()` function
   - Send notification when talk is rescheduled
   - Update message handler to trigger notifications

10. **Add cancellation notifications**
    - Hook into `cancelSpeaker()` function
    - Send notification when talk is cancelled

### Phase 5: Configuration and Polish

11. **Add configuration options**
    - Add reminder timing configuration to `config/index.js`
    - Add announcement channel/time configuration
    - Make intervals configurable

12. **Add monitoring and logging**
    - Log all proactive messages sent
    - Add metrics for message delivery success/failure
    - Add health check for proactive service

13. **Documentation**
    - Update README with proactive messaging features
    - Document configuration options
    - Add examples of proactive messages

## Open Questions

1. **Channel Selection**: How should we determine which channel to send proactive messages to?
   - Should there be a configured "announcements" channel?
   - Should reminders go to the original signup thread or a new thread?
   - Should we support DMs as an option?

2. **Timezone Handling**: How should we handle timezones for reminders?
   - Use UTC consistently (current approach)?
   - Allow per-user timezone preferences?
   - Use server timezone?

3. **Message Rate Limits**: How should we handle Discord rate limits?
   - Implement rate limiting in the proactive service?
   - Batch messages when possible?
   - Add delays between messages?

4. **Failure Recovery**: What should happen if a message fails to send?
   - Retry immediately?
   - Retry after delay?
   - Log and skip?
   - Notify admins?

5. **User Preferences**: Should users be able to opt out of proactive messages?
   - Add preference flags to user model?
   - Respect Discord notification settings?
   - Provide slash command to manage preferences?

6. **Testing Strategy**: How should we test time-based functionality?
   - Use time mocking in tests?
   - Create test talks with near-future dates?
   - Add integration tests with real timing?

## References

- [Message Sending and Runtime Architecture Analysis](./reference/01-message-sending-and-runtime-architecture-analysis.md) - Current message sending patterns
- [Discord.js Documentation](https://discord.js.org/) - Discord.js API reference
- [Node.js Timers](https://nodejs.org/api/timers.html) - Node.js timer APIs
- [MongoDB Date Queries](https://www.mongodb.com/docs/manual/reference/operator/query/date/) - MongoDB date query patterns
