# Tutorial: Discord - Implement View Schedule Command

This tutorial adds a new capability to the bot: allowing users to ask for the upcoming speaker schedule. We will leverage the existing LLM intent detection mechanism to understand the request and fetch/display the schedule using our scheduling logic.

**Goal:** Enable users to mention the bot and ask to see the schedule. The bot should detect the 'view_schedule' intent, retrieve upcoming speakers from the database, and format the information nicely for the user.

**Prerequisites:**

*   Completion of previous tutorials, including LLM intent detection (Step 3) and scheduling logic (`lib/schedulingLogic.js` with a `getUpcomingSchedule` function).
*   Your Discord bot running with the code incorporating the sign-up flow.

---

## Step 1: Prepare Scheduling Logic Integration (`lib/discord/index.js`)

Ensure the function to retrieve the schedule is available in the Discord bot file.

1.  **Navigate to `lib/discord/index.js`**.
2.  **Require `getUpcomingSchedule`:** Add this function to the require statement for `../schedulingLogic` if it's not already there.

    ```javascript
    // lib/discord/index.js (top of file)
    // ... other requires ...
    const { findAvailableFridays, scheduleSpeaker, getUpcomingSchedule } = require('../schedulingLogic') // Add getUpcomingSchedule
    // ... config, activeSignups, etc. ...
    ```

---

## Step 2: Implement 'view_schedule' Intent Handling (`lib/discord/index.js`)

We'll modify the main `messageCreate` listener where the bot handles mentions and performs initial intent detection.

1.  **Locate the Intent Detection Block:** Find the section within the `messageCreate` listener (outside the thread-specific logic) where the bot calls the LLM after being mentioned (`if (detectedIntent === 'sign_up') { ... }`).
2.  **Add Logic for `view_schedule`:** Add or modify the `else if` block to handle the `'view_schedule'` intent identified by the LLM.

    ```javascript
    // Inside the messageCreate listener, after the LLM call:
    // From: const detectedIntent = intentResponse?.trim().toLowerCase()
    //       console.log(`LLM detected intent: ${detectedIntent}`)

      if (detectedIntent === 'sign_up') {
        // ... existing sign-up thread creation logic ...
      } 
      // --- Add/Modify this block --- 
      else if (detectedIntent === 'view_schedule') {
          console.log('View schedule intent detected.')
          try {
            // Fetch upcoming schedule (e.g., limit to 5)
            const limit = 5;
            const upcomingSpeakers = await getUpcomingSchedule(limit);
            console.log(`Retrieved ${upcomingSpeakers.length} upcoming speakers.`);

            if (!upcomingSpeakers || upcomingSpeakers.length === 0) {
              await message.reply("There are currently no speakers scheduled.");
            } else {
              // Format the schedule for display
              const scheduleLines = upcomingSpeakers.map(speaker => {
                // Format the date nicely (using toLocaleDateString or similar)
                const formattedDate = speaker.scheduledDate.toLocaleDateString('en-US', { 
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
                });
                // Mention the user if possible, otherwise just show username
                // Note: Fetching member objects might be needed for mentions, 
                // falling back to username is safer.
                const userDisplay = speaker.discordUsername; // Safer fallback
                // const userDisplay = `<@${speaker.discordUserId}>`; // Requires user ID to be stored and potentially fetching member
                
                return `- ${formattedDate}: @${userDisplay}`; // Using @username format 
              });

              const scheduleMessage = `**Upcoming Speakers (Next ${limit}):**\n${scheduleLines.join('\n')}`;
              await message.reply(scheduleMessage);
            }
          } catch (dbError) {
            console.error('Database error retrieving schedule:', dbError);
            await message.reply("Sorry, I couldn't retrieve the schedule due to a database error.");
          }
      } 
      // --- Optional Fallback --- 
      else {
          console.log(`LLM did not return a recognized intent ('${detectedIntent}').`);
          // Optionally provide a helpful message for unrecognized intents
          await message.reply("Sorry, I'm not sure how to help with that. You can ask me to 'sign up to speak' or 'show the schedule'.");
      }

    // To: ... rest of the try block (LLM error handling) ...
    ```

**Explanation:**

