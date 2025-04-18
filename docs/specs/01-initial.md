## Stream Speaker Scheduling Bot Specification

**1. Introduction & Goal**

The goal of this Discord bot is to automate the process of scheduling speakers for a recurring weekly stream. It replaces the current spreadsheet-based manual system, allowing users to sign up, provide their details, select a date, and view the upcoming schedule directly within Discord.

**2. Core Features**

*   **Speaker Sign-up:** Users can initiate the sign-up process using natural language.
*   **Information Collection:** The bot gathers the speaker's topic and preferred dates.
*   **Automated Scheduling:** The bot proposes available dates and confirms the booking with the user.
*   **Schedule Viewing:** Users can ask the bot to display the upcoming schedule.

**3. Detailed Workflows**

*   **A. Speaker Sign-up & Scheduling Flow:**
    1.  **Trigger:** A user mentions the bot in a channel using natural language that indicates they want to sign up as a speaker (e.g., `@BotName I'd like to speak on the stream`).
    2.  **Bot Action (Thread Creation):** The bot creates a private thread starting from the user's sign-up message.
    3.  **Bot Action (Information Request):** The bot replies within the newly created thread, welcoming the user and asking for their presentation `topic`.
    4.  **User Action (Topic):** The user replies in the thread with their topic.
    5.  **Bot Action (Date Proposal):**
        *   The bot queries the `scheduledSpeakers` collection in the MongoDB database to find dates that already have speakers scheduled.
        *   It identifies the next 3 upcoming Fridays that are *not* booked.
        *   The bot replies in the thread, presenting these 3 available Friday dates as options.
    6.  **User Action (Date Selection):** The user replies in the thread using natural language to indicate their preferred date from the options provided (e.g., "The first one works", "How about the 15th?", "None of those work, any other options?").
    7.  **Bot Action (Date Parsing & Clarification):**
        *   The bot uses Natural Language Processing (NLP) to interpret the user's response and identify which date (if any) they selected from the proposed options.
        *   If the bot cannot confidently determine the user's choice or if the user asks for unavailable dates/more options, it replies in the thread asking for clarification (e.g., "Sorry, I didn't quite catch that. Which of these dates works best: [Date1], [Date2], [Date3]?"). This loop repeats until a valid proposed date is clearly selected.
    8.  **Bot Action (Confirmation & Persistence):**
        *   Once the user clearly confirms one of the available, proposed dates, the bot replies in the thread confirming the booking: "Great! You're confirmed to speak on [Topic] on [Confirmed Date].".
        *   The bot saves the booking details to the MongoDB database. (See Data Model below).

*   **B. Schedule Viewing Flow:**
    1.  **Trigger:** A user mentions the bot in a channel using natural language asking to see the schedule (e.g., `@BotName show me the upcoming speaker schedule`).
    2.  **Bot Action (Database Query):** The bot queries the `scheduledSpeakers` collection in MongoDB, fetching upcoming scheduled speakers sorted by date.
    3.  **Bot Action (Display Schedule):** The bot replies in the channel (or potentially the thread if the request originated there) with a message listing the next 5 scheduled speakers (or fewer, if less than 5 are booked). The format should clearly show the date and the speaker's username for each entry (e.g., "Upcoming Speakers:\n- [Date1]: @[Username1]\n- [Date2]: @[Username2]\n...").

**4. Architecture & Technology**

*   **Platform:** Discord Bot
*   **Language/Framework:** Node.js
*   **Database:** MongoDB
*   **Discord Interaction:** `discord.js` library (based on existing `llm.js` command)
*   **Natural Language Processing (NLP):** A suitable Node.js library (e.g., `compromise`, `natural`) or potentially leverage the existing LLM infrastructure (`lib/llm.js`) if feasible for intent recognition (sign-up, view schedule) and date selection parsing. Initial implementation might use simpler keyword/regex matching.

**5. Data Model (MongoDB)**

*   **Collection:** `scheduledSpeakers`
*   **Document Schema:**
    ```json
    {
      "discordUserId": "string", // User's Discord ID
      "discordUsername": "string", // User's Discord username at time of booking
      "topic": "string", // Speaker's topic
      "scheduledDate": "Date", // ISODate format (YYYY-MM-DD) representing the Friday they are scheduled. Ensure only the date part is relevant for uniqueness.
      "bookingTimestamp": "Date", // ISODate format (Timestamp when booking was confirmed)
      "threadId": "string" // Optional: Discord ID of the thread used for scheduling
    }
    ```
*   **Index:** Create a unique index on `scheduledDate` to prevent double-booking the same Friday.

**6. Error Handling**

*   **Ambiguous NLP Input:** If the bot cannot understand user input after asking for clarification, it should respond with a message like, "Sorry, I'm having trouble understanding. Could you please rephrase, or perhaps ask an admin for help?".
*   **Database Errors:** Catch potential errors during database operations (connection, reads, writes). Log the error internally. Respond to the user with a generic failure message: "Sorry, I encountered a database issue while processing your request. Please try again later."
*   **Scheduling Conflict (Race Condition):** Rely on the unique index on `scheduledDate` in MongoDB. If an insert fails due to the date already existing (caught during the confirmation step), inform the user in the thread that the date just became unavailable and re-prompt with newly fetched available dates.
*   **Discord API Errors:** Implement standard error handling for Discord API interactions (e.g., logging, potential retries for rate limits if applicable). Inform the user if a Discord-related error prevents action completion.
*   **No Available Dates:** If the bot cannot find 3 available Fridays within a reasonable future timeframe (e.g., next 3-6 months), it should inform the user that no slots seem available soon and perhaps suggest contacting an admin.

**7. Testing Plan (Node.js Environment)**

*   **Unit Tests (`tape` or `ava`):**
    *   Mock MongoDB interactions (`mongodb-memory-server` or similar).
    *   Test the logic for finding the next 3 available Fridays based on mock data.
    *   Test the NLP/parsing logic for sign-up intent detection with various inputs.
    *   Test the NLP/parsing logic for date selection with various inputs (confirming, rejecting, asking for clarification).
    *   Test the database schema validation and insertion logic.
    *   Test the schedule formatting logic.
*   **Integration Tests:**
    *   Use a test MongoDB instance.
    *   Mock the `discord.js` client interactions.
    *   Test the end-to-end flow for signing up and getting scheduled, verifying thread creation, messages, and database state changes.
    *   Test the end-to-end flow for viewing the schedule, verifying database queries and response formatting.
*   **End-to-End Testing (Manual):**
    *   Deploy the bot to a dedicated test Discord server/channel.
    *   Interact with the bot as a user:
        *   Sign up using different natural language phrases.
        *   Provide a topic.
        *   Respond to date prompts: select valid dates, respond ambiguously, ask for other dates.
        *   Verify bot's clarification messages and final confirmation.
        *   Check the MongoDB database manually to confirm data persistence.
        *   Ask to view the schedule using different phrases.
        *   Verify the schedule output is correct and matches the database state.
        *   Attempt to sign up for a date that is already taken.
*   **Test Execution:** Ensure all automated tests (`npm test`) run cleanly and exit without hanging processes (e.g., open database connections).

