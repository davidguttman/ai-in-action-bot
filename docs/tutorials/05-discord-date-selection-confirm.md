# Tutorial: Discord - Handle Date Selection & Confirm Booking

This tutorial focuses on the final steps of the sign-up flow within the Discord thread. We'll parse the user's date choice using an LLM, attempt to book the slot using our scheduling logic, handle potential conflicts (like the date being booked by someone else), and confirm the booking with the user.

**Goal:** Parse the user's date selection reply in the sign-up thread, confirm the booking, save it to the database via `schedulingLogic`, handle conflicts, and provide appropriate feedback to the user.

**Prerequisites:**

*   Completion of the previous tutorial ("Discord - Collect Topic & Propose Dates"), where the bot proposes dates within the thread and waits for the user's choice (`awaiting_date_selection` state).
*   A functioning `lib/schedulingLogic.js` file containing both `findAvailableFridays` and `scheduleSpeaker` functions.
*   A functioning `lib/llm/index.js` with a `completion` function.
*   Your Discord bot running with the code from the previous step, including the `activeSignups` state management.

---

## Step 1: Prepare Scheduling Logic Integration (`lib/discord/index.js`)

We need to ensure the necessary functions from our scheduling and LLM modules are available in the Discord bot file.

1.  **Navigate to `lib/discord/index.js`**.
2.  **Require necessary functions:** Ensure `scheduleSpeaker` from `schedulingLogic` and `completion` from `llm` are required at the top of the file.

    ```javascript
    // lib/discord/index.js (top of file)
    // ... other requires like discord.js, fs, path ...
    const { completion } = require('../llm') // Should already be there from intent detection
    const { findAvailableFridays, scheduleSpeaker } = require('../schedulingLogic') // Add scheduleSpeaker
    // ... config, activeSignups, etc. ...
    ```

---

## Step 2: Implement Date Selection Logic (`lib/discord/index.js`)

Now, let's fill in the logic for the `awaiting_date_selection` state within the `messageCreate` listener.

