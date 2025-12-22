---
Title: Proactive Messaging Testing Guide
Ticket: ADD_PROACTIVE_MESSAGES
Status: active
Topics:
    - discord
    - bot
    - testing
DocType: playbook
Intent: long-term
Owners: []
RelatedFiles:
    - Path: Dockerfile
      Note: Docker setup to test
    - Path: api/proactive-internal.js
      Note: Endpoints to test
    - Path: crontab
      Note: Cron schedule to verify
    - Path: lib/proactive/jobs/talkReminders.js
      Note: Job logic to validate
    - Path: lib/proactive/jobs/weeklyAnnouncement.js
      Note: Job logic to validate
ExternalSources: []
Summary: Step-by-step guide for testing proactive messaging functionality
LastUpdated: 2025-12-19T14:00:00-08:00
---


# Proactive Messaging Testing Guide

This guide covers how to test the proactive messaging feature end-to-end, from local development to production validation.

## Prerequisites

1. **Environment Variables** - Add these to your `.env` file:
   ```bash
   # Enable proactive features
   PROACTIVE_REMINDERS_ENABLED=true
   PROACTIVE_WEEKLY_ENABLED=true
   
   # Discord channel ID for weekly announcements
   PROACTIVE_ANNOUNCEMENTS_CHANNEL_ID=your-channel-id-here
   
   # Optional: Secret for non-loopback access (for multi-instance deployments)
   CRON_SECRET=your-secret-here
   
   # Required: Standard bot config
   DISCORD_TOKEN=your-bot-token
   DISCORD_CLIENT_ID=your-client-id
   DISCORD_GUILD_ID=your-guild-id
   MONGO_URI=mongodb://localhost:27017/aiia-bot
   ```

2. **Get Channel ID** - To find your Discord channel ID:
   - Enable Developer Mode in Discord (User Settings → Advanced → Developer Mode)
   - Right-click the channel → Copy ID

## Testing Approach

### Phase 0: Quick Test with REPL (No Discord Required) ⚡

The easiest way to test proactive messaging without setting up Discord is using the REPL test script. This uses the chat simulation client to test all functionality.

```bash
# Run the test script (no Discord token needed!)
npm run test-proactive
# or directly:
node bin/test-proactive.js
```

**What it tests:**
- ✅ Talk reminders job (T-1 and day-of)
- ✅ Weekly announcement job
- ✅ Idempotency (no duplicate sends)
- ✅ Disabled features handling
- ✅ DM and channel message sending

**What you'll see:**
- Test talks created in MongoDB
- DMs "sent" to simulated users (printed to console)
- Channel announcements "posted" (printed to console)
- Job results with counts and status
- Automatic cleanup of test data

**Prerequisites:**
- MongoDB running (uses your `MONGO_URI`)
- No Discord token needed!
- Environment variables optional (script sets them for testing)

This is the fastest way to verify the proactive messaging logic works correctly before testing with real Discord.

### Phase 1: Local Testing (Without Docker)

Test the endpoints and job logic locally before containerizing.

#### 1.1 Test Security Middleware

Verify that endpoints reject non-loopback requests:

```bash
# Start the bot locally
npm start

# In another terminal, test loopback access (should work)
curl -X POST http://127.0.0.1:3000/internal/proactive/check-reminders

# Test non-loopback access (should fail with 403)
curl -X POST http://localhost:3000/internal/proactive/check-reminders \
  -H "X-Forwarded-For: 192.168.1.1"

# Test with secret header (should work if CRON_SECRET is set)
curl -X POST http://localhost:3000/internal/proactive/check-reminders \
  -H "X-Forwarded-For: 192.168.1.1" \
  -H "X-Cron-Secret: your-secret-here"
```

Expected results:
- Loopback requests return 200 with job results
- Non-loopback without secret return 403
- Non-loopback with valid secret return 200

#### 1.2 Test Endpoints Manually

Create test data and trigger jobs:

```bash
# Start bot
npm start

# In MongoDB shell or using a script, create test talks:
# - One scheduled for tomorrow (for T-1 reminder)
# - One scheduled for today (for day-of reminder)
```

**Create test talks via MongoDB:**

```javascript
// Connect to MongoDB
use aiia-bot

// Create talk for tomorrow (T-1 reminder test)
db.scheduledSpeakers.insertOne({
  discordUserId: "your-discord-user-id",
  discordUsername: "TestUser",
  topic: "Test Talk for Tomorrow",
  scheduledDate: new Date(Date.now() + 24*60*60*1000), // Tomorrow
  threadId: "optional-thread-id"
})

// Create talk for today (day-of reminder test)
db.scheduledSpeakers.insertOne({
  discordUserId: "your-discord-user-id",
  discordUsername: "TestUser",
  topic: "Test Talk for Today",
  scheduledDate: new Date(), // Today (normalized to midnight UTC)
  threadId: "optional-thread-id"
})
```

**Trigger reminders job:**

