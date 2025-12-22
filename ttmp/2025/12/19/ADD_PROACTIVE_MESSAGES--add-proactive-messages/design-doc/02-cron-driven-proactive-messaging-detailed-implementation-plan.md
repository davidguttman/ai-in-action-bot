---
Title: 'Cron-driven Proactive Messaging: Detailed Implementation Plan'
Ticket: ADD_PROACTIVE_MESSAGES
Status: active
Topics:
    - discord
    - bot
    - scheduling
    - ops
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: Dockerfile
      Note: Add dcron + crontab + entrypoint to run cron alongside Node
    - Path: index.js
      Note: Ensures Discord + HTTP server are running for cron to call
    - Path: lib/discord/index.js
      Note: Discord client instance used by proactive jobs
    - Path: lib/schedulingLogic.js
      Note: Source of scheduled talks; reminders read from same model
    - Path: models/scheduledSpeaker.js
      Note: Add reminders.sentTminus1At/sentDayOfAt fields for idempotency
    - Path: server.js
      Note: Mount localhost-only internal proactive trigger routes
ExternalSources: []
Summary: Step-by-step implementation plan for Docker cron-driven proactive messaging (cron -> localhost HTTP triggers -> Discord send)
LastUpdated: 2025-12-19T13:20:12.226888-08:00
---


# Cron-driven Proactive Messaging: Detailed Implementation Plan

## Executive Summary

Implement proactive messages using **system cron inside the Docker container** (Alpine `dcron`) to trigger **localhost-only HTTP endpoints** on the already-running Express server. Those endpoints invoke “jobs” that use the already-connected Discord client to send messages (DMs or channel posts).

This approach keeps scheduling concerns in cron (standard ops practice), avoids in-process polling, and avoids starting additional Discord connections from cron scripts. The bot remains a single long-lived process (`node index.js`), and cron simply “pokes” it.

## Problem Statement

The current bot is reactive: it sends messages only as direct replies to Discord messages or slash commands. We need time-based proactive messaging (e.g., speaker reminders, weekly schedule posts) that will run reliably in production.

Constraints from the current system:
- The bot runs as a single Node process in Docker (`CMD ["node","index.js"]`).
- Discord sending requires an authenticated, connected `discord.js` client.
- The web server already exists (`server.js`) and can host internal endpoints.

We want proactive messaging that is:
- **Predictable** (explicit schedules, easy to change)
- **Operationally standard** (cron)
- **Safe** (no unauthenticated public endpoints)
- **Idempotent** (no duplicate reminders)

## Proposed Solution

### High-level architecture

```
cron (dcron) in container
  └─> curl http://127.0.0.1:3000/internal/proactive/<job>
        └─> Express handler (server.js route)
              └─> job runner (lib/proactive/jobs/*)
                    └─> use existing Discord client instance to send
                          └─> update MongoDB flags to prevent duplicates
```

### Components to add

#### 1) Internal “job trigger” HTTP routes
Add **localhost-only** routes under `POST /internal/proactive/...` that:
- validate the caller is local (or requires a shared secret header as fallback)
- call into job functions (no Discord logic in the route handler)
- return a small JSON summary (counts, duration, errors)

#### 2) Proactive job modules
Add `lib/proactive/jobs/*` that implement:
- `talkRemindersJob`: checks upcoming talks and sends reminders
- `weeklyScheduleAnnouncementJob`: posts upcoming schedule to a configured channel

Each job must be:
- **idempotent** (safe if cron runs twice or container restarts)
- **safe to run concurrently** (prefer a simple lock to avoid overlapping runs)

#### 3) Docker cron
Modify the Docker image to:
- install `dcron`
- add a root crontab (`/etc/crontabs/root`)
- run `crond` alongside Node using an entrypoint script

Cron entries call `curl` against localhost endpoints (not scripts that start Node/Discord).

#### 4) Minimal persistence for idempotency
Record “reminder for talk was sent” to avoid duplicates. The simplest approach is to add fields on `ScheduledSpeaker`:
- `reminders.sentTminus1At`, `reminders.sentDayOfAt` (timestamps, not booleans)

## Design Decisions

### Scheduling mechanism: Docker cron + localhost triggers
- **Why cron**: explicit schedules and standard ops tooling.
- **Why localhost HTTP**: cron should not create a second Discord connection; it should trigger the running bot instance.

### Security: local-only route + optional secret
- Primary guard: accept only loopback (`127.0.0.1`, `::1`) / `req.socket.remoteAddress`.
- Secondary guard (optional): `X-Cron-Secret` header matching `CRON_SECRET` env var.

### Locks to avoid overlapping job runs
Cron schedules can overlap if a job runs long. Use a lock so only one instance of a job runs at a time:
- simplest: in-memory lock keyed by job name (single container)
- if multi-instance later: Mongo-based distributed lock

### Time semantics
`scheduledDate` is stored normalized to midnight UTC; talks are currently “on a date” not “at a time”. Reminder semantics should be date-based unless we add a talk time.