1.  **Locate the `awaiting_date_selection` block:** Find the `else if (signupInfo.state === 'awaiting_date_selection')` block you added in the previous tutorial.
2.  **Replace placeholder with implementation:** Replace the existing placeholder logic with the LLM parsing and booking logic.

    ```javascript
    // Inside the messageCreate listener's thread handling logic
    // From: else if (signupInfo.state === 'awaiting_date_selection') { ... placeholder ... }

        // --- State: awaiting_date_selection ---
        else if (signupInfo.state === 'awaiting_date_selection') {
          console.log('State is awaiting_date_selection. Processing message as date choice.')
          const userReply = message.content.trim();
          const proposedDates = signupInfo.proposedDates; // Get the stored Date objects

          if (!proposedDates || proposedDates.length === 0) {
            console.error(`Error: No proposed dates found in state for thread ${message.channel.id} but state is awaiting_date_selection.`);
            await message.reply("Sorry, something went wrong, and I don't have the proposed dates anymore. Please try the sign-up process again.");
            delete activeSignups[message.channel.id];
            return;
          }

          // Format dates for LLM prompt (YYYY-MM-DD is unambiguous)
          const formattedDatesForLLM = proposedDates.map((date, index) => {
            return `${index + 1}: ${date.toISOString().split('T')[0]}`; // e.g., "1: 2023-10-27"
          }).join(', '); // e.g., "1: 2023-10-27, 2: 2023-11-03, 3: 2023-11-10"

          const systemMessage = `You are an assistant helping parse user date selection. Given the user's message and a list of proposed dates (format: 'Index: YYYY-MM-DD'), identify which date index (1, 2, or 3) the user selected. Respond with ONLY the number (1, 2, or 3) or 'clarify' if the selection is ambiguous or requests a different date. Dates available: ${formattedDatesForLLM}`;

          try {
            console.log(`Sending to LLM for date parsing. User message: "${userReply}". Dates: ${formattedDatesForLLM}`);
            const llmResponse = await completion({
                systemMessage: systemMessage,
                prompt: userReply
            });
            const parsedChoice = llmResponse?.trim();
            console.log(`LLM parsed choice: ${parsedChoice}`);

            let selectedDateObject = null;
            let selectedIndex = -1;

            if (parsedChoice === '1' || parsedChoice === '2' || parsedChoice === '3') {
              selectedIndex = parseInt(parsedChoice, 10) - 1;
              if (selectedIndex >= 0 && selectedIndex < proposedDates.length) {
                selectedDateObject = proposedDates[selectedIndex];
                console.log(`User selected index ${selectedIndex}, Date: ${selectedDateObject.toISOString()}`);
              } else {
                 console.warn(`LLM returned valid index ${parsedChoice} but it's out of bounds for proposedDates (length ${proposedDates.length})`);
                 // Treat as ambiguous if index is wrong
                 selectedDateObject = null; 
              }
            } else {
              console.log('LLM did not return a valid index (1, 2, or 3). Assuming ambiguous.');
              // Treat 'clarify' or anything else as ambiguous
            }

            // --- Handle Successful Parsing ---
            if (selectedDateObject) {
              const userId = message.author.id;
              const username = message.author.username;
              const topic = signupInfo.topic;
              const threadId = message.channel.id;

              console.log(`Attempting to book slot for ${username} (${userId}) on ${selectedDateObject.toISOString()} for topic "${topic}" in thread ${threadId}`);

              try {
                const bookingResult = await scheduleSpeaker({ 
                  discordUserId: userId, 
                  discordUsername: username, 
                  topic: topic, 
                  scheduledDate: selectedDateObject,
                  threadId: threadId
                });

                if (bookingResult) {
                  // SUCCESS!
                  const confirmationDateString = selectedDateObject.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                  await message.reply(`Great! You're confirmed to speak on '**${topic}**' on ${confirmationDateString}.`);
                  console.log(`Booking confirmed for thread ${threadId}. Removing state.`);
                  delete activeSignups[threadId]; // Cleanup state
                } else {
                  // This else block might not be reachable if scheduleSpeaker throws on conflict
                  // Kept for robustness, but primary conflict handling is in the catch block
                  console.warn(`scheduleSpeaker returned falsy value for thread ${threadId}, expected either success or error.`);
                  await message.reply("Hmm, something unexpected happened while booking. Let's try finding new dates.");
                   // Get new dates and re-propose (similar to conflict handling)
                  const newAvailableDates = findAvailableFridays();
                  if (!newAvailableDates || newAvailableDates.length === 0) {
                     await message.reply("Sorry, I couldn't find any available slots right now. Please try signing up again later.");
                     delete activeSignups[threadId];
                  } else {
                     signupInfo.proposedDates = newAvailableDates;
                     const formattedNewDates = newAvailableDates.map((date, index) => { /* ... formatting logic ... */ return `${index + 1}. ${date.toLocaleDateString(...) }`; }); // Use same formatting as before
                     await message.reply(`It seems there was an issue. Here are the updated available dates:
${formattedNewDates.join('\n')}
Which of these works?`);
                     // State remains 'awaiting_date_selection'
                  }
                }
              } catch (bookingError) {
                // CONFLICT HANDLING (Assuming scheduleSpeaker throws specific error type or code for conflicts)
                // Modify this condition based on how scheduleSpeaker signals a conflict (e.g., error.code, error.message)
                if (bookingError.message && bookingError.message.includes('duplicate key') || bookingError.code === 11000) { // Example check for MongoDB duplicate key error
                   console.log(`Conflict detected for thread ${threadId} on date ${selectedDateObject.toISOString()}. Finding new dates.`);
                   const selectedDateString = selectedDateObject.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
                   
                   // Get *new* dates
                   const newAvailableDates = findAvailableFridays();
                   
                   if (!newAvailableDates || newAvailableDates.length === 0) {
                      await message.reply(`Oops! It looks like the date you selected (${selectedDateString}) just got booked, and unfortunately, I couldn't find any other slots right now. Please try signing up again later.`);
                      delete activeSignups[threadId];
                   } else {
                      signupInfo.proposedDates = newAvailableDates; // Update state with new dates
                      activeSignups[threadId] = signupInfo; // Save the updated state

                      // Format new dates for display (reuse formatting logic)
                      const formattedNewDates = newAvailableDates.map((date, index) => {
                        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
                        let day = date.getDate();
                        let suffix = 'th';
                        if (day % 10 === 1 && day !== 11) suffix = 'st'; else if (day % 10 === 2 && day !== 12) suffix = 'nd'; else if (day % 10 === 3 && day !== 13) suffix = 'rd';
                        return `${index + 1}. ${date.toLocaleDateString('en-US', options).replace(/,\s\d{4}$/, `${suffix}, ${date.getFullYear()}`)}`;
                      });

                      await message.reply(`Oops! It looks like the date you selected (${selectedDateString}) just got booked. Here are the updated available dates:
${formattedNewDates.join('\n')}
Which of these works?`);
                      // State remains 'awaiting_date_selection'
                   }
                } else {
                  // OTHER DB ERROR
                  console.error(`Database error during booking for thread ${threadId}:`, bookingError);
                  await message.reply("Sorry, I encountered a database issue while trying to book your slot. Please try again later.");
                  delete activeSignups[threadId]; // Cleanup state on error
                }
              }
            } 
            // --- Handle Ambiguous Parsing ---
            else {
              console.log(`Date selection ambiguous for thread ${threadId}. Asking for clarification.`);
              // Re-format original proposed dates for the clarification message
              const formattedOriginalDates = proposedDates.map((date, index) => {
                 // ... Use same formatting logic as in the 'awaiting_topic' state ...
                 const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
                 let day = date.getDate();
                 let suffix = 'th';
                 if (day % 10 === 1 && day !== 11) suffix = 'st'; else if (day % 10 === 2 && day !== 12) suffix = 'nd'; else if (day % 10 === 3 && day !== 13) suffix = 'rd';
                 return `${index + 1}. ${date.toLocaleDateString('en-US', options).replace(/,\s\d{4}$/, `${suffix}, ${date.getFullYear()}`)}`;
              });
              await message.reply(`Sorry, I didn't quite catch that. Please tell me which of these dates works best by replying with the number (1, 2, or 3):
${formattedOriginalDates.join('\n')}`);
              // State remains 'awaiting_date_selection'
            }

          } catch (llmError) {
            console.error(`LLM error during date parsing for thread ${message.channel.id}:`, llmError);
            await message.reply("Sorry, I'm having trouble understanding your choice right now. Please try again.");
            // State remains 'awaiting_date_selection'
          }
          return; // Stop processing this message
        }

    // To: ... rest of the thread handling logic (other states) ...
    ```

**Explanation:**

1.  **Retrieve State:** Get the user's reply and the `proposedDates` (array of `Date` objects) stored in `signupInfo`.
2.  **Format for LLM:** Convert the `proposedDates` into a simple, unambiguous format (like `YYYY-MM-DD`) for the LLM prompt. This makes it easier for the LLM to match the user's input.
3.  **LLM Call:**
    *   Construct a `systemMessage` clearly explaining the task: extract the index (1, 2, or 3) or respond with 'clarify'. Include the formatted dates in the system message for context.
    *   Call the `completion` function with the system message and the user's reply.
4.  **Parse LLM Response:**
    *   Check if the response is exactly '1', '2', or '3'.
    *   If yes, convert it to a zero-based index and retrieve the corresponding `Date` object from the *original* `proposedDates` array.
    *   If no (or if the index is invalid), treat the selection as ambiguous.
5.  **Successful Parse (`selectedDateObject` is not null):**
    *   Gather necessary details: `userId`, `username`, `topic` (from `signupInfo`), the `selectedDateObject`, and the `threadId`.
    *   Call `scheduleSpeaker` with these details.
    *   **Booking Success:** If `scheduleSpeaker` returns successfully (e.g., returns the created document), send a confirmation message to the user with the formatted date, and *delete* the state from `activeSignups` to conclude the flow.
    *   **Booking Conflict (Catch Block):** If `scheduleSpeaker` throws an error indicating a conflict (specifically check for errors like MongoDB's duplicate key error `11000`), inform the user the date was just taken. Call `findAvailableFridays()` *again* to get fresh dates. If new dates are found, update `signupInfo.proposedDates`, save the updated state, and re-prompt the user with the new dates. If no new dates are found, inform the user and clear the state. The state remains `'awaiting_date_selection'`. *Note: You might need to adjust the conflict detection based on how your `scheduleSpeaker` function signals conflicts.*.
    *   **Other Booking Error:** If `scheduleSpeaker` fails for other reasons, inform the user of a generic database error and clear the state.
6.  **Ambiguous Parse (`selectedDateObject` is null):**
    *   If the LLM returned 'clarify' or an unrecognized response, send a message asking the user to clarify their choice, re-listing the *original* proposed dates (formatted nicely this time). The state remains `'awaiting_date_selection'`.
7.  **LLM Error:** Include a `catch` block for the LLM call itself, informing the user if the LLM fails.

---

## Step 3: Refine Formatting (Helper Function - Optional)

The date formatting logic is used in multiple places (proposing dates, handling conflicts, asking for clarification). You could extract this into a helper function for cleaner code.

1.  **Create a Helper Function:** Define a function (e.g., `formatDatesForDisplay`) maybe within `lib/discord/index.js` or a separate utility file.

    ```javascript
    // Example Helper Function (place appropriately)
    function formatDatesForDisplay(dates) {
      if (!dates || dates.length === 0) return '';
      return dates.map((date, index) => {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        let day = date.getDate();
        let suffix = 'th';
        if (day % 10 === 1 && day !== 11) suffix = 'st';
        else if (day % 10 === 2 && day !== 12) suffix = 'nd';
        else if (day % 10 === 3 && day !== 13) suffix = 'rd';
        return `${index + 1}. ${date.toLocaleDateString('en-US', options).replace(/,\s\d{4}$/, `${suffix}, ${date.getFullYear()}`)}`;
      }).join('\n');
    }
    ```

2.  **Use the Helper:** Call this function wherever you need to format the list of dates for user messages.

    ```javascript
    // Example usage in 'awaiting_topic' state
    const formattedDates = formatDatesForDisplay(availableDates);
    const proposalMessage = `Okay, your topic is... Here are the dates:\n${formattedDates}\nWhich works?`;
    
    // Example usage in conflict handling
     const formattedNewDates = formatDatesForDisplay(newAvailableDates);
     await message.reply(`Oops!... Updated dates:\n${formattedNewDates}\nWhich works?`);
     
    // Example usage in clarification
    const formattedOriginalDates = formatDatesForDisplay(proposedDates);
    await message.reply(`Sorry... Choose from:\n${formattedOriginalDates}`);
    ```

---

## Step 4: Test the Complete Flow

Thorough testing is crucial here.

1.  **Restart your bot** with the updated code.
2.  **Full Sign-up:**
    *   Mention the bot to sign up.
    *   Reply with a topic in the thread.
    *   Receive the date proposal.
    *   Reply with a valid date choice (e.g., "1", "The first one", "Number 2 please").
    *   **Verify:**
        *   LLM parses correctly (check logs).
        *   `scheduleSpeaker` is called with correct details (check logs).
        *   Booking succeeds in the database (check your DB or logs from `scheduleSpeaker`).
        *   User receives the confirmation message.
        *   The `activeSignups` state for the thread is cleared (check logs or inspect the object if possible).
3.  **Test Ambiguity:**
    *   Reply to the date proposal with something unclear (e.g., "Next week", "Friday", "None of those").
    *   **Verify:**
        *   LLM returns 'clarify' or similar (check logs).
        *   User receives the clarification message, listing the *original* dates again.
        *   State remains `'awaiting_date_selection'`.
4.  **Test Conflict:** (This is harder to test reliably without manually creating a conflict).
    *   *If possible:* Quickly sign up with another user (or manually insert a DB record) for one of the proposed dates *after* the dates are proposed but *before* the first user replies.
    *   Have the first user select the now-conflicting date.
    *   **Verify:**
        *   `scheduleSpeaker` detects the conflict (check logs for the specific error).
        *   User receives the "Oops! Date just got booked" message.
        *   `findAvailableFridays` is called again.
        *   User is presented with *new* available dates.
        *   State remains `'awaiting_date_selection'` with the *updated* proposed dates.
5.  **Test No New Dates on Conflict:**
    *   Similar to conflict test, but ensure `findAvailableFridays` will return empty *after* the conflict.
    *   **Verify:** User receives the "Oops... and couldn't find any other slots" message, and the state is cleared.
6.  **Test Edge Cases:**
    *   What if `proposedDates` is missing from state (it shouldn't happen, but test)?
    *   What if the LLM throws an error?
    *   What if `scheduleSpeaker` throws an unexpected database error (not a conflict)?

---

**Conclusion:**

You have now implemented the core conversational logic for scheduling! The bot can guide a user through selecting a topic, choosing a date, and confirming their booking, even handling common issues like ambiguity and scheduling conflicts. State management tracks the conversation, and the LLM assists in understanding user input for date selection. Future enhancements could involve allowing users to view the schedule, cancel bookings, or handle more complex date requests. 