```bash
curl -X POST http://127.0.0.1:3000/internal/proactive/check-reminders \
  -H "Content-Type: application/json" | jq
```

Expected response:
```json
{
  "job": "talk-reminders",
  "status": "success",
  "duration": 123,
  "reminders": {
    "tminus1Sent": 1,
    "dayOfSent": 1,
    "errors": []
  },
  "timestamp": "2025-12-19T22:00:00.000Z"
}
```

**Verify in Discord:**
- Check DMs from the bot (should receive reminders)
- If DM fails, check the thread (fallback should work)

**Verify in MongoDB:**

```javascript
// Check that reminder timestamps were set
db.scheduledSpeakers.find({
  topic: { $in: ["Test Talk for Tomorrow", "Test Talk for Today"] }
}).pretty()

// Should show:
// - reminders.sentTminus1At for tomorrow's talk
// - reminders.sentDayOfAt for today's talk
```

**Test idempotency (no duplicate sends):**

```bash
# Run the job again immediately
curl -X POST http://127.0.0.1:3000/internal/proactive/check-reminders | jq

# Should show:
# "tminus1Sent": 0,
# "dayOfSent": 0
# (no new reminders sent because timestamps already set)
```

**Trigger weekly announcement:**

```bash
curl -X POST http://127.0.0.1:3000/internal/proactive/weekly-announcement | jq
```

Expected response:
```json
{
  "job": "weekly-announcement",
  "status": "success",
  "duration": 45,
  "announcement": {
    "posted": true,
    "talksCount": 3,
    "error": null
  },
  "timestamp": "2025-12-19T22:00:00.000Z"
}
```

**Verify in Discord:**
- Check the announcements channel for the weekly schedule post

### Phase 2: Docker Container Testing

Test the full Docker setup with cron integration.

#### 2.1 Build Docker Image

```bash
# Build the image
docker build -t ai-in-action-bot .

# Verify cron is installed
docker run --rm ai-in-action-bot crond --help
```

#### 2.2 Run Container with Environment Variables

```bash
# Create .env file with all required variables
cat > .env << EOF
DISCORD_TOKEN=your-token
DISCORD_CLIENT_ID=your-client-id
DISCORD_GUILD_ID=your-guild-id
MONGO_URI=mongodb://host.docker.internal:27017/aiia-bot
PROACTIVE_REMINDERS_ENABLED=true
PROACTIVE_WEEKLY_ENABLED=true
PROACTIVE_ANNOUNCEMENTS_CHANNEL_ID=your-channel-id
EOF

# Run container
docker run --env-file .env \
  -p 3000:3000 \
  --name aiia-bot-test \
  ai-in-action-bot
```

**Verify both processes are running:**

```bash
# Check container logs
docker logs aiia-bot-test

# Should see:
# - "Ready! Logged in as BotName#1234" (Discord bot)
# - "AIIA Bot listening on port 3000" (HTTP server)
# - Cron daemon running (no errors)
```

**Verify cron is running:**

```bash
# Exec into container
docker exec aiia-bot-test ps aux | grep crond

# Should show crond process running
```

#### 2.3 Test Endpoints from Host

```bash
# Test reminders endpoint
curl -X POST http://localhost:3000/internal/proactive/check-reminders | jq

# Test weekly announcement endpoint
curl -X POST http://localhost:3000/internal/proactive/weekly-announcement | jq
```

#### 2.4 Test Cron Jobs Manually

**Option A: Trigger cron job directly in container**

```bash
# Exec into container
docker exec -it aiia-bot-test sh

# Manually run cron job
curl -fsS -X POST http://127.0.0.1:3000/internal/proactive/check-reminders

# Exit container
exit
```

**Option B: Wait for scheduled cron execution**

Cron jobs are scheduled for:
- Daily at 16:00 UTC: reminders
- Mondays at 15:00 UTC: weekly announcement

To test immediately, you can temporarily modify the crontab:

```bash
# Exec into container
docker exec -it aiia-bot-test sh

# Edit crontab (for testing only)
vi /etc/crontabs/root

# Change to run every minute for testing:
# * * * * * curl -fsS -X POST http://127.0.0.1:3000/internal/proactive/check-reminders || true

# Restart cron (or restart container)
killall crond
crond -f -l 2 &

# Watch logs
docker logs -f aiia-bot-test
```

### Phase 3: Edge Case Testing

#### 3.1 Test Disabled Features

```bash
# Set in .env
PROACTIVE_REMINDERS_ENABLED=false
PROACTIVE_WEEKLY_ENABLED=false

# Restart container
docker restart aiia-bot-test

# Trigger jobs
curl -X POST http://localhost:3000/internal/proactive/check-reminders | jq

# Should return:
# {
#   "skipped": true,
#   "reason": "disabled",
#   ...
# }
```

#### 3.2 Test DM Failure Fallback

Create a test scenario where DM fails:

