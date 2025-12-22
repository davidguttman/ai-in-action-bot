# Changelog

## 2025-12-19

- Initial workspace created


## 2025-12-19 - Created Implementation Plan

Created comprehensive design document outlining the plan for adding proactive messaging capabilities. The plan includes architecture design, implementation phases, use cases (talk reminders, weekly announcements, event notifications), and open questions. Documented integration points with existing Discord client and database schema.


## 2025-12-19 - Added Cron Integration Analysis

Added detailed 'Cron Integration Approaches' section explaining three cron-based alternatives: external cron services (GitHub Actions/AWS EventBridge), internal node-cron library, and MongoDB TTL-based scheduling. Includes code examples, architecture diagrams, pros/cons, and comparison table for each approach.


## 2025-12-19 - Added Docker Cron Approach

Added detailed Docker cron integration approach (Approach 3) since bot runs in Docker. Includes Dockerfile updates, crontab configuration, entrypoint script, and HTTP endpoint approach. Updated design decisions to recommend Docker cron over polling. Updated comparison table and implementation plan to reflect Docker cron as the recommended approach.


## 2025-12-19 - Added cron-driven detailed implementation plan

Added design doc 02-cron-driven-proactive-messaging-detailed-implementation-plan.md with a file-by-file, cron-first implementation plan (Docker dcron + localhost HTTP triggers + job modules + idempotent reminder tracking).


## 2025-12-19 - Populated tasks

Converted cron-driven proactive messaging plan into a detailed task list in tasks.md (phases 0-6: config, internal endpoints, jobs, schema, Docker cron, tests, rollout).


## 2025-12-19

Step 1: Add internal proactive router with security (commit 547ef56)

### Related Files

- /Users/kball/git/ai-in-action-bot/api/proactive-internal.js — Created internal router
- /Users/kball/git/ai-in-action-bot/config/index.js — Added proactive config
- /Users/kball/git/ai-in-action-bot/middleware/loopback-only.js — Created security middleware
- /Users/kball/git/ai-in-action-bot/server.js — Mounted router


## 2025-12-19

Step 2: Implement proactive messaging jobs and extend schema (commit ee57c1c)

### Related Files

- /Users/kball/git/ai-in-action-bot/api/proactive-internal.js — Connected to job functions
- /Users/kball/git/ai-in-action-bot/lib/proactive/ — Created proactive module with jobs and locks
- /Users/kball/git/ai-in-action-bot/models/scheduledSpeaker.js — Extended schema with reminders


## 2025-12-19

Step 3: Add Docker cron integration (commit bb258db)

### Related Files

- /Users/kball/git/ai-in-action-bot/Dockerfile — Added dcron and entrypoint
- /Users/kball/git/ai-in-action-bot/crontab — Added cron schedule
- /Users/kball/git/ai-in-action-bot/docker-entrypoint.sh — Created entrypoint script


## 2025-12-19

Step 4: Add unit tests for proactive messaging (commit 1c3f28d)

### Related Files

- /Users/kball/git/ai-in-action-bot/test/ — Added comprehensive test coverage


## 2025-12-19

Ticket closed


## 2025-12-22

Created design doc for interval-based scheduler migration to replace cron-based approach


## 2025-12-22

Implemented interval-based scheduler replacing cron-based approach: added lib/proactive/scheduler.js, updated config with schedule options, integrated with Discord client ready handler, added graceful shutdown, removed docker-entrypoint.sh and crontab, simplified Dockerfile

### Related Files

- /Users/kball/git/ai-in-action-bot/lib/proactive/scheduler.js — New interval-based proactive scheduler class

