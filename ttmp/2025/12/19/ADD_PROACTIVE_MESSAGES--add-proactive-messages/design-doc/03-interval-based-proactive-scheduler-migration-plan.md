---
Title: Interval-based Proactive Scheduler Migration Plan
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
    - Path: lib/proactive/index.js
      Note: Current proactive module - will add scheduler initialization
    - Path: lib/proactive/jobs/talkReminders.js
      Note: Existing job - no changes needed, already idempotent
    - Path: lib/proactive/jobs/weeklyAnnouncement.js
      Note: Existing job - no changes needed
    - Path: index.js
      Note: Application entry point - will start scheduler after Discord ready
    - Path: Dockerfile
      Note: Will remove dcron installation and entrypoint (simplify)
    - Path: config/index.js
      Note: Add new schedule configuration options
ExternalSources: []
Summary: Plan to migrate from cron-based to interval-based proactive messaging scheduler that checks against wall clock time
LastUpdated: 2025-12-22
---

# Interval-based Proactive Scheduler Migration Plan

## Executive Summary

This design proposes migrating the proactive messaging system from Docker cron (`dcron`) triggers to an **interval-based scheduler** that runs inside the Node.js process. The scheduler will periodically check the current time and execute jobs when their configured schedule matches (e.g., "run at 16:00 UTC daily").

The cron-based approach was implemented but is **not working reliably in our Docker environment**. The interval-based approach:
- Eliminates the need for `dcron` in the container
- Simplifies the Docker setup (no entrypoint script, no crontab)
- Keeps scheduling logic in JavaScript where it's easier to test and debug
- Maintains idempotency guarantees already built into the jobs

## Problem Statement

The current cron-based implementation:
1. Installs `dcron` in the Alpine Docker image
2. Uses `docker-entrypoint.sh` to start cron daemon alongside Node.js
3. Uses crontab entries that `curl` internal HTTP endpoints

**Issues encountered:**
- Cron daemon is not triggering jobs reliably in the Docker environment
- Adds operational complexity (two processes in one container)
- Harder to debug (cron logs separate from application logs)
- Requires HTTP endpoints to be secured (loopback-only middleware)

**The existing jobs themselves are fine** - `talkReminders.js` and `weeklyAnnouncement.js` are idempotent and well-tested. Only the scheduling trigger mechanism needs to change.

## Proposed Solution

### High-level Architecture

Replace cron triggers with an in-process interval scheduler:

```
Node.js Process Startup
    ↓
Discord Client Ready
    ↓
Start Interval Scheduler (setInterval every 1 minute)
    ↓ (every minute)
Check current UTC time against configured schedules
    ↓ (if schedule matches)
Execute job via existing job functions (with locks)
    ↓
Discord Client sends messages
```

### Core Components

#### 1. Proactive Scheduler (`lib/proactive/scheduler.js`)

A new module that:
- Runs a check every minute via `setInterval`
- Compares current UTC time against configured job schedules
- Executes jobs when their scheduled time matches
- Uses existing locking mechanism to prevent overlapping runs
- Tracks last execution time to ensure jobs run at most once per scheduled window

```javascript
// lib/proactive/scheduler.js
const { runJobWithLock } = require('./index')
const { runTalkRemindersJob } = require('./jobs/talkReminders')
const { runWeeklyAnnouncementJob } = require('./jobs/weeklyAnnouncement')
const config = require('../../config')

class ProactiveScheduler {
  constructor(client) {
    this.client = client
    this.intervalId = null
    this.lastRuns = new Map() // Track when jobs last ran
  }

  start() {
    console.log('[Scheduler] Starting proactive scheduler')
    // Check every minute
    this.intervalId = setInterval(() => this.tick(), 60 * 1000)
    // Also check immediately on startup
    this.tick()
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      console.log('[Scheduler] Stopped proactive scheduler')
    }
  }

  async tick() {
    const now = new Date()
    const utcHour = now.getUTCHours()
    const utcMinute = now.getUTCMinutes()
    const utcDayOfWeek = now.getUTCDay() // 0 = Sunday, 1 = Monday, ...

    // Check each scheduled job
    await this.checkAndRunJob('talkReminders', {
      hour: config.proactive.remindersHour, // e.g., 16
      minute: 0,
      // runs daily
    })

    await this.checkAndRunJob('weeklyAnnouncement', {
      hour: config.proactive.weeklyHour, // e.g., 15
      minute: 0,
      dayOfWeek: 1, // Monday
    })
  }

  async checkAndRunJob(jobName, schedule) {
    const now = new Date()
    const utcHour = now.getUTCHours()
    const utcMinute = now.getUTCMinutes()
    const utcDayOfWeek = now.getUTCDay()

    // Check if current time matches schedule
    if (utcHour !== schedule.hour) return
    if (utcMinute !== schedule.minute) return
    if (schedule.dayOfWeek !== undefined && utcDayOfWeek !== schedule.dayOfWeek) return

    // Check if we already ran this job in the current hour
    const lastRun = this.lastRuns.get(jobName)
    const hourKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${utcHour}`
    if (lastRun === hourKey) {
      return // Already ran this hour
    }

    // Mark as running for this hour (prevents multiple runs within same minute window)
    this.lastRuns.set(jobName, hourKey)

    console.log(`[Scheduler] Running job: ${jobName}`)
    try {
      if (jobName === 'talkReminders') {
        await runJobWithLock('talkReminders', () => runTalkRemindersJob(this.client))
      } else if (jobName === 'weeklyAnnouncement') {
        await runJobWithLock('weeklyAnnouncement', () => runWeeklyAnnouncementJob(this.client))
      }
    } catch (error) {
      console.error(`[Scheduler] Job ${jobName} failed:`, error)
    }
  }
}

