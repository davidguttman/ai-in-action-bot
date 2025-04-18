# AI in Action Bot

This is a Discord bot designed to facilitate scheduling and potentially other AI-driven interactions within a Discord server. It leverages Large Language Models (LLMs) via OpenRouter and uses MongoDB for data persistence.

![thread example](https://p199.p4.n0.cdn.zight.com/items/kpur5QKm/6b9b4a9c-6b18-4f64-9e12-ef1038c7b012.png?v=48d8735515e5d82ca15cc2ea1c68a5c7)
## Features

*   **Discord Integration:** Interacts with users through Discord commands.
*   **LLM Capabilities:** Uses external LLM services (currently configured for OpenRouter) for tasks like processing natural language or generating responses.
*   **Scheduling Logic:** Contains logic for scheduling events or speakers (details likely found in `lib/schedulingLogic.js` and `models/scheduledSpeaker.js`).
*   **MongoDB Persistence:** Stores scheduling information and potentially other data in a MongoDB database.
*   **Web Server:** Includes a basic web server (likely for health checks or simple API endpoints).

## Project Structure

```
.
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
└── test/               # Automated tests
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
    # Add any other required variables from config/index.js
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

## Testing

Run the test suite:

```bash
npm test
```

## Contributing

Please refer to the documentation in the `docs/` directory for contribution guidelines, specifications, and tutorials. 