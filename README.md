# AI in Action Bot

This is a Discord bot designed to facilitate scheduling and potentially other AI-driven interactions within a Discord server. It leverages Large Language Models (LLMs) via OpenRouter and uses MongoDB for data persistence.

![thread example](https://p199.p4.n0.cdn.zight.com/items/kpur5QKm/6b9b4a9c-6b18-4f64-9e12-ef1038c7b012.png?v=48d8735515e5d82ca15cc2ea1c68a5c7)
## Features

*   **Discord Integration:** Interacts with users through Discord commands.
*   **LLM Capabilities:** Uses external LLM services (currently configured for OpenRouter) for tasks like processing natural language.
*   **Scheduling Logic:** Contains logic for scheduling events or speakers (details likely found in `lib/schedulingLogic.js` and `models/scheduledSpeaker.js`).
*   **Proactive Messaging:** Automatically sends talk reminders (T-1 day and day-of) via DM with thread fallback, and posts weekly schedule announcements to a configured channel. Runs via Docker cron triggering internal HTTP endpoints. Channel configuration via `/set-proactive-channel` Discord command (stored in MongoDB).
*   **MongoDB Persistence:** Stores scheduling information and potentially other data in a MongoDB database.
*   **Web Server:** Includes a basic web server (likely for health checks or simple API endpoints).

## Discord Commands

*   `/set-proactive-channel` - Configure the channel for weekly proactive announcements. Stores configuration in MongoDB for runtime updates without container restarts. Requires "Send Messages" permission in the target channel.

## Project Structure

```
.
├── Dockerfile          # Docker configuration
├── README.md           # This file
├── api/                # API route definitions (likely for the web server)
├── config/             # Configuration files (e.g., API keys, DB connection)
├── docs/               # Project documentation (plans, specs, tutorials)
├── index.js            # Main application entry point
├── lib/                # Core application logic
│   ├── discord/        # Discord bot specific logic (commands, connection)
│   ├── llm/            # LLM integration logic
│   ├── mongo/          # MongoDB connection and helper logic
│   └── schedulingLogic.js # Logic related to scheduling
├── middleware/         # Express middleware (e.g., authentication)
├── models/             # Mongoose models for database schemas
├── package.json        # Project dependencies and scripts
├── package-lock.json   # Exact dependency versions
├── server.js           # Web server setup (Express)
├── test/               # Automated tests
└── ttmp/               # Structured documentation managed by docmgr
    ├── _templates/     # Document templates
    ├── _guidelines/     # Writing guidelines
    └── YYYY/MM/DD/     # Ticket workspaces organized by date
```

## Getting Started

### Prerequisites

*   Node.js and npm
*   MongoDB instance (local or remote)
*   Discord Bot Token
*   OpenRouter API Key

### Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd ai-in-action-bot
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Configure environment variables: Create a `.env` file in the root directory and add the necessary variables (refer to `config/index.js` for required variables like `MONGODB_URI`, `DISCORD_TOKEN`, `OPENROUTER_API_KEY`, `CLIENT_ID`, `GUILD_ID`).

    Example `.env` file:
    ```dotenv
    MONGODB_URI=mongodb://localhost:27017/aiia-bot
    DISCORD_TOKEN=your_discord_bot_token
    OPENROUTER_API_KEY=your_openrouter_api_key
    CLIENT_ID=your_discord_client_id
    GUILD_ID=your_discord_guild_id
    ZOOM_LINK=https://zoom.us/j/yourmeetingid
    ZOOM_PASSWORD=yourpassword
    
    # Proactive messaging (optional)
    PROACTIVE_REMINDERS_ENABLED=true
    PROACTIVE_WEEKLY_ENABLED=true
    CRON_SECRET=optional_secret_for_multi_instance_deployments
    ```

### Running the Bot

1.  Deploy Discord commands:
    ```bash
    node lib/discord/deploy-commands.js
    ```
2.  Start the bot and server:
    ```bash
    npm start
    ```

## Running with Docker

1.  **Build the Docker image:**
    ```bash
    docker build -t ai-in-action-bot .
    ```

    The Docker image includes `dcron` for scheduled proactive messaging jobs. The entrypoint script (`docker-entrypoint.sh`) starts both cron and Node.js processes.

2.  **Run the Docker container:**

    You need to provide the necessary environment variables when running the container. Create a `.env` file as described in the Installation section.

    ```bash
    # Make sure your .env file is in the current directory
    docker run --env-file .env -p 3000:3000 --name aiia-bot-instance ai-in-action-bot
    ```

    *   `--env-file .env`: Loads environment variables from your `.env` file.
    *   `-p 3000:3000`: Maps port 3000 on your host to port 3000 in the container.
    *   `--name aiia-bot-instance`: Assigns a name to the container for easier management.

    The bot should now be running inside the Docker container. Both the Discord bot and cron daemon will be active.

3.  **Proactive Messaging Schedule:**

    When `PROACTIVE_REMINDERS_ENABLED=true` and `PROACTIVE_WEEKLY_ENABLED=true` are set, cron jobs run automatically:
    - **Talk reminders**: Daily at 16:00 UTC (sends T-1 day and day-of reminders)
    - **Weekly announcements**: Mondays at 15:00 UTC (posts upcoming schedule)

    To verify cron is running: `docker exec aiia-bot-instance ps aux | grep crond`

## Testing

Run the test suite:

```bash
npm test
```

### Testing Proactive Messaging

Proactive messaging functionality is tested through multiple test suites:

- **Unit tests** (`test/lib/proactive/jobs/`): Test job logic, idempotency, date normalization, and fallback behavior. See `test/lib/proactive/jobs/talkReminders.test.js` (tests T-1/day-of reminder selection, idempotency, disabled flag, DM failure fallback) and `test/lib/proactive/jobs/weeklyAnnouncement.test.js` (tests weekly announcement formatting with/without talks, CTA display).
- **Security tests** (`test/middleware/loopback-only.test.js`): Verify internal endpoint security (allows loopback IPv4/IPv6, rejects non-loopback without secret, allows non-loopback with valid secret).
- **Endpoint tests** (`test/api/proactive-internal.test.js`): Verify internal endpoints call job functions and enforce security requirements.
- **REPL testing** (`bin/test-proactive.js`): Test proactive messaging without Discord using the chat simulation client. Run with `npm run test-proactive` or `node bin/test-proactive.js`. Creates test talks, runs jobs, verifies results, and cleans up automatically.

To verify proactive messaging manually:
1. Create test talks in MongoDB (one for tomorrow, one for today)
2. Trigger endpoints: `curl -X POST http://127.0.0.1:3000/internal/proactive/check-reminders`
3. Verify DMs sent and reminder timestamps updated in MongoDB
4. Test idempotency by running the job again (should send 0 reminders)

## Documentation Management (docmgr)

This project sometimes uses [docmgr](https://github.com/go-go-golems/docmgr) to manage structured documentation in the `ttmp/` directory. Documentation is organized into ticket workspaces, each containing design docs, reference materials, playbooks, and implementation diaries.

### Common docmgr Commands

- **Create a ticket workspace:**
  ```bash
  docmgr ticket create-ticket --ticket TICKET-ID --title "Ticket Title" --topics topic1,topic2
  ```

- **Add a document to a ticket:**
  ```bash
  docmgr doc add --ticket TICKET-ID --doc-type design-doc --title "Design Document Title"
  ```

- **Relate files to a document:**
  ```bash
  docmgr doc relate --doc ttmp/.../reference/01-diary.md --file-note "/abs/path/to/file.js:Why this file matters"
  ```

- **Update changelog:**
  ```bash
  docmgr changelog update --ticket TICKET-ID --entry "What changed" --file-note "/path/to/file.js:Reason"
  ```

- **List tickets:**
  ```bash
  docmgr ticket tickets
  ```

- **Get help:**
  ```bash
  docmgr help how-to-use
  ```

### Documentation Structure

Each ticket workspace (`ttmp/YYYY/MM/DD/TICKET-ID--slug/`) contains:
- `index.md` - Ticket overview and entry point
- `tasks.md` - Task list
- `changelog.md` - History of changes
- `design-doc/` - Design documents and architecture notes
- `reference/` - Implementation diaries, API contracts, quick reference
- `playbook/` - Operational procedures and testing guides

Documentation uses frontmatter metadata for searchability and bidirectional code-to-doc linking.

## Contributing

Please refer to the documentation in the `docs/` directory for contribution guidelines, specifications, and tutorials. For ticket-based work, use docmgr to create and manage documentation workspaces. 