```javascript
// In MongoDB, create talk with invalid user ID
db.scheduledSpeakers.insertOne({
  discordUserId: "invalid-user-id-999999",
  discordUsername: "NonExistentUser",
  topic: "Test DM Failure",
  scheduledDate: new Date(),
  threadId: "valid-thread-id" // This should be used as fallback
})
```

Trigger job and verify:
- DM attempt fails (expected)
- Message is sent to thread instead (fallback works)
- Reminder timestamp is still set (successful send)

#### 3.3 Test Missing Channel ID

```bash
# Unset channel ID
export PROACTIVE_ANNOUNCEMENTS_CHANNEL_ID=""

# Trigger weekly announcement
curl -X POST http://localhost:3000/internal/proactive/weekly-announcement | jq

# Should return error about missing channel ID
```

#### 3.4 Test Locking Mechanism

```bash
# Trigger job twice rapidly
curl -X POST http://localhost:3000/internal/proactive/check-reminders &
curl -X POST http://localhost:3000/internal/proactive/check-reminders &

# Wait for both to complete
wait

# Check logs - second request should show "skipped" with "already_running"
```

### Phase 4: Production Validation Checklist

Before enabling in production:

- [ ] **Environment Variables Set**
  - [ ] `PROACTIVE_REMINDERS_ENABLED=true`
  - [ ] `PROACTIVE_WEEKLY_ENABLED=true`
  - [ ] `PROACTIVE_ANNOUNCEMENTS_CHANNEL_ID` is valid
  - [ ] `CRON_SECRET` set (if using multi-instance)

- [ ] **Container Running**
  - [ ] Both cron and Node processes running
  - [ ] No errors in container logs
  - [ ] Discord bot connected and ready

- [ ] **Endpoints Accessible**
  - [ ] `curl http://localhost:3000/health` returns 200
  - [ ] Internal endpoints respond correctly
  - [ ] Security middleware blocks non-loopback (if CRON_SECRET not set)

- [ ] **Test Data Created**
  - [ ] Talk scheduled for tomorrow (T-1 test)
  - [ ] Talk scheduled for today (day-of test)
  - [ ] Multiple upcoming talks (weekly announcement test)

- [ ] **Manual Trigger Successful**
  - [ ] Reminders job sends DMs
  - [ ] Weekly announcement posts to channel
  - [ ] Database timestamps updated correctly
  - [ ] No duplicate sends on re-run

- [ ] **Cron Schedule Verified**
  - [ ] Cron jobs scheduled correctly (check `/etc/crontabs/root` in container)
  - [ ] Times are in UTC (16:00 daily, 15:00 Mondays)

- [ ] **Monitoring Setup**
  - [ ] Container logs accessible
  - [ ] Job results logged (check for JSON responses)
  - [ ] Error alerts configured (if applicable)

## Troubleshooting

### Endpoints Return 403

**Problem:** `curl` returns 403 Forbidden

**Solutions:**
- Ensure you're using `127.0.0.1` (not `localhost`)
- If testing from outside container, set `CRON_SECRET` and use header
- Check middleware logs for rejection reason

### No Reminders Sent

**Problem:** Job runs but no reminders sent

**Check:**
- `PROACTIVE_REMINDERS_ENABLED=true` in environment
- Talks exist with correct dates (tomorrow/today in UTC)
- Reminder timestamps not already set (check MongoDB)
- Discord bot has permission to DM users
- User IDs are valid Discord user IDs

### Cron Jobs Not Running

**Problem:** Cron jobs don't execute on schedule

**Check:**
- Cron daemon is running: `docker exec container ps aux | grep crond`
- Crontab file exists: `docker exec container cat /etc/crontabs/root`
- Container timezone is UTC (cron uses container's timezone)
- Check cron logs: `docker logs container | grep cron`

### Database Timestamps Not Updating

**Problem:** Reminders sent but timestamps not saved

**Check:**
- MongoDB connection working
- Schema includes `reminders` field (should be automatic)
- No database errors in logs
- Verify with: `db.scheduledSpeakers.findOne({ topic: "Test Talk" })`

## Quick Test Script

Save this as `test-proactive.sh`:

```bash
#!/bin/bash
set -e

BASE_URL="${1:-http://127.0.0.1:3000}"

echo "Testing proactive messaging endpoints..."
echo ""

echo "1. Testing check-reminders endpoint..."
curl -s -X POST "$BASE_URL/internal/proactive/check-reminders" | jq
echo ""

echo "2. Testing weekly-announcement endpoint..."
curl -s -X POST "$BASE_URL/internal/proactive/weekly-announcement" | jq
echo ""

echo "3. Testing idempotency (run reminders again)..."
curl -s -X POST "$BASE_URL/internal/proactive/check-reminders" | jq
echo ""

echo "Done!"
```

Make it executable and run:
```bash
chmod +x test-proactive.sh
./test-proactive.sh
# Or test Docker container:
./test-proactive.sh http://localhost:3000
```
