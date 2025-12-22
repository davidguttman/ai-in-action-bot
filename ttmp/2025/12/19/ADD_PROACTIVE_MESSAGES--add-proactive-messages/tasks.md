# Tasks

## TODO


- [ ] (Phase 0) Confirm talk time semantics (date-only vs specific time) and pick reminder strategy (T-1 day + day-of vs true 24h/1h)
- [ ] (Phase 0) Decide cron schedules (UTC) for reminders + weekly announcement
- [ ] (Phase 0) Decide destinations: announcements channel ID + reminder delivery policy (DM only vs DM+thread fallback)
- [ ] (Phase 0) Define env vars and toggles: PROACTIVE_REMINDERS_ENABLED, PROACTIVE_WEEKLY_ENABLED, PROACTIVE_ANNOUNCEMENTS_CHANNEL_ID, optional CRON_SECRET
- [ ] (Phase 1) Add internal proactive router (e.g. api/proactive-internal.js) with POST /internal/proactive/check-reminders
- [ ] (Phase 1) Add POST /internal/proactive/weekly-announcement endpoint
- [ ] (Phase 1) Secure internal endpoints: loopback-only guard (+ optional X-Cron-Secret)
- [ ] (Phase 1) Mount internal proactive router in server.js
- [ ] (Phase 1) Standardize job responses/logging (JSON summary with counts, duration, errors)
- [ ] (Phase 2) Create proactive module skeleton: lib/proactive/index.js
- [ ] (Phase 2) Add single-process locking utility (lib/proactive/locks.js) to prevent overlapping cron runs
- [ ] (Phase 2) Implement talk reminders job (lib/proactive/jobs/talkReminders.js): select talks for today/tomorrow, build messages
- [ ] (Phase 2) Implement delivery for reminders: DM speaker; if DM fails and threadId exists, post to thread
- [ ] (Phase 2) Implement weekly announcement job (lib/proactive/jobs/weeklyAnnouncement.js): format upcoming schedule and post to configured channel
- [ ] (Phase 3) Extend ScheduledSpeaker schema with reminder sent timestamps (e.g., reminders.sentTminus1At and reminders.sentDayOfAt)
- [ ] (Phase 3) Ensure idempotency rules: only set sent timestamp on successful send; failed sends retry on next cron run
- [ ] (Phase 3) Add/adjust scheduling queries needed by jobs (e.g., get talks for specific UTC dates)
- [ ] (Phase 4) Docker: install dcron in Dockerfile
- [ ] (Phase 4) Docker: add docker-entrypoint.sh to start crond alongside node index.js
- [ ] (Phase 4) Docker: add crontab at /etc/crontabs/root with curl calls to localhost internal endpoints
- [ ] (Phase 4) Docker: ensure cron and job logs reach container stdout/stderr
- [ ] (Phase 5) Add unit tests for reminder selection + idempotency (mock time + stub discord send)
- [ ] (Phase 5) Add unit/integration tests for internal endpoints security (loopback-only/secret)
- [ ] (Phase 5) Manual validation: build/run container and trigger jobs via curl; verify DB flags update and Discord sends
- [ ] (Phase 6) Rollout plan: ship with PROACTIVE_* disabled; enable reminders first; then weekly; document rollback steps