1.  **Intent Check:** This logic runs *only* if the detected intent from the initial LLM call (when the bot is mentioned in a main channel) is specifically `'view_schedule'`.
2.  **Call `getUpcomingSchedule`:** It calls the function from `schedulingLogic`, potentially passing a limit (e.g., 5) for how many speakers to retrieve. Make sure your `getUpcomingSchedule` function accepts and uses this limit and sorts the results by date.
3.  **Handle No Results:** If the function returns an empty array, it informs the user.
4.  **Format Results:**
    *   If speakers are returned, it iterates (`map`) through the array.
    *   For each speaker, it formats the `scheduledDate` using `toLocaleDateString` for readability.
    *   It uses the stored `discordUsername` for display. *(Note: Using `<@${speaker.discordUserId}>` would create a proper mention, but requires storing the ID and potentially fetching the member object, which can be more complex. Using `@username` is simpler).*.
    *   It creates a list item string like `- [Formatted Date]: @[Username]`.
    *   It joins these lines into a single message with a header.
5.  **Reply:** Sends the formatted schedule (or the "no speakers" message) back to the user.
6.  **Database Error Handling:** Includes a `try...catch` block specifically for the `getUpcomingSchedule` call to handle potential database errors gracefully.
7.  **Fallback (Optional):** The final `else` block catches cases where the LLM returns something other than `'sign_up'` or `'view_schedule'`. It provides a helpful message guiding the user on valid commands.

---

## Step 3: Ensure `getUpcomingSchedule` Exists and Works

This tutorial assumes you have a working `getUpcomingSchedule` function in `lib/schedulingLogic.js`. If not, you'll need to create or modify it.

*   It should query your `ScheduledSpeaker` model.
*   It should filter for dates that are in the future (e.g., `scheduledDate: { $gte: new Date() }`).
*   It should sort the results by `scheduledDate` in ascending order (`sort({ scheduledDate: 1 })`).
*   It should accept an optional `limit` parameter and use it (`limit(limit)`).
*   It should return an array of speaker documents.

```javascript
// Example structure in lib/schedulingLogic.js
const ScheduledSpeaker = require('../models/scheduledSpeaker');

// ... other functions like findAvailableFridays, scheduleSpeaker ...

async function getUpcomingSchedule(limit = 5) { // Default limit
  try {
    const upcoming = await ScheduledSpeaker.find({
      scheduledDate: { $gte: new Date() } // Only future dates
    })
    .sort({ scheduledDate: 1 }) // Sort by earliest first
    .limit(limit); // Apply limit
    
    console.log(`[schedulingLogic] Found ${upcoming.length} upcoming speakers (limit ${limit}).`);
    return upcoming; 
  } catch (error) {
    console.error('[schedulingLogic] Error fetching upcoming schedule:', error);
    throw error; // Re-throw the error to be caught by the caller
  }
}

module.exports = {
  // ... other exports ...
  getUpcomingSchedule
};
```

---

## Step 4: Test the View Schedule Command

1.  **Restart your bot** with the updated code.
2.  **Ensure Data Exists:** Make sure you have some future-dated speaker entries in your database (you might need to add some manually or complete the sign-up flow a few times).
3.  **Ask for Schedule:** Mention the bot in a main channel and ask to see the schedule (e.g., `@YourBotName show the schedule`, `@YourBotName who is speaking next?`).
    *   **Verify:**
        *   LLM detects `view_schedule` intent (check logs).
        *   `getUpcomingSchedule` is called (check logs).
        *   The bot replies with the correctly formatted list of upcoming speakers (up to the limit).
        *   Dates and usernames are displayed correctly.
4.  **Test Empty Schedule:** Remove any future-dated entries from your database.
    *   Ask for the schedule again.
    *   **Verify:** The bot replies with "There are currently no speakers scheduled."
5.  **Test Unclear Intent:** Mention the bot with a message that isn't clearly sign-up or view schedule (e.g., `@YourBotName hello`, `@YourBotName tell me a joke`).
    *   **Verify:** The bot replies with the fallback message (e.g., "Sorry, I'm not sure how to help...").

---

**Conclusion:**

Your bot now has another useful feature! Users can easily check the upcoming speaker lineup by simply asking the bot. This leverages the existing intent detection and integrates smoothly with the scheduling data stored in your database. You've successfully expanded the bot's conversational capabilities beyond just the sign-up flow. 