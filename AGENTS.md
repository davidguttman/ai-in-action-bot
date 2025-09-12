# Repository Guidelines

## Project Structure & Module Organization
- `index.js` starts the Discord bot and HTTP server; `server.js` configures Express routes and errors.
- `lib/` contains core logic: `discord/` (bot, commands, deploy), `mongo/` (db), `llm/`, `schedulingLogic.js`, `talkHistory.js`.
- `api/` holds route handlers; `middleware/` includes auth and related middleware.
- `models/` defines Mongoose schemas.
- `config/` loads environment from `.env` and exports typed config.
- `test/` contains Tape tests (`**/*.test.js`), plus helpers and mocks.
- `docs/` holds additional documentation; `Dockerfile` builds a runnable image.

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
- Aim to cover routes, middleware, Mongo helpers, and Discord command logic with unit/integration tests.
- Cleanups run via `test/helpers/cleanup.js`; avoid relying on external services in tests.

## Commit & Pull Request Guidelines
- Commits: short, imperative subject; reference issues/PRs when relevant (e.g., "Update help message (#23)").
- PRs must include: concise description, linked issues, test coverage notes, local run steps, and screenshots/logs for Discord flows when applicable.
- Ensure `npm test` and `npm run lint` pass; if commands change, update README and `package.json` scripts.

## Security & Configuration
- Never commit secrets. Use `.env` (see `.env.example`). Required keys live in `config/index.js` (e.g., `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `OPENROUTER_API_KEY`, `MONGO_URI`).
- Validate configs at startup and prefer mocking in tests.