Initial reminders:
- **T-1 day** reminder: send at a configured hour UTC daily, targeting talks scheduled “tomorrow”
- **Day-of** reminder: send at a configured hour UTC daily, targeting talks scheduled “today”

## Design Decisions

<!-- superseded by cron-specific Design Decisions above -->

## Alternatives Considered

### In-process polling (`setInterval`)
- **Pros**: no Docker/cron changes
- **Cons**: always-on polling; schedules live in code; less ops-friendly

### External cron (GitHub Actions / EventBridge)
- **Pros**: no cron daemon in container
- **Cons**: requires public HTTP endpoint + auth; more moving pieces

## Implementation Plan

### Phase 0 — Configuration (required)

1. **Decide message destinations**
   - Announcements channel id: `PROACTIVE_ANNOUNCEMENTS_CHANNEL_ID`
   - Reminder delivery: DM speaker by default; optionally also post to signup thread if `threadId` exists.

2. **Decide reminder schedule (UTC)**
   - Example:
     - T-1 day reminder: 16:00 UTC daily
     - Day-of reminder: 16:00 UTC daily

3. **Add env vars**
   - `CRON_SECRET` (optional; used only if not loopback)
   - `PROACTIVE_ANNOUNCEMENTS_CHANNEL_ID`
   - `PROACTIVE_REMINDERS_ENABLED=true|false`
   - `PROACTIVE_WEEKLY_ENABLED=true|false`

### Phase 1 — Internal job trigger routes (Express)

1. Create `api/proactive-internal.js`
   - `POST /internal/proactive/check-reminders`
   - `POST /internal/proactive/weekly-announcement`
2. Wire in `server.js`:
   - `app.use('/internal/proactive', proactiveInternalRouter)`
3. Add security checks (loopback-only, optional secret)
4. Return structured JSON results

### Phase 2 — Implement job modules

Create:
- `lib/proactive/index.js`
- `lib/proactive/locks.js`
- `lib/proactive/jobs/talkReminders.js`
- `lib/proactive/jobs/weeklyAnnouncement.js`

#### Talk reminders job (date-based)

Selection:
- T-1 day reminders: `scheduledDate == tomorrowUTC && reminders.sentTminus1At == null`
- Day-of reminders: `scheduledDate == todayUTC && reminders.sentDayOfAt == null`

Delivery (per talk):
- Prefer DM to the speaker (`client.users.fetch(...).then(user.send(...))`)
- Fallback: if DM fails and `threadId` exists, `client.channels.fetch(threadId)` then `thread.send(...)`
- Mark sent timestamp only on success; keep null on failure to retry next run

#### Weekly announcement job

Delivery:
- Post to `PROACTIVE_ANNOUNCEMENTS_CHANNEL_ID`
- Include upcoming talks (next N)

### Phase 3 — Persistence changes for idempotency

Update `models/scheduledSpeaker.js` to add:
- `reminders.sentTminus1At: Date`
- `reminders.sentDayOfAt: Date`

Existing docs with missing fields are treated as “not sent yet”.

### Phase 4 — Docker cron integration

1. Update `Dockerfile`:
   - install `dcron` (`apk add --no-cache dcron`)
   - copy `/etc/crontabs/root`
   - add `docker-entrypoint.sh` and use it as `ENTRYPOINT`
2. Add `docker-entrypoint.sh`:
   - `crond -f -l 2 &` then `exec "$@"`
3. Add crontab:

```
0 16 * * * curl -fsS -X POST http://127.0.0.1:3000/internal/proactive/check-reminders || true
0 15 * * 1 curl -fsS -X POST http://127.0.0.1:3000/internal/proactive/weekly-announcement || true
```

### Phase 5 — Tests & validation

1. Unit tests (Tape):
   - reminder job selection + idempotency with mocked time
2. Manual:
   - run container, then `curl -X POST http://127.0.0.1:3000/internal/proactive/check-reminders`

### Phase 6 — Rollout

1. Deploy with `PROACTIVE_*_ENABLED=false`; verify cron + endpoints.
2. Enable reminders; monitor logs.
3. Enable weekly announcement; confirm channel id.

## Open Questions

1. Do talks have a specific time? If yes, implement true “24h/1h before” reminders.
2. Which channel id should receive weekly announcements?
3. DM policy: DM-only vs DM+thread?
4. Will we run multiple replicas? If yes, add distributed lock.

## References

- `ttmp/2025/12/19/ADD_PROACTIVE_MESSAGES--add-proactive-messages/reference/01-message-sending-and-runtime-architecture-analysis.md`
- `ttmp/2025/12/19/ADD_PROACTIVE_MESSAGES--add-proactive-messages/design-doc/01-proactive-messaging-implementation-plan.md`
- `Dockerfile`, `server.js`, `lib/discord/index.js`, `models/scheduledSpeaker.js`
