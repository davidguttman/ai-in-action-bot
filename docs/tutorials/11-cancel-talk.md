# Tutorial: Discord - Allow Users to Cancel Their Talk

This tutorial adds a new capability allowing users to cancel their scheduled talk via a Discord command.

**Goal:** Provide users with a self-service option to remove themselves from the speaking schedule if their plans change.

**Prerequisites:**

*   Completion of previous tutorials, especially those setting up the initial sign-up (`04`, `05`) and schedule viewing (`06`, `09`).
*   The `ScheduledSpeaker` model (`models/scheduledSpeaker.js`) exists.
*   The `lib/schedulingLogic.js` file contains functions to interact with the `ScheduledSpeaker` model.
*   The `lib/discord/index.js` file handles message creation events and intent detection using the LLM.

---

## Step 1: Define the 'cancel_talk' Intent

The bot needs to understand when a user wants to cancel. We'll update the instructions given to the LLM for intent detection.

1.  **Open `lib/discord/index.js`**.
2.  **Find the `systemMessage` constant:** This constant defines the prompt used for intent detection.
3.  **Add `'cancel_talk'` to the possible intents:** Modify the `systemMessage` to include `cancel_talk` as a potential user action.

    **Change this:**
    ```javascript
    const systemMessage = "You are a helpful assistant determining user intent. The user might want to 'sign_up' to speak or 'view_schedule'. Respond with only the intent name (e.g., 'sign_up' or 'view_schedule')."
    ```

    **To this:**
    ```javascript
    const systemMessage = "You are a helpful assistant determining user intent. The user might want to 'sign_up' to speak, 'view_schedule', or 'cancel_talk'. Respond with only the intent name (e.g., 'sign_up', 'view_schedule', 'cancel_talk')."
    ```

---

## Step 2: Implement Cancellation Logic in `schedulingLogic.js`

We need a function to find and remove a user's scheduled talk from the database.

1.  **Open `lib/schedulingLogic.js`**.
2.  **Add the `cancelSpeaker` function:** Add the following asynchronous function to the file. It finds and deletes a speaker's entry based on their Discord User ID, but *only* if the scheduled date is in the future.

    ```javascript
    /**
     * Cancels an upcoming talk for a specific user.
     * @param {string} discordUserId - The Discord User ID of the speaker wishing to cancel.
     * @returns {Promise<object|null>} - A promise resolving to the deleted speaker document, or null if no upcoming talk was found for the user.
     * @throws {Error} If there's a database error during deletion.
     */
    async function cancelSpeaker (discordUserId) {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0); // Ensure we compare dates correctly

      try {
        // Find and delete the speaker's *upcoming* scheduled talk
        const deletedSpeaker = await ScheduledSpeaker.findOneAndDelete({
          discordUserId: discordUserId,
          scheduledDate: { $gte: today } // Only allow cancelling future talks
        }).lean(); // .lean() returns a plain JS object, good if we just need the data

        if (deletedSpeaker) {
          console.log(`Cancelled talk for user ${discordUserId} on ${deletedSpeaker.scheduledDate}`);
        } else {
          console.log(`No upcoming talk found to cancel for user ${discordUserId}`);
        }
        return deletedSpeaker; // Will be null if nothing was found/deleted
      } catch (error) {
        console.error(`Error cancelling talk for user ${discordUserId}:`, error);
        throw error; // Re-throw the error to be handled by the caller
      }
    }
    ```

3.  **Export the new function:** Add `cancelSpeaker` to the `module.exports` at the bottom of the file.

    **Modify `module.exports` to include `cancelSpeaker`:**
    ```javascript
    module.exports = {
      findAvailableFridays,
      scheduleSpeaker,
      getUpcomingSchedule,
      cancelSpeaker // Add the new function here
    };
    ```

---

## Step 3: Handle the 'cancel_talk' Intent in `lib/discord/index.js`

Now, we connect the intent detection to the cancellation logic and provide feedback to the user.

1.  **Open `lib/discord/index.js`**.
2.  **Import `cancelSpeaker`:** Update the `require` statement for `../schedulingLogic` at the top of the file to include the new function.

    **Change this:**
    ```javascript
    const { findAvailableFridays, scheduleSpeaker, getUpcomingSchedule } = require('../schedulingLogic')
    ```

    **To this:**
    ```javascript
    const { findAvailableFridays, scheduleSpeaker, getUpcomingSchedule, cancelSpeaker } = require('../schedulingLogic')
    ```

3.  **Add the `cancel_talk` intent handler:** Inside the `messageCreate` event listener, add a new `else if` block to handle the `'cancel_talk'` intent, similar to how `'sign_up'` and `'view_schedule'` are handled.

    ```javascript
    // ... inside client.on(Events.MessageCreate, ...)
    // After the 'view_schedule' block

    } else if (detectedIntent === 'cancel_talk') {
      console.log(`Cancel talk intent detected for user ${message.author.id}.`);
      try {
        const cancelledTalk = await cancelSpeaker(message.author.id);

        if (cancelledTalk) {
          const formattedDate = cancelledTalk.scheduledDate.toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
          });
          await message.reply(`Okay, I have cancelled your talk "${cancelledTalk.topic}" scheduled for ${formattedDate}.`);
        } else {
          await message.reply("You don't seem to have an upcoming talk scheduled that I can cancel.");
        }
      } catch (error) {
        console.error(`Error processing cancel_talk for ${message.author.id}:`, error);
        await message.reply("Sorry, I encountered an error trying to cancel your talk. Please try again later or contact an admin.");
      }
    // Add this 'else' if it wasn't the last block
    // } else {
    //   // Handle unknown intent if necessary
    //   await message.reply("Sorry, I'm not sure how to help with that...");
    // }

    // End of intent handling blocks
    ```
    *Self-Correction:* Make sure this new `else if` block is placed correctly relative to the existing `sign_up` and `view_schedule` blocks and any final `else` block that handles unrecognized intents. It should typically go before the final `else`.

---

## Step 4: Test the Cancellation Feature

1.  **Restart your bot** to apply the changes in both `lib/schedulingLogic.js` and `lib/discord/index.js`.
2.  **Schedule a Talk:** If you don't have one scheduled for your test user, use the sign-up flow (`@YourBotName sign me up`) to schedule a talk for a future date. Use `@YourBotName show schedule` to confirm it's listed.
3.  **Attempt Cancellation:** Mention the bot and ask to cancel your talk (e.g., `@YourBotName cancel my talk`, `@YourBotName I need to cancel`).
4.  **Verify Success:**
    *   Confirm the bot replies with a message indicating the talk (including topic and date) has been cancelled.
    *   Use `@YourBotName show schedule` again to verify that the talk is no longer listed.
5.  **Test Cancellation Without a Talk:** If the user *doesn't* have an upcoming talk scheduled, try the cancel command again.
6.  **Verify "No Talk" Message:**
    *   Confirm the bot replies with a message indicating that no upcoming talk was found to cancel.

---

**Conclusion:**

You have successfully added a cancellation feature to the bot! Users can now manage their own scheduled talks by simply asking the bot to cancel. This involved defining a new intent, adding the corresponding database logic, and handling the intent within the Discord message listener. 