# Tutorial: Discord - Collect Topic & Propose Dates

This tutorial builds upon the previous step where a thread was created for user sign-up. Here, we'll enhance the bot to listen for the user's response (their presentation topic) within that specific thread and then propose available speaking dates based on our scheduling logic.

**Goal:** Listen for the user's topic reply in the sign-up thread, store it, find available dates using existing logic, and present these dates to the user within the same thread.

**Prerequisites:**

*   Completion of the previous tutorial ("Discord - Detect Sign-up Intent & Create Thread"), where the bot creates a thread upon detecting sign-up intent.
*   A functioning `lib/schedulingLogic.js` file containing the `findAvailableFridays` function (as created in a prior tutorial, e.g., "Scheduling Logic").
*   Your Discord bot running with the code from the previous step.

---

## Step 1: Enhance State Management (`lib/discord/index.js`)

We need a way to track the state of each sign-up conversation happening in the threads. A simple in-memory object is sufficient for this tutorial.

1.  **Navigate to `lib/discord/index.js`**.
2.  **Add an `activeSignups` object:** Place this near the top of the file, perhaps after your requires, but before the client initialization or event listeners. This object will store information about ongoing sign-ups, keyed by the thread ID.

    ```javascript
    // lib/discord/index.js (near top)
    // ... requires ...

    const activeSignups = {}; // Stores { threadId: { userId: string, state: string, topic?: string, proposedDates?: Date[] } }

    // ... client setup ...
    ```

3.  **Modify the Thread Creation Logic:** Update the part of your `messageCreate` listener where the thread is successfully created (from the previous tutorial) to store the initial state.

    ```javascript
    // Inside the messageCreate listener, after successfully creating the thread
    // From: console.log(`Created thread: ${thread.name} (${thread.id})`)

              console.log(`Created thread: ${thread.name} (${thread.id}) for user ${message.author.id}`)

              // Store initial state for this sign-up thread
              activeSignups[thread.id] = {
                userId: message.author.id,
                state: 'awaiting_topic'
              };
              console.log(`Stored initial state for thread ${thread.id}:`, activeSignups[thread.id])


              // Send initial prompt into the new thread
              await thread.send(`Hi ${message.author}, thanks for offering to speak! To get you scheduled, could you please tell me your presentation topic?`)

    // To: ... the rest of the try block ...
    ```

    **Explanation:**
    *   When a thread is created for a sign-up, we add an entry to `activeSignups`.
    *   The key is the `thread.id`.
    *   The value is an object containing the `userId` (to ensure we only listen to the original user) and the initial `state` set to `'awaiting_topic'`.

---

## Step 2: Handle Messages Within Active Threads (`lib/discord/index.js`)

Now, we need to add logic within the *same* `messageCreate` listener to specifically handle messages sent *inside* the threads we are tracking.

1.  **Require `findAvailableFridays`:** Make sure the scheduling logic is available.

    ```javascript
    // lib/discord/index.js (top of file)
    const { findAvailableFridays } = require('../schedulingLogic') // Adjust path if necessary
    // ... other requires ...
    ```

2.  **Add Thread Message Handling Logic:** Place this logic *inside* the `messageCreate` listener, *before* the existing logic that checks for bot mentions in main channels. This ensures we process thread messages first if applicable.

    ```javascript
    // lib/discord/index.js
    client.on(Events.MessageCreate, async (message) => {
      // Ignore bots
      if (message.author.bot) return

      // **NEW: Check if message is in an active sign-up thread**
      const signupInfo = activeSignups[message.channel.id];
      if (message.channel.isThread() && signupInfo && message.author.id === signupInfo.userId) {
        console.log(`Message received in active signup thread ${message.channel.id} from user ${message.author.id}`)

        // --- State: awaiting_topic ---
        if (signupInfo.state === 'awaiting_topic') {
          console.log('State is awaiting_topic. Processing message as topic.')
          const topic = message.content.trim();
          signupInfo.topic = topic; // Store the topic

          console.log(`Stored topic for thread ${message.channel.id}: "${topic}"`)

          try {
            const availableDates = findAvailableFridays(); // Get next 3 Fridays
            console.log(`Found available dates:`, availableDates)

            if (!availableDates || availableDates.length === 0) {
              console.log(`No available dates found for thread ${message.channel.id}.`)
              await message.reply("Sorry, I couldn't find any available slots in the near future. Please check back later or contact an admin.");
              // Clean up state - either delete or mark as done
              delete activeSignups[message.channel.id];
              // or: signupInfo.state = 'done';
              return; // Stop processing this message
            }

            // Store the actual Date objects
            signupInfo.proposedDates = availableDates;

            // Format dates for display (Example: Friday, October 27th, 2023)
            const formattedDates = availableDates.map((date, index) => {
              const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
              // Simple ordinal suffix logic (adjust as needed for perfect grammar)
              let day = date.getDate();
              let suffix = 'th';
              if (day % 10 === 1 && day !== 11) suffix = 'st';
              else if (day % 10 === 2 && day !== 12) suffix = 'nd';
              else if (day % 10 === 3 && day !== 13) suffix = 'rd';

              return `${index + 1}. ${date.toLocaleDateString('en-US', options).replace(/,\s\d{4}$/, `${suffix}, ${date.getFullYear()}`)}`;
              // Alternative simpler formatting:
              // return `${index + 1}. ${date.toDateString()}`;
            });

            const proposalMessage = `Okay, your topic is '**${topic}**'. Here are the next available Fridays:
