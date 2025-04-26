# Tutorial: Discord - Include Topic in Schedule View

This tutorial modifies the existing 'view_schedule' capability to include the speaker's topic alongside their name and date.

**Goal:** Enhance the schedule output so users can see not just who is speaking and when, but also *what* they are speaking about.

**Prerequisites:**

*   Completion of previous tutorials, especially Tutorial 6 (`06-discord-view-schedule.md`), which implemented the initial `view_schedule` intent handling in `lib/discord/index.js`.
*   The `ScheduledSpeaker` model (`models/scheduledSpeaker.js`) includes a `topic` field.
*   The `getUpcomingSchedule` function (`lib/schedulingLogic.js`) returns speaker objects that include the `topic` field.

---

## Step 1: Locate the Schedule Formatting Code

We need to find the part of the code that takes the list of upcoming speakers and turns it into a text message for Discord. Based on Tutorial 6, this is within the `messageCreate` event handler in `lib/discord/index.js`.

1.  **Open `lib/discord/index.js`**.
2.  **Find the `messageCreate` listener:** Look for `client.on(Events.MessageCreate, async (message) => { ... });`.
3.  **Find the `view_schedule` intent block:** Inside the listener, locate the `else if (detectedIntent === 'view_schedule') { ... }` block. This block is triggered when the LLM determines the user wants to see the schedule.
4.  **Find the message formatting logic:** Within the `view_schedule` block, after the `upcomingSpeakers = await getUpcomingSchedule(limit);` call, find the code that formats the response when speakers *are* found. It will look something like this:

    ```javascript
    // Inside the 'else' block after checking if upcomingSpeakers is empty
    const scheduleLines = upcomingSpeakers.map(speaker => {
      const formattedDate = speaker.scheduledDate.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });
      const userDisplay = speaker.discordUsername;
      // This is the line we need to change:
      return `- ${formattedDate}: @${userDisplay}`;
    });

    const scheduleMessage = `**Upcoming Speakers (Next ${limit}):**\n${scheduleLines.join('\n')}`;
    await message.reply(scheduleMessage);
    ```

---

## Step 2: Modify the Message Format

Now, we'll adjust the line that creates each entry in the schedule list to include the topic.

1.  **Access the topic:** The `speaker` object obtained from `getUpcomingSchedule` should already contain the `topic` field (as saved during the sign-up process).
2.  **Update the `return` statement:** Modify the `return` line inside the `.map()` function to include `speaker.topic`. We can format it nicely, perhaps putting the topic in quotes.

    **Change this:**
    ```javascript
    return `- ${formattedDate}: @${userDisplay}`;
    ```

    **To this:**
    ```javascript
    return `- ${formattedDate}: @${userDisplay} - "${speaker.topic}"`; // Added topic here
    ```

3.  **The modified block:** The relevant part of the `view_schedule` logic should now look like this:

    ```javascript
    // Inside the 'else' block for when speakers are found
    const scheduleLines = upcomingSpeakers.map(speaker => {
      const formattedDate = speaker.scheduledDate.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });
      const userDisplay = speaker.discordUsername;
      // Include the topic in the output string
      return `- ${formattedDate}: @${userDisplay} - "${speaker.topic}"`;
    });

    const scheduleMessage = `**Upcoming Speakers (Next ${limit}):**\n${scheduleLines.join('\n')}`;
    // The rest of the block (sending the reply, error handling) remains the same
    try { // Wrap reply
      await message.reply(scheduleMessage);
    } catch (replyError) { console.error('Failed to send schedule reply:', replyError); }
    ```

---

## Step 3: Test the Updated Schedule View

1.  **Restart your bot** to load the changes in `lib/discord/index.js`.
2.  **Ensure Data Exists:** Make sure you have some future-dated speaker entries in your database that include topics. If necessary, run through the sign-up flow (`@YourBotName sign up`) to create some test entries.
3.  **Ask for Schedule:** Mention the bot in a main channel and ask to see the schedule (e.g., `@YourBotName show schedule`, `@YourBotName who is speaking?`).
4.  **Verify Output:**
    *   Confirm the bot replies with the upcoming schedule.
    *   Check that each line now includes the speaker's topic in quotes after their username, matching the format: `- [Formatted Date]: @[Username] - "[Topic]"`.
    *   Ensure the date and username are still displayed correctly.

---

**Conclusion:**

You have successfully updated the schedule view command! Users now get more context by seeing the topic associated with each scheduled speaker, making the schedule information more complete and useful. This was a small change focused on improving the presentation of existing data. 