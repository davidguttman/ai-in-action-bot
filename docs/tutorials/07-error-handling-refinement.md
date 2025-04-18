# Tutorial: Basic Error Handling & Refinement

This tutorial focuses on making the Discord bot more robust by adding basic error handling around Discord API calls and discussing refinements for state management.

**Goal:** Improve the bot's stability by catching potential errors during Discord interactions and consider edge cases in the conversation flow.

**Prerequisites:**

*   Completion of previous tutorials, resulting in a bot that can handle sign-ups and view the schedule.
*   Your Discord bot running with the code from the previous step.

---

## Step 1: Review Potential Failure Points (`lib/discord/index.js`)

Network issues, Discord API outages, permission problems, or unexpected bot states can cause errors. We should identify the key Discord API calls that might fail:

*   `message.startThread()`: Could fail due to permissions, channel type limitations, or API issues.
*   `thread.send()`: Could fail if the thread is deleted, archived, or due to permissions/API issues.
*   `message.reply()`: Could fail if the original message is deleted, or due to permissions/API issues.
*   Interactions with `activeSignups`: While not a Discord API call, accessing properties of `signupInfo` could fail if state is unexpectedly cleared.

---

## Step 2: Add `try...catch` Around Discord API Calls

Let's systematically wrap the critical Discord API calls within `try...catch` blocks in `lib/discord/index.js`.

