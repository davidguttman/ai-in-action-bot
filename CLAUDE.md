# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Discord bot for the AI in Action community that facilitates speaker scheduling. It uses:
- Discord.js for bot functionality
- MongoDB with Mongoose for data persistence
- OpenRouter API for LLM integration
- Express.js for a minimal web server with health checks

## Key Commands

```bash
# Development
npm run dev          # Run with nodemon auto-restart
npm start           # Deploy Discord commands and start the bot
npm test            # Run the test suite

# Deployment & Build
npm run build       # Deploy Discord commands (alias for deploy-commands)
npm run deploy-commands  # Deploy Discord slash commands to Discord

# Code Quality
npm run lint        # Format code with prettier-eslint (no semicolons, single quotes)
```

## Architecture

### Core Components

1. **Discord Bot** (`lib/discord/index.js`):
   - Message-based interactions using @mentions for speaker signup flow
   - Thread-based signup process with state management
   - Intent detection via LLM for: sign_up, view_schedule, cancel_talk, query_talks, zoom_link
   - Active signup tracking in memory with thread-based conversations

2. **Scheduling Logic** (`lib/schedulingLogic.js`):
   - Finds available Fridays (normalized to midnight UTC)
   - Handles speaker booking with conflict detection
   - Manages upcoming schedule retrieval

3. **LLM Integration** (`lib/llm/index.js`):
   - Uses OpenRouter API with configurable models
   - Intent classification and natural language processing
   - Default model: openai/gpt-4o-mini

4. **Database** (`models/scheduledSpeaker.js`):
   - MongoDB schema with unique constraint on scheduledDate
   - Stores: discordUserId, discordUsername, topic, scheduledDate, threadId

### Environment Configuration

Required environment variables (see `config/index.js`):
- `DISCORD_TOKEN` - Bot authentication token
- `DISCORD_CLIENT_ID` - Discord application client ID  
- `DISCORD_GUILD_ID` - Target Discord server ID (bot only operates in this guild)
- `OPENROUTER_API_KEY` - API key for LLM requests
- `MONGODB_URI` - MongoDB connection string (defaults to localhost)
- `ZOOM_LINK` - Zoom meeting link to share when users request it
- `ZOOM_PASSWORD` - Zoom meeting password (optional)

### Key Workflows

1. **Speaker Signup Flow**:
   - User mentions bot with signup intent
   - Bot creates private thread and prompts for topic
   - Bot proposes available Friday dates
   - User selects date, bot confirms booking
   - Handles conflicts by re-proposing dates

2. **Error Handling**:
   - Wrapped Discord API calls to prevent crashes
   - Database conflict detection (duplicate booking attempts)
   - LLM error fallbacks with user-friendly messages

### Testing

Tests use tape and require MongoDB Memory Server. Test files follow the pattern `*.test.js` and can be run individually:

```bash
npm test                    # Run all tests
node test/index.js schedulingLogic.test.js  # Run specific test file
```

## Important Notes

- The bot is restricted to operate only in the configured guild (DISCORD_GUILD_ID)
- All dates are normalized to midnight UTC for consistency
- Thread-based signup state is maintained in memory (not persisted)
- Deploy Discord commands before first run or after command changes

## CI/CD Workflows

### Staging Reset Action
The repository includes a GitHub Action (`.github/workflows/reset-staging.yml`) that automatically resets the `staging` branch to match `main` whenever code is pushed to the main branch. This ensures staging always reflects the latest production code.