module.exports = { ProactiveScheduler }
```

#### 2. Configuration Updates (`config/index.js`)

Add schedule timing configuration:

```javascript
proactive: {
  remindersEnabled: process.env.PROACTIVE_REMINDERS_ENABLED !== 'false',
  weeklyEnabled: process.env.PROACTIVE_WEEKLY_ENABLED !== 'false',
  // Schedule times (UTC hours)
  remindersHour: parseInt(process.env.PROACTIVE_REMINDERS_HOUR, 10) || 16, // 4 PM UTC
  weeklyHour: parseInt(process.env.PROACTIVE_WEEKLY_HOUR, 10) || 15,       // 3 PM UTC
  weeklyDayOfWeek: parseInt(process.env.PROACTIVE_WEEKLY_DAY, 10) || 1,   // Monday
  // Optional: interval check frequency (default 60 seconds)
  checkIntervalMs: parseInt(process.env.PROACTIVE_CHECK_INTERVAL_MS, 10) || 60000,
}
```

#### 3. Integration with Application Startup (`index.js` or `lib/discord/index.js`)

Start the scheduler after the Discord client is ready:

```javascript
// In the ClientReady event handler
client.once(Events.ClientReady, () => {
  console.log(`Ready! Logged in as ${client.user.tag}`)
  client.user.setActivity('for speaker sign-ups', { type: 'WATCHING' })
  
  // Start proactive scheduler
  const { ProactiveScheduler } = require('./lib/proactive/scheduler')
  const scheduler = new ProactiveScheduler(client)
  scheduler.start()
  
  // Store for graceful shutdown
  client.proactiveScheduler = scheduler
})
```

#### 4. Graceful Shutdown

Handle process termination to stop the scheduler:

```javascript
// In index.js
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...')
  if (client.proactiveScheduler) {
    client.proactiveScheduler.stop()
  }
  client.destroy()
  process.exit(0)
})
```

### Docker Simplification

Remove cron-related components:

1. **Remove from Dockerfile:**
   - `RUN apk add --no-cache dcron curl` → remove `dcron` (keep `curl` if needed for health checks)
   - `COPY docker-entrypoint.sh /usr/local/bin/`
   - `COPY crontab /etc/crontabs/root`
   - `RUN chmod +x /usr/local/bin/docker-entrypoint.sh`
   - `ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]`

2. **Simplified Dockerfile:**
   ```dockerfile
   FROM node:lts-alpine AS base
   WORKDIR /usr/src/app

   COPY package*.json ./
   RUN npm ci --omit=dev

   COPY . .
   RUN npm run build

   ENV NODE_ENV=production
   ENV PORT=3000
   ENV PROACTIVE_REMINDERS_ENABLED=true
   ENV PROACTIVE_WEEKLY_ENABLED=true

   EXPOSE ${PORT}

   CMD [ "node", "index.js" ]
   ```

3. **Delete files:**
   - `docker-entrypoint.sh`
   - `crontab`

### What Stays the Same

The following components remain unchanged:
- `lib/proactive/jobs/talkReminders.js` - idempotent job logic
- `lib/proactive/jobs/weeklyAnnouncement.js` - idempotent job logic
- `lib/proactive/locks.js` - prevents overlapping job runs
- `models/scheduledSpeaker.js` - reminder tracking fields
- `middleware/loopback-only.js` - keep for potential manual triggers
- `api/proactive-internal.js` - keep for manual/debug triggers

## Design Decisions

### 1. Interval-based vs Event-driven Scheduling

**Decision:** Use `setInterval` with 1-minute resolution.

**Rationale:**
- Simple and predictable
- 1-minute resolution is sufficient for daily/weekly jobs
- No external dependencies
- Easy to test and debug
- Low overhead (one check per minute)

**Alternative considered:** Event-driven with setTimeout to next scheduled time
- Pros: More precise, no polling
- Cons: Complex time calculation, harder to debug, needs recalculation on container restart

### 2. Time-of-day Matching vs Elapsed Time

**Decision:** Match against wall clock time (UTC hour:minute) not elapsed time.

**Rationale:**
- Jobs run at predictable, human-understandable times
- Users expect "send reminders at 4 PM UTC" not "send every 24 hours"
- Container restarts don't affect schedule
- Matches how cron behaves

### 3. Idempotency via Hour-based Tracking

**Decision:** Track last run by hour-key (YYYY-MM-DD-HH) in memory.

**Rationale:**
- Prevents multiple runs if the check interval hits the same minute twice
- Memory-based is sufficient since:
  - Jobs are already idempotent (DB timestamps)
  - Missing a run isn't catastrophic (will catch up next day)
  - Container restart resets tracking, but DB idempotency protects us

**Alternative considered:** Persist last run time to MongoDB
- Pros: Survives container restart
- Cons: Overkill since jobs are already idempotent via DB timestamps

### 4. Keep Internal HTTP Endpoints

**Decision:** Keep `/internal/proactive/*` endpoints for manual/debug triggers.

**Rationale:**
- Useful for testing and debugging
- Allows manual job execution without restart
- Low maintenance cost (already implemented)
- Could be useful for future integrations

## Alternatives Considered

### 1. Fix Docker Cron

**What:** Debug and fix the dcron setup.

**Rejected because:**
- Adds operational complexity (two processes)
- Harder to debug (cron logs separate)
- Container pattern is unusual (prefer single-process)
- Interval approach is simpler and more maintainable

### 2. External Scheduler (GitHub Actions, AWS EventBridge)

**What:** Use external service to trigger HTTP endpoints.

**Rejected because:**
- Requires public-facing endpoint
- Adds external dependency
- More complex deployment
- Higher latency for triggers

### 3. Use `node-cron` Library

**What:** Use npm package for cron-like scheduling.

**Could work, but:**
- Additional dependency
- Our needs are simple enough for plain setInterval
- More complex API than we need
- Custom solution gives us more control

## Implementation Plan

### Phase 1: Add Interval Scheduler

1. Create `lib/proactive/scheduler.js` with `ProactiveScheduler` class
2. Add schedule configuration to `config/index.js`
3. Integrate scheduler start in Discord client ready handler
4. Add graceful shutdown handling
5. Add unit tests for scheduler timing logic

### Phase 2: Remove Docker Cron

1. Update `Dockerfile` to remove dcron-related lines
2. Delete `docker-entrypoint.sh`
3. Delete `crontab`
4. Test container builds and runs correctly

### Phase 3: Testing and Validation

1. Unit tests for scheduler timing logic
2. Integration test: run scheduler with mocked clock
3. Manual test: deploy and verify jobs run at scheduled times
4. Monitor logs for expected job execution

### Phase 4: Documentation

1. Update README with new configuration options
2. Update workspace rules with scheduler architecture
3. Document how to manually trigger jobs for debugging

## Migration Checklist

- [ ] Create `lib/proactive/scheduler.js`
- [ ] Add schedule config options to `config/index.js`
- [ ] Start scheduler in Discord client ready handler (`lib/discord/index.js`)
- [ ] Add graceful shutdown handler (`index.js`)
- [ ] Add unit tests for scheduler
- [ ] Update Dockerfile (remove dcron)
- [ ] Delete `docker-entrypoint.sh`
- [ ] Delete `crontab`
- [ ] Test locally with mocked time
- [ ] Test in Docker container
- [ ] Update README
- [ ] Deploy and monitor

## Open Questions

1. **Check interval frequency:** Is 1 minute sufficient? Could use 30 seconds for more responsive testing.
   - Recommendation: Start with 1 minute, can reduce if needed

2. **Startup behavior:** Should we run jobs immediately on startup if we're past the scheduled time?
   - Current plan: No, wait for next scheduled time. Jobs are idempotent so missing one run is fine.

3. **Timezone configuration:** Should we allow per-job timezone configuration?
   - Recommendation: Keep UTC-only for simplicity. Can add later if needed.

4. **Health check endpoint:** Should we add an endpoint to verify scheduler is running?
   - Recommendation: Yes, add `GET /internal/scheduler/status` that returns scheduler state and last run times.

## References

- [Original Proactive Messaging Implementation Plan](./01-proactive-messaging-implementation-plan.md)
- [Cron-driven Implementation Plan](./02-cron-driven-proactive-messaging-detailed-implementation-plan.md)
- [Implementation Diary](../reference/02-implementation-diary.md)
