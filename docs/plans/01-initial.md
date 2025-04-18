# Stream Speaker Scheduling Bot - Implementation Plan

This document outlines the step-by-step plan and corresponding LLM prompts for building the Stream Speaker Scheduling Bot based on the specifications in `../specs/01-initial.md`.

**Assumptions:**

*   A basic Node.js project structure exists (`package.json`, etc.).
*   Environment variables (`DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `MONGODB_URI`) will be managed externally (e.g., `.env` file, system environment).
*   Existing files like `lib/mongo/index.js`, `lib/discord/index.js`, `models/widget.js`, etc., will be modified or replaced as needed.
*   **Natural Language Processing:** All user intent recognition (sign-up, view schedule), date parsing, and bot reply generation will leverage the existing LLM integration via `lib/llm/index.js`. Simple keyword matching or separate NLP libraries should *not* be used.

---

## Step 1: Setup MongoDB Connection and Speaker Model

**Goal:** Establish MongoDB connection handling and define the data structure for scheduled speakers.

**Prompt:**

```text
Big D, update the MongoDB integration and define the data model for speaker scheduling.

1.  **Modify `lib/mongo/mongo.js`:**
    *   Ensure it exports functions `connectDB` and `disconnectDB`.
    *   The `connectDB` function should use the `MONGODB_URI` environment variable.
    *   Implement basic connection event listeners (connected, error, disconnected) that log messages.
2.  **Modify `lib/mongo/index.js`:**
    *   Require `mongoose`.
    *   Require `./mongo.js`.
    *   Export `connectDB`, `disconnectDB` from `./mongo.js`.
    *   Export `mongoose`.
3.  **Rename `models/widget.js` to `models/scheduledSpeaker.js`**.
4.  **Update `models/scheduledSpeaker.js`:**
    *   Require `mongoose` from `../lib/mongo`.
    *   Define a Mongoose schema named `scheduledSpeakerSchema` according to the specification:
        *   `discordUserId`: String, required
        *   `discordUsername`: String, required
        *   `topic`: String, required
        *   `scheduledDate`: Date, required
        *   `bookingTimestamp`: Date, default: `Date.now`
        *   `threadId`: String (optional)
    *   Add a unique index on the `scheduledDate` field. Set `unique: true` in the schema definition for `scheduledDate`.
    *   Ensure the `scheduledDate` specifically stores only the Date part (or handle comparisons carefully later). Consider using `set: v => v.setHours(0, 0, 0, 0)` in the schema type options if needed, though indexing might work correctly on the Date object directly in MongoDB.
    *   Create and export the Mongoose model: `mongoose.model('ScheduledSpeaker', scheduledSpeakerSchema)`.
5.  **Update `index.js` or `server.js` (main entry point):**
    *   Require `connectDB` from `./lib/mongo`.
    *   Call `connectDB()` near the start of the application initialization.
```

---

## Step 2: Implement Core Scheduling Logic

**Goal:** Create the functions responsible for finding available dates and managing speaker data in the database.

**Prompt:**

```text
Big D, create a new file `lib/schedulingLogic.js` to handle the core logic for finding available dates and interacting with the `ScheduledSpeaker` model.

1.  **Create `lib/schedulingLogic.js`:**
    *   Require the `ScheduledSpeaker` model from `../models/scheduledSpeaker`.
2.  **Implement `findAvailableFridays(count = 3)` function:**
    *   This function should find the next `count` Fridays that are *not* present in the `scheduledDate` field of the `scheduledSpeakers` collection.
    *   Get the current date.
    *   Iterate through upcoming dates, starting from the *next* Friday.
    *   For each Friday, check if a speaker is already scheduled for that date in the database.
        *   Query `ScheduledSpeaker.findOne({ scheduledDate: fridayDate })`. Remember to normalize the date to midnight (e.g., `date.setHours(0, 0, 0, 0)`) before querying if you didn't enforce it in the schema.
    *   If the date is free, add it to a list of available dates.
    *   Continue until `count` available Fridays are found.
    *   Return the array of available Date objects.
    *   Handle potential database errors gracefully (log and return an empty array or throw an error).
3.  **Implement `scheduleSpeaker({ discordUserId, discordUsername, topic, scheduledDate, threadId })` function:**
    *   This function takes speaker details and saves them to the database.
    *   Create a new `ScheduledSpeaker` instance with the provided data. Normalize `scheduledDate` to midnight if necessary.
    *   Call `.save()` on the instance.
    *   Return the saved document or relevant confirmation.
    *   Implement error handling, specifically for the unique index violation (date already booked). If a duplicate key error (code 11000) occurs on `scheduledDate`, return a specific error indicator (e.g., throw a custom error or return `null`/`false`). Handle other potential database errors.
4.  **Implement `getUpcomingSchedule(limit = 5)` function:**
    *   Query the `scheduledSpeakers` collection.
    *   Find speakers where `scheduledDate` is greater than or equal to the current date (normalized to midnight).
    *   Sort the results by `scheduledDate` in ascending order.
    *   Limit the results to `limit`.
    *   Return the array of scheduled speaker documents.
    *   Handle potential database errors.
5.  **Export all three functions:** `findAvailableFridays`, `scheduleSpeaker`, `getUpcomingSchedule`.
```

---

## Step 3: Discord - Detect Sign-up Intent & Create Thread

**Goal:** Modify the Discord bot to listen for messages mentioning it, detect a user's intent to sign up using the LLM, and create a private thread for the process.

**Prompt:**

```text
Big D, update the Discord bot interaction logic to handle speaker sign-up requests using the LLM for intent detection.

1.  **Modify `lib/discord/index.js` (or wherever the bot client is initialized and message listeners are set up):**
    *   Require the `completion` function from `../lib/llm/index.js`.
    *   Ensure the bot has `GUILD_MESSAGES` and `MESSAGE_CONTENT` intents enabled and is listening for the `messageCreate` event.
    *   In the `messageCreate` listener, check if the message mentions the bot (`message.mentions.has(client.user.id)`). Ignore messages from the bot itself.
    *   **Implement LLM-based intent recognition:** If the bot is mentioned, call the `completion` function from `lib/llm/index.js`.
        *   Provide a system message explaining the expected intents (e.g., "You are a helpful assistant determining user intent. The user might want to 'sign_up' to speak or 'view_schedule'. Respond with only the intent name.").
        *   Pass the user's message content as the prompt.
        *   Parse the LLM response to determine the intent (e.g., check if the response is exactly "sign_up").
    *   If sign-up intent is detected:
        *   Check if the message is in a thread already. If so, maybe ignore or reply that sign-up should start in the main channel.
        *   Use `message.startThread()` to create a new private thread (if possible, otherwise public is acceptable initially).
            *   Name the thread appropriately (e.g., "Speaker Sign-up - [Username]").
            *   Set `autoArchiveDuration`, perhaps 60 minutes.
        *   Send the initial prompt message *into the newly created thread*: "Hi [UserMention], thanks for offering to speak! To get you scheduled, could you please tell me your presentation topic?" (Use `thread.send()`).
    *   Handle potential errors during thread creation or message sending (e.g., permissions).
```

---

## Step 4: Discord - Collect Topic & Propose Dates

**Goal:** Listen for the user's topic reply in the thread and respond by proposing available dates.

**Prompt:**

```text
Big D, enhance the Discord bot to handle the conversation within the sign-up thread: collect the topic and propose dates.

1.  **Modify `lib/discord/index.js` (or the `messageCreate` listener):**
    *   Add logic to specifically handle messages *within* threads created by the bot for sign-up (you might need to store active sign-up thread IDs temporarily, perhaps in memory or associate state with the thread itself if the library supports it easily, or check the thread's starting message/name).
    *   **State Management (Simple):** When a thread is created (Step 3), store the `thread.id` and `message.author.id` along with a state like `'awaiting_topic'`. A simple in-memory object `let activeSignups = {};` where keys are `threadId` could work initially: `activeSignups[thread.id] = { userId: message.author.id, state: 'awaiting_topic' };`
    *   If a message is received in an active sign-up thread (`activeSignups[message.channel.id]`) from the correct user (`message.author.id === activeSignups[message.channel.id].userId`) and the state is `'awaiting_topic'`:
        *   Assume the message content is the topic. Store the topic: `activeSignups[message.channel.id].topic = message.content;`
        *   Require `findAvailableFridays` from `../lib/schedulingLogic.js`.
        *   Call `findAvailableFridays()` to get the next 3 available Friday dates.
        *   **Handle No Dates:** If `findAvailableFridays` returns an empty array or fewer than expected dates, send a message like: "Sorry, I couldn't find any available slots in the near future. Please check back later or contact an admin." Update state to `'done'` or remove the entry.
        *   **Format Dates:** Format the returned Date objects into a user-friendly string format (e.g., "Friday, October 27th, 2023"). Store these formatted strings *and* the original Date objects. `activeSignups[message.channel.id].proposedDates = availableDates;` (Store the Date objects).
        *   Send a message in the thread proposing the dates: "Okay, your topic is '[User's Topic]'. Here are the next available Fridays: 
1. [Formatted Date 1]
2. [Formatted Date 2]
3. [Formatted Date 3]
Which date works best for you?"
        *   Update the state for the thread: `activeSignups[message.channel.id].state = 'awaiting_date_selection';`
```

---

## Step 5: Discord - Handle Date Selection & Confirm Booking

**Goal:** Parse the user's date selection reply, confirm the booking, save it to the database, and handle potential conflicts.

**Prompt:**

```text
Big D, implement the date selection parsing (using the LLM) and booking confirmation logic within the Discord thread.

1.  **Modify `lib/discord/index.js` (or the `messageCreate` listener):**
    *   Add logic for the `'awaiting_date_selection'` state within active sign-up threads.
    *   Require the `completion` function from `../lib/llm/index.js` if not already required.
    *   If a message is received from the correct user in this state:
        *   Retrieve the `proposedDates` (the array of Date objects) stored for this thread (`activeSignups[message.channel.id].proposedDates`).
        *   **Implement LLM-based date parsing:**
            *   Prepare the list of proposed dates in a clear format (e.g., "1: YYYY-MM-DD", "2: YYYY-MM-DD", "3: YYYY-MM-DD").
            *   Call the `completion` function.
            *   Provide a system message like: "You are an assistant helping parse user date selection. Given the user's message and a list of proposed dates (format: 'Index: YYYY-MM-DD'), identify which date index (1, 2, or 3) the user selected. Respond with ONLY the number (1, 2, or 3) or 'clarify' if the selection is ambiguous or requests a different date."
            *   Provide the user's message and the formatted list of proposed dates in the prompt.
            *   Parse the LLM response. If it's a number (1, 2, or 3), map it back to the corresponding Date object from `proposedDates`. If it's 'clarify' or anything else, treat it as ambiguous.
        *   **If parsing is successful (LLM returned a valid index):**
            *   Retrieve the user's details (`message.author.id`, `message.author.username`) and the stored topic (`activeSignups[message.channel.id].topic`).
            *   Require `scheduleSpeaker` from `../lib/schedulingLogic.js`.
            *   Call `scheduleSpeaker` with the details: `{ discordUserId: userId, discordUsername: username, topic: topic, scheduledDate: selectedDateObject, threadId: message.channel.id }`.
            *   **Handle Booking Result:**
                *   If `scheduleSpeaker` succeeds (returns the saved document), send a confirmation message in the thread: "Great! You're confirmed to speak on '[Topic]' on [Formatted Confirmed Date].". Update state to `'done'` or remove the entry: `delete activeSignups[message.channel.id];`
                *   If `scheduleSpeaker` indicates a conflict (e.g., threw a specific error or returned `null`/`false` due to unique index violation):
                    *   Call `findAvailableFridays()` again to get *new* available dates.
                    *   Send a message like: "Oops! It looks like the date you selected ([Formatted Selected Date]) just got booked. Here are the updated available dates: \n1. [New Date 1]\n2. [New Date 2]\n3. [New Date 3]\nWhich of these works?". Keep the state as `'awaiting_date_selection'` and update `activeSignups[message.channel.id].proposedDates` with the new dates.
                *   If `scheduleSpeaker` fails for another database reason, send a generic error message: "Sorry, I encountered a database issue while trying to book your slot. Please try again later." Update state to `'done'` or remove the entry.
        *   **If parsing fails (LLM returned 'clarify' or was ambiguous):**
            *   Send a clarification message: "Sorry, I didn't quite catch that. Please tell me which of these dates works best: \n1. [Formatted Date 1]\n2. [Formatted Date 2]\n3. [Formatted Date 3]". Keep the state as `'awaiting_date_selection'`.
```

---

## Step 6: Discord - Implement View Schedule Command

**Goal:** Allow users to ask the bot to display the upcoming speaker schedule, using the LLM for intent detection.

**Prompt:**

```text
Big D, add functionality for users to view the upcoming speaker schedule, using the LLM for intent detection.

1.  **Modify `lib/discord/index.js` (or the `messageCreate` listener):**
    *   In the main message handler (where you check for bot mentions), reuse the LLM call from Step 3 if the intent wasn't 'sign_up'.
    *   Parse the LLM response from the initial intent check. If the intent is determined to be 'view_schedule':
        *   Require `getUpcomingSchedule` from `../lib/schedulingLogic.js`.
        *   Call `getUpcomingSchedule()` (e.g., with a limit of 5).
        *   **Handle Results:**
            *   If the function returns an empty array, send a message: "There are currently no speakers scheduled."
            *   If it returns speaker data:
                *   Format the data into a user-friendly list. Iterate through the results (which should be sorted by date).
                *   For each speaker, extract `scheduledDate` and `discordUsername`. Format the date nicely.
                *   Construct a message string like: "**Upcoming Speakers:**
- [Formatted Date 1]: @[Username1]
- [Formatted Date 2]: @[Username2]
..."
                *   Send the formatted message as a reply to the user's request (`message.reply(...)` or `message.channel.send(...)`).
            *   If the function encounters a database error, send a generic error message: "Sorry, I couldn't retrieve the schedule due to a database error."
    *   Optionally, add a fallback response if the LLM intent recognition doesn't clearly identify 'sign_up' or 'view_schedule' (e.g., "Sorry, I'm not sure how to help with that. You can ask me to 'sign up to speak' or 'show the schedule'.").
```

---

## Step 7: Basic Error Handling & Refinement

**Goal:** Add basic error handling for Discord API interactions and edge cases mentioned in the spec.

**Prompt:**

```text
Big D, let's add some basic error handling around the Discord interactions.

1.  **Review `lib/discord/index.js`:**
    *   Wrap potentially failing Discord API calls (`message.startThread`, `thread.send`, `message.reply`, etc.) in `try...catch` blocks.
    *   Inside the `catch` blocks, log the error (`console.error(error)`).
    *   Optionally, send a generic failure message to the user if appropriate (e.g., "Sorry, I encountered an error trying to [action]. Please try again."). Avoid sending error messages for minor issues if possible.
    *   Consider adding handling for the "No Available Dates" scenario in Step 4 more robustly if not already sufficient.
    *   Ensure the simple state management (`activeSignups`) handles potential race conditions gracefully (though for a simple bot, this might be low risk) or cleans up stale entries (e.g., after a certain time). *Note: A more robust solution would use the database or a dedicated state store.*
```

---

## Step 8: Testing Setup and Initial Tests

**Goal:** Ensure the testing framework (`tape`) is correctly set up and write initial unit/integration tests for the core scheduling logic.

**Prompt:**

```text
Big D, verify the testing environment using 'tape' and write initial tests for the scheduling logic.

1.  **Verify dev dependencies:** Ensure `tape`, `supertest`, and `mongodb-memory-server` are listed in `devDependencies` in `package.json`.
2.  **Verify `package.json` script:** Ensure the `test` script in `scripts` is `"NODE_ENV=test node test/index.js"` or similar, invoking the test runner.
3.  **Verify test runner (`test/index.js`):** Confirm this file correctly requires test files (e.g., using `glob` or similar) and handles overall setup/teardown, possibly including MongoDB memory server initialization and cleanup via helper functions (like those potentially in `test/helpers/`).
4.  **Create `test/schedulingLogic.test.js` (if not already present):**
    *   Require `test` from `tape`.
    *   Require `mongoose` (likely from `../lib/mongo`).
    *   Require the functions to test: `findAvailableFridays`, `scheduleSpeaker`, `getUpcomingSchedule` from `../lib/schedulingLogic.js`.
    *   Require the `ScheduledSpeaker` model from `../models/scheduledSpeaker`.
    *   **Leverage Runner/Helpers for Setup/Teardown:** Assume the test runner (`test/index.js`) or helper files handle the `MongoMemoryServer` setup and teardown. Individual test files typically don't need `test.before`/`test.after` for this if the runner manages it globally.
    *   **Write Initial Tests using `tape` syntax:**
        *   **`findAvailableFridays`:**
            *   Test case: No speakers scheduled, should return `count` (e.g., 3) future Fridays.
            *   Test case: One Friday is booked, should return the next `count` available Fridays, skipping the booked one.
            *   Test case: Add several bookings and verify the correct available dates are returned.
        *   **`scheduleSpeaker`:**
            *   Test case: Successfully schedule a speaker for an available date. Verify the returned document and check the database directly.
            *   Test case: Attempt to schedule a speaker for an *already booked* date. Verify it returns `null` or throws the expected error (based on the implementation) and *doesn't* add a duplicate entry.
        *   **`getUpcomingSchedule`:**
            *   Test case: No upcoming speakers, returns empty array.
            *   Test case: Add several speakers (past and future dates). Verify it returns only future speakers, sorted correctly, and respects the `limit`.
    *   **Cleanup:** Ensure each test cleans up any data it creates (e.g., `ScheduledSpeaker.deleteMany({})`) before calling `t.end()` to avoid interfering with other tests.
```

---

This breakdown provides a series of prompts to guide an LLM through the implementation, starting with the foundation and incrementally adding features and Discord interactions, utilizing `lib/llm/index.js` for natural language tasks. Each step builds upon the previous one. Remember to run `npm test` after relevant implementation steps.
