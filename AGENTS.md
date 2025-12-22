# Repository Guidelines

## Project Structure & Module Organization
- `index.js` starts the Discord bot and HTTP server; `server.js` configures Express routes and errors.
- `lib/` contains core logic: `discord/` (bot, commands, deploy), `mongo/` (db), `llm/`, `schedulingLogic.js`, `talkHistory.js`, `proactive/` (proactive messaging jobs).
- `api/` holds route handlers; `middleware/` includes auth and related middleware.
- `models/` defines Mongoose schemas.
- `config/` loads environment from `.env` and exports typed config.
- `test/` contains Tape tests (`**/*.test.js`), plus helpers and mocks.
- `docs/` holds additional documentation; `Dockerfile` builds a runnable image.
- `ttmp/` contains structured documentation managed by docmgr (ticket workspaces, design docs, implementation diaries).

## Build, Test, and Development Commands
- `npm start` — Deploys Discord commands then runs the app (`index.js`).
- `npm run dev` — Watches and restarts via `nodemon` (executes `npm start`).
- `npm run build` — Prepares bot slash-commands (`deploy-commands`).
- `npm run deploy-commands` — Registers Discord commands via REST.
- `npm test` — Runs Tape tests through `test/index.js`.
- `npm run lint` — Formats with Prettier + ESLint defaults (no semicolons, single quotes).

Examples:
- Run a single test: `npm test -- test/auth.test.js`
- Health check locally: `curl http://localhost:3000/health`

## Coding Style & Naming Conventions
- JavaScript (Node 18+ recommended). Use Prettier: 2‑space indent, single quotes, no semicolons.
- Prefer camelCase for files and identifiers; keep tests as `*.test.js`.
- Keep modules small and cohesive; colocate command handlers under `lib/discord/commands/`.

## Testing Guidelines
- Frameworks: Tape + Supertest + mongodb-memory-server.
- Test files end with `.test.js` under `test/` (subfolders allowed).
- Aim to cover routes, middleware, Mongo helpers, Discord command logic, and proactive messaging jobs with unit/integration tests.
- Cleanups run via `test/helpers/cleanup.js`; avoid relying on external services in tests.
- **Proactive messaging tests**: See `test/lib/proactive/jobs/`, `test/api/proactive-internal.test.js`, and `test/middleware/loopback-only.test.js`. Tests verify job logic, idempotency, security middleware, and endpoint behavior. Use `bin/test-proactive.js` for REPL-based testing without Discord.

## Interactive Testing With `bin/aiia-chat`
- Use the REPL script to simulate Discord conversations locally without the real bot.
- Launch it inside tmux so you can send commands programmatically while keeping the session running: `tmux new-session -d -s aiia './bin/aiia-chat'`. If the sandbox blocks tmux, request escalated permissions before running the command.
- Inspect output with `tmux capture-pane -pt aiia` (repeat to watch the conversation) or attach directly with `tmux attach -t aiia` for manual exploration.
- Send user or slash-command input with `tmux send-keys -t aiia '<message text>' Enter`; represent mentions exactly as in Discord (e.g., `@bot hi`).
- Switch simulated users with `/as @username`, move between threads with `/switch <parent-or-thread>`, and exit cleanly using `/quit`.
- When finished, close the REPL (`/quit`) or kill the tmux session: `tmux kill-session -t aiia`.

## Proactive Messaging
- **Architecture**: Docker cron (`dcron`) triggers localhost HTTP endpoints (`/internal/proactive/*`) that run jobs using the existing Discord client. Jobs are in `lib/proactive/jobs/` (talk reminders, weekly announcements).
- **Jobs**: `lib/proactive/jobs/talkReminders.js` sends T-1 day and day-of reminders via DM (with thread fallback). `lib/proactive/jobs/weeklyAnnouncement.js` posts weekly schedule to configured channel. Both jobs are idempotent (track sent timestamps in `ScheduledSpeaker.reminders`).
- **Channel Configuration**: Use `/set-proactive-channel` Discord command to configure the announcements channel. Configuration is stored in MongoDB (`GuildSettings` model) for runtime updates without container restarts.
- **Security**: Internal endpoints secured by `middleware/loopback-only.js` (allows loopback IPs, optional `X-Cron-Secret` header). Tests: `test/middleware/loopback-only.test.js` verifies IPv4/IPv6 loopback, rejects non-loopback without secret, allows non-loopback with valid secret.
- **Testing**: Unit tests in `test/lib/proactive/jobs/` verify job logic, idempotency, date normalization, and fallback behavior. Endpoint tests in `test/api/proactive-internal.test.js` verify security and job invocation. Use `bin/test-proactive.js` for REPL-based testing without Discord (creates test talks, runs jobs, verifies results).
- **Docker**: `Dockerfile` installs `dcron`; `docker-entrypoint.sh` starts cron alongside Node; `crontab` schedules jobs (daily reminders at 16:00 UTC, weekly announcements Mondays at 15:00 UTC).

## Commit & Pull Request Guidelines
- Commits: short, imperative subject; reference issues/PRs when relevant (e.g., "Update help message (#23)").
- PRs must include: concise description, linked issues, test coverage notes, local run steps, and screenshots/logs for Discord flows when applicable.
- Ensure `npm test` and `npm run lint` pass; if commands change, update README and `package.json` scripts.

## Documentation Management (docmgr)
- **Purpose**: Structured documentation in `ttmp/` organized by tickets with metadata, bidirectional code-to-doc linking, and searchability.
- **Workflow**: Use docmgr commands to create tickets, add documents, relate files, and update changelogs. Write document content in markdown with frontmatter metadata.
- **Common commands**:
  - `docmgr ticket create-ticket` - Create new ticket workspace
  - `docmgr doc add --ticket TICKET --doc-type TYPE --title "Title"` - Add document
  - `docmgr doc relate --doc PATH --file-note "/abs/path:Note"` - Link code files to docs
  - `docmgr changelog update --ticket TICKET --entry "Entry"` - Update changelog
  - `docmgr help how-to-use` - Full usage guide
- **Document types**: `design-doc`, `reference`, `playbook`, `tutorial`, `code-review`, etc.
- **Implementation diaries**: Use `reference` doc type for step-by-step implementation narratives. Follow diary format guidelines in `ttmp/_guidelines/reference.md`.
- **File relationships**: Always use absolute paths in `--file-note` for code-to-doc linking.

## Security & Configuration
- Never commit secrets. Use `.env` (see `.env.example`). Required keys live in `config/index.js` (e.g., `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `OPENROUTER_API_KEY`, `MONGO_URI`).
- **Proactive messaging config**: Optional env vars `PROACTIVE_REMINDERS_ENABLED`, `PROACTIVE_WEEKLY_ENABLED`, `CRON_SECRET`. See `config/index.js` for defaults. Channel configuration is stored in MongoDB via `/set-proactive-channel` command.
- Validate configs at startup and prefer mocking in tests.
- **Internal endpoints**: Routes under `/internal/proactive/*` are secured with loopback-only middleware (`middleware/loopback-only.js`). Tests verify security in `test/middleware/loopback-only.test.js` and `test/api/proactive-internal.test.js`.
