# CLI Access to AI in Action Bot

## Summary
Build a chat‑first CLI that simulates Discord text channels, mentions, and threads so we can test the bot exactly like a Discord user would. It reuses existing intent + scheduling logic and exposes the same flows (mention to start, thread creation, date selection, schedule‑for‑others with mentions).

## Goals
- Keep business logic in one place (lib/schedulingLogic, lib/talkHistory, lib/llm).
- Add a thin CLI "chat adapter" that mirrors Discord message events.
- Prioritize free‑text chat with mentions and thread UX over structured subcommands.

## Approach (Ports & Adapters)
- Domain: reuse `lib/schedulingLogic.js` (find/schedule/cancel/getUpcoming), `lib/talkHistory.js`, and `lib/llm`.
- Adapters:
  - Discord (existing): `lib/discord/index.js`.
  - CLI chat (new): `bin/aiia-chat` (REPL entry), `lib/chat-sim/` (Discord shim) implementing the minimal pieces of discord.js the bot uses.
- Infrastructure: reuse `lib/mongo` + `config`. CLI runs with the same `.env` keys (notably `MONGO_URI`).

## Proposed Files & Scripts
- `bin/aiia-chat` (executable REPL): starts a chat session in a simulated guild/channel.
- `lib/chat-sim/`
  - `client.js`: minimal `Client` with `on/emit` for `MessageCreate` and `interaction` stubs.
  - `entities.js`: `User`, `Channel`, `ThreadChannel`, `Message` with methods used: `message.reply()`, `message.startThread()`, `channel.isThread()`, `client.users.fetch()`.
  - `render.js`: pretty prints channels/threads/messages to the console and assigns IDs.
- `lib/discord/handlers.js`: extract and export the message handler so both Discord and CLI can reuse it without changing logic.
- `package.json`:
  - `bin`: `{ "aiia-chat": "bin/aiia-chat" }`
  - scripts: `"chat": "node bin/aiia-chat"`

## UX Examples (Chat‑First)
- Start chat: `aiia-chat`
- Set active user: `/as @alice` (creates or selects user `alice`)
- Mention bot to begin: `@bot sign me up`
  - Bot: creates a thread and prints `Thread created: Speaker Sign-up - alice (t-1234)` and first prompt.
  - REPL auto‑switches to thread context `#t-1234>`.
  - You: `Topic: Building Agents`
  - Bot: prints 3 Friday options as numbered list; you reply `2`.
- Schedule for others: `@bot schedule @bob to speak about LLMs`
  - Bot: asks for topic, then offers dates; you select; bot books.
- View schedule: `@bot show schedule`
- Cancel: `@bot cancel my talk`
- Mentions: use `@username` or `<@123456789>`; both are parsed by the CLI.

## Implementation Notes
- Extraction: move the `Events.MessageCreate` handler body to `lib/discord/handlers.js` so the CLI can call it directly with simulated `message` objects (no logic changes).
- Discord shim: `lib/chat-sim/entities.js` implements only the methods/fields used (author.id/username, message.content, `message.reply()`, `message.startThread()`, `channel.isThread()`, `client.users.fetch()`, `guildId`, `channel.id/name`).
- Threads: `message.startThread()` creates a new `ThreadChannel` with an ID; CLI auto‑switches to that thread context and stores per‑thread state (mirrors `activeSignups`).
- Mentions: parse `@username` and `<@id>` to user IDs; maintain a simple in‑memory user registry; mark bots as `bot=true` to block scheduling bots.
- Guild scoping: expose `/guild <id>` to change current guild; default to `config.discord.guildId` so the same gating applies.
- LLM: unchanged; `OPENROUTER_API_KEY` required for intent parsing and topic/date checks.
- Mongo: unchanged; use existing `lib/mongo` and models; respect date normalization.

## Testing
- Add `test/chat-sim.test.js` using `mongodb-memory-server`; drive the REPL programmatically by feeding lines and asserting printed outputs.
- Cover: sign‑up flow with thread creation, schedule‑for‑others with mentions, duplicate date conflict handling, cancel, schedule listing formatting.

## Rollout
- Non‑breaking; Discord remains unchanged.
- Document in README: prerequisites (`.env`, `MONGO_URI`), install, and examples.