1.  **Thread Creation (`sign_up` intent):**
    *   The existing code already has a `try...catch` around `message.startThread()` and the initial `thread.send()`. Ensure the error handling is sufficient (logging, maybe informing the user the thread couldn't be started).

    ```javascript
    // Inside messageCreate, within if (detectedIntent === 'sign_up')
      try {
        const thread = await message.startThread({ /* ... */ });
        console.log(`Created thread: ${thread.name} (${thread.id}) ...`);

        // Initial state storage (already done)
        activeSignups[thread.id] = { /* ... */ };
        console.log(`Stored initial state ...`);

        // Wrap the initial send in a try...catch as well, or rely on the outer catch
        try {
            await thread.send(`Hi ${message.author}, ... topic?`);
        } catch (sendError) {
            console.error(`Failed to send initial message to thread ${thread.id}:`, sendError);
            // Optionally try to inform the user in the main channel if the thread message failed
            // await message.reply("I created the thread, but couldn't send the first message.").catch(e => console.error("Failed to send secondary error reply:", e));
        }

      } catch (threadError) {
        console.error('Error creating thread or sending initial message:', threadError); // Log is important
        // Attempt to inform the user in the original channel
        try {
            await message.reply("Sorry, I couldn't start the sign-up thread. Please try again later or contact an admin.");
        } catch (replyError) {
            console.error('Failed to send thread creation error reply:', replyError);
        }
      }
    ```

2.  **Replying in Thread (`awaiting_topic` state):**
    *   Wrap the `message.reply()` call that proposes dates.

    ```javascript
    // Inside messageCreate, within thread handling, within if (signupInfo.state === 'awaiting_topic')
      try {
        // ... findAvailableFridays logic ...
        const proposalMessage = `Okay, your topic is ...`;
        try { // Inner try for the reply itself
            await message.reply(proposalMessage);
            // Update state only on successful reply
            signupInfo.state = 'awaiting_date_selection';
            console.log(`Updated state ...`);
            activeSignups[message.channel.id] = signupInfo; 
        } catch (replyError) {
             console.error(`Failed to send date proposal reply in thread ${message.channel.id}:`, replyError);
             // Don't update state if reply failed. Consider cleanup?
             // Maybe delete activeSignups[message.channel.id]; ?
        }
      } catch (error) { // Outer catch handles findAvailableFridays errors
        console.error(`Error processing topic or finding dates ...`, error);
        try {
           await message.reply("Sorry, something went wrong while trying to find available dates...");
        } catch (replyError) {
           console.error('Failed to send topic processing error reply:', replyError);
        }
        delete activeSignups[message.channel.id];
      }
    ```

3.  **Replying in Thread (`awaiting_date_selection` state):**
    *   Wrap the `message.reply()` calls for confirmation, conflict handling, ambiguity, and errors.

    ```javascript
    // Inside messageCreate, within thread handling, within else if (signupInfo.state === 'awaiting_date_selection')
      // ... LLM parsing logic ...
      try { // Outer try block for LLM + booking logic
          // ... LLM call ...
          if (selectedDateObject) {
             try { // Inner try for booking + confirmation reply
                 const bookingResult = await scheduleSpeaker({ /* ... */ });
                 if (bookingResult) {
                    const confirmationDateString = /* ... */;
                    try {
                       await message.reply(`Great! You're confirmed... ${confirmationDateString}.`);
                       delete activeSignups[message.channel.id]; 
                    } catch (replyError) {
                       console.error(`Failed to send confirmation reply in thread ${message.channel.id}:`, replyError);
                       // Booking succeeded but reply failed. State might be left hanging.
                       // Difficult to recover cleanly here. Logging is key.
                    }
                 } else { /* ... scheduleSpeaker returned falsy ... */ 
                    // Wrap replies in this block too
                 }
             } catch (bookingError) { 
                 // Conflict / DB Error handling
                 if (/* conflict */) {
                    // ... find new dates ...
                    try {
                        await message.reply(`Oops! ... updated available dates: ...`);
                    } catch (replyError) { /* log */ }
                 } else { /* other db error */ 
                    try {
                        await message.reply("Sorry, I encountered a database issue...");
                    } catch (replyError) { /* log */ }
                    delete activeSignups[message.channel.id];
                 }
             }
          } else { // Ambiguous parse
             // ... format original dates ...
             try {
                 await message.reply(`Sorry, I didn't quite catch that...`);
             } catch (replyError) { /* log */ }
          }
      } catch (llmError) { // Catch LLM errors
         console.error(`LLM error during date parsing ...`, llmError);
         try {
            await message.reply("Sorry, I'm having trouble understanding your choice...");
         } catch (replyError) { /* log */ }
      }
    ```

4.  **Replying for `view_schedule`:**
    *   Wrap the `message.reply()` call that shows the schedule or indicates no speakers.

    ```javascript
    // Inside messageCreate, within else if (detectedIntent === 'view_schedule')
     try {
        const upcomingSpeakers = await getUpcomingSchedule(limit);
        // ... formatting logic ...
        if (!upcomingSpeakers || upcomingSpeakers.length === 0) {
          try {
             await message.reply("There are currently no speakers scheduled.");
          } catch (replyError) { /* log */ }
        } else {
          // ... format schedule message ...
          try {
             await message.reply(scheduleMessage);
          } catch (replyError) { /* log */ }
        }
     } catch (dbError) {
        console.error('Database error retrieving schedule:', dbError);
        try {
            await message.reply("Sorry, I couldn't retrieve the schedule...");
        } catch (replyError) { /* log */ }
     }
    ```

5.  **Fallback Reply:**
    *   Wrap the final fallback reply.

    ```javascript
    // Inside messageCreate, within the final else for unrecognized intents
    else {
        console.log(`LLM did not return a recognized intent ...`);
        try {
            await message.reply("Sorry, I'm not sure how to help...");
        } catch (replyError) { /* log */ }
    }
    ```

**General Pattern:**
*   Place `try...catch` around the specific API call (`.reply()`, `.send()`, `.startThread()`).
*   Log the error within the `catch`.
*   *Optionally* attempt a `.reply()` within the `catch` block to inform the user, but wrap that secondary reply in its *own* `try...catch` that only logs, to prevent infinite loops if replying itself fails.
*   Consider the state implications: if an action fails, should the `activeSignups` state be cleaned up? Usually, yes, if the flow cannot proceed.

---

## Step 3: State Management Refinements (Discussion)

Our current `activeSignups = {}` works for basic cases but has limitations:

*   **Persistence:** If the bot restarts, all ongoing conversations are lost.
*   **Scalability:** In a very high-traffic bot (unlikely for this example), managing many states in memory could become an issue.
*   **Stale Entries:** If a user starts signing up but never finishes, their entry stays in `activeSignups` indefinitely.
*   **Race Conditions:** While low risk here, it's *theoretically* possible for simultaneous updates to the same thread's state to cause issues if not handled carefully (though `await` helps mitigate this).

**Potential Improvements (Beyond this Tutorial):**

1.  **Database Storage:** Store conversation state in a dedicated MongoDB collection (e.g., `ConversationStates`) keyed by `threadId` or `userId`. This provides persistence.
2.  **Timeouts:** Add a timestamp to the state entry (e.g., `lastUpdated: Date.now()`). Periodically (e.g., using `setInterval`), scan `activeSignups` and remove entries older than a certain threshold (e.g., 1 hour) to clean up stale conversations.

    ```javascript
    // Example state entry with timestamp
    activeSignups[thread.id] = {
      userId: message.author.id,
      state: 'awaiting_topic',
      lastUpdated: Date.now()
    };

    // Example cleanup function (run periodically)
    function cleanupStaleSignups() {
      const now = Date.now();
      const timeout = 60 * 60 * 1000; // 1 hour in milliseconds
      for (const threadId in activeSignups) {
        if (now - activeSignups[threadId].lastUpdated > timeout) {
          console.log(`Cleaning up stale signup state for thread ${threadId}`);
          delete activeSignups[threadId];
        }
      }
    }
    // setInterval(cleanupStaleSignups, 5 * 60 * 1000); // Run every 5 minutes
    ```

3.  **Unique State IDs:** Instead of just using `threadId`, use a more unique identifier if multiple interactions could potentially occur for the same thread/user simultaneously (less relevant for this specific workflow).

For this tutorial, we'll stick with the simple in-memory approach, but acknowledge these potential refinements.

---

## Step 4: Test Error Cases

Testing error handling can be tricky.

1.  **Permissions:** Temporarily revoke the bot's permission to create threads or send messages in a channel and try the commands.
2.  **Delete Messages/Threads:** Try deleting the original message or the thread while the bot is expecting a reply.
3.  **Simulate API Failure:** (Advanced) Use network tools or code modifications to simulate Discord API errors.
4.  **Check Logs:** The primary way to verify error handling is by checking the `console.error` logs when errors occur.

---

**Conclusion:**

By adding `try...catch` blocks around Discord API calls and logging errors, the bot becomes more resilient to unexpected issues. While the simple in-memory state management works for now, we've identified areas for future improvement regarding persistence and cleanup. Robust error handling is essential for creating reliable bots. 