${formattedDates.join('
')}
Which date works best for you? (Please reply with the number, e.g., '1')`;

            await message.reply(proposalMessage);

            // Update state
            signupInfo.state = 'awaiting_date_selection';
            console.log(`Updated state for thread ${message.channel.id} to awaiting_date_selection`)
            activeSignups[message.channel.id] = signupInfo; // Ensure update is saved if using simple object


          } catch (error) {
            console.error(`Error processing topic or finding dates for thread ${message.channel.id}:`, error);
            await message.reply("Sorry, something went wrong while trying to find available dates. Please try mentioning me again later.");
            // Consider cleanup or state reset here too
             delete activeSignups[message.channel.id];
          }
          return; // Stop processing this message further
        }

        // --- State: awaiting_date_selection ---
        else if (signupInfo.state === 'awaiting_date_selection') {
            console.log('State is awaiting_date_selection. Processing message as date choice.')
            // TODO: Implement logic to handle the user's date choice (e.g., '1', '2', '3')
            // This will be covered in the next tutorial (Step 5: Confirm Date)
             await message.reply("Thanks! Handling date selection will be in the next step.");
             // For now, just acknowledge and maybe clear state
             signupInfo.state = 'date_selected_pending_confirmation'; // Or 'done' for now
             console.log(`Date selection received (handler TBD). Updated state for thread ${message.channel.id} to ${signupInfo.state}.`)
             // delete activeSignups[message.channel.id]; // Or clear once fully confirmed
             return; // Stop processing
        }

        // --- Other States (Optional) ---
        else {
            console.log(`Message received in thread ${message.channel.id} with unhandled state: ${signupInfo.state}`)
            // Maybe send a generic "I'm waiting for X..." message or ignore.
        }

        // If the message in the thread wasn't handled by state logic, stop further processing.
        return;
      } // End of active sign-up thread check


      // **EXISTING: Check for bot mention in main channel (from previous tutorial)**
      if (!message.mentions.has(client.user.id)) return // Ignore messages not mentioning the bot directly *unless* in an active thread (handled above)

      // ... rest of your existing mention/intent detection logic ...
      // (Ensure the LLM call and thread creation logic only runs if it's NOT a thread message handled above)

    }); // End of messageCreate listener
    ```

**Explanation:**

1.  **Thread Check:** The listener *first* checks if the message channel is a thread (`message.channel.isThread()`) *and* if its ID exists as a key in our `activeSignups` object. It also verifies the message author is the same user who initiated the sign-up (`message.author.id === signupInfo.userId`).
2.  **State Check (`awaiting_topic`):** If the thread is active and the state is `'awaiting_topic'`, the bot proceeds:
    *   It assumes the message content is the topic and stores it in the `signupInfo` object.
    *   It calls `findAvailableFridays()` from the scheduling logic.
    *   **Error Handling:** If no dates are returned, it informs the user and cleans up the state (removes the entry from `activeSignups`).
    *   **Date Formatting:** It formats the returned `Date` objects into a numbered, user-friendly list (e.g., "1. Friday, October 27th, 2023"). *Important:* It stores the original `Date` objects in `signupInfo.proposedDates` for later use.
    *   **Proposal:** It sends a message back into the thread confirming the topic and listing the formatted dates, asking the user to choose.
    *   **State Update:** It updates the state for this thread to `'awaiting_date_selection'`.
3.  **State Check (`awaiting_date_selection`):** A placeholder is added to show where the logic for handling the user's date choice (e.g., replying with "1", "2", or "3") will go in the *next* tutorial. It currently just acknowledges the message and updates the state.
4.  **Return:** Crucially, after handling a message within an active thread, `return` is used to prevent the rest of the `messageCreate` listener (like the LLM intent detection for *new* sign-ups) from running for that message.
5.  **Existing Logic:** Your original logic for detecting mentions and creating threads should remain, but it will now only be reached if the message is *not* inside an active sign-up thread being handled by the new logic.

---

## Step 3: Test the Enhanced Flow

1.  **Restart your bot** with the updated `lib/discord/index.js` code.
2.  **Initiate Sign-up:** Mention the bot in a regular channel (e.g., `@YourBotName I want to sign up`).
    *   Verify the bot creates a new thread and prompts for the topic (as in the previous tutorial). Check `activeSignups` state is stored (via console logs).
3.  **Reply with Topic:** Go into the newly created thread and reply with a presentation topic (e.g., "My Awesome Presentation").
    *   Verify the bot logs that it received the message in the thread.
    *   Verify the bot correctly identifies the state as `awaiting_topic`.
    *   Verify the bot calls `findAvailableFridays` (check console logs for the function call and returned dates).
    *   Verify the bot replies in the thread, confirming the topic and listing the next 3 available Fridays in a numbered format.
    *   Verify the state for the thread is updated to `awaiting_date_selection` (check logs and `activeSignups`).
4.  **(Optional) Reply with Date Choice:** Reply to the date proposal in the thread (e.g., "1").
    *   Verify the bot enters the `awaiting_date_selection` block and sends the placeholder acknowledgement. State should be updated again.
5.  **Test Edge Cases:**
    *   Try sending another message in the thread *after* providing the topic but *before* choosing a date. Does the bot handle it gracefully (e.g., ignore it or repeat the date prompt based on the `awaiting_date_selection` state)?
    *   Have *another* user try to reply in the thread. The bot should ignore them because `message.author.id` won't match `signupInfo.userId`.
    *   Mention the bot in the *main channel* again while a thread sign-up is in progress. It should start a *new* sign-up process (create another thread).
    *   If `findAvailableFridays` might return no dates, test that scenario. Does the bot send the "Sorry, no slots" message and clear the state?

---

**Conclusion:**

Your Discord bot is now significantly more interactive! It can manage a simple conversation flow within dedicated threads. It collects necessary information (the topic), interacts with your scheduling logic to find available dates, and presents options back to the user. The state management system allows the bot to remember the context of each sign-up thread.

The next step will be to handle the user's final date selection within the `awaiting_date_selection` state.
