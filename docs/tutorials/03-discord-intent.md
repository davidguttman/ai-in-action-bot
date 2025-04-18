# Tutorial: Discord - Detect Sign-up Intent & Create Thread

This tutorial covers modifying the Discord bot to understand when a user wants to sign up to speak using an LLM for intent detection, and then creating a private thread to handle the sign-up process.

**Goal:** Listen for bot mentions, use an LLM to detect 'sign_up' intent, and initiate the scheduling process in a new thread.

**Prerequisites:**

*   Completion of previous tutorials, establishing the project structure, Mongoose model, and scheduling logic.
*   A configured Discord bot application with necessary permissions and intents (`GUILD_MESSAGES`, `MESSAGE_CONTENT`).
*   An LLM interaction setup (e.g., `lib/llm/index.js` with a `completion` function).
*   Discord bot client initialized and running (`lib/discord/index.js`).

---

## Step 1: Prepare Discord Bot Listener (`lib/discord/index.js`)

We need to enhance the main Discord bot file to handle incoming messages, check for mentions, and call our LLM for intent analysis.

1.  **Navigate to `lib/discord/index.js`** (or the file where your `discord.js` client is initialized and message event listeners are attached).
2.  **Require necessary modules:** Ensure you have required `discord.js` components and your LLM's `completion` function.

    ```javascript
    // lib/discord/index.js (top of file)
    const { Client, GatewayIntentBits, Events, ChannelType } = require('discord.js')
    const { completion } = require('../llm') // Adjust path if necessary
    // ... other requires (config, deploy-commands, etc.)
    ```

3.  **Ensure Correct Intents:** Verify that your `Client` instance requests the necessary intents.

    ```javascript
    // Inside your bot initialization logic
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages, // Required to receive message events
        GatewayIntentBits.MessageContent // Required to read message content
        // Add other intents as needed (e.g., GuildMembers for user info)
      ]
    })
    ```

---

## Step 2: Implement Message Listener Logic

Within the `messageCreate` event listener, add the logic to detect mentions, call the LLM, and start a thread if sign-up intent is confirmed.

1.  **Find or create the `messageCreate` listener:**

    ```javascript
    // lib/discord/index.js
    client.on(Events.MessageCreate, async (message) => {
      // Basic checks: ignore bots and ensure bot was mentioned
      if (message.author.bot) return
      if (!message.mentions.has(client.user.id)) return

      // Optional: Check if the message is already in a thread created by this bot?
      // You might want to store active sign-up thread IDs associated with users
      // to avoid starting new threads if one is already in progress.
      if (message.channel.isThread()) {
         // Potentially ignore or send a message like:
         // "Please start the sign-up process by mentioning me in the main channel."
         // For simplicity, we'll allow thread creation from within threads for now.
         console.log('Bot mentioned within a thread, proceeding cautiously.')
      }

      console.log(`Bot mentioned by ${message.author.tag} in channel ${message.channel.id}`)
      const userMessageContent = message.content.replace(/<@!?\\d+>/g, '').trim() // Remove mention before sending to LLM

      // **LLM Intent Detection**
      try {
        const systemMessage = "You are a helpful assistant determining user intent. The user might want to 'sign_up' to speak or 'view_schedule'. Respond with only the intent name (e.g., 'sign_up' or 'view_schedule')."
        
        console.log(`Sending to LLM: "${userMessageContent}"`)
        const intentResponse = await completion(systemMessage, userMessageContent)
        const detectedIntent = intentResponse?.trim().toLowerCase()
        console.log(`LLM detected intent: ${detectedIntent}`)

        if (detectedIntent === 'sign_up') {
          // **Sign-up Intent Detected: Create Thread**
          
          // Check if the channel allows thread creation
          if (!message.channel.threads) {
             console.warn(`Channel ${message.channel.id} does not support threads.`)
             // Optionally reply to the user:
             // await message.reply("Sorry, I can't create sign-up threads in this channel.")
             return 
          }

          try {
            const thread = await message.startThread({
              name: `Speaker Sign-up - ${message.author.username}`,
              autoArchiveDuration: 60, // Archive after 60 minutes of inactivity
              // Attempt to create a private thread if possible (requires server boost level 2+)
              // type: ChannelType.PrivateThread, 
              // Note: Creating private threads might require specific permissions or boost levels.
              // Defaulting to public thread is safer initially.
              reason: `Initiating speaker sign-up process for ${message.author.tag}`
            })

            console.log(`Created thread: ${thread.name} (${thread.id})`)

            // Send initial prompt into the new thread
            await thread.send(`Hi ${message.author}, thanks for offering to speak! To get you scheduled, could you please tell me your presentation topic?`)

          } catch (threadError) {
            console.error('Error creating thread or sending initial message:', threadError)
            // Inform the user if thread creation failed
            try {
              await message.reply("Sorry, I couldn't start the sign-up thread. Please try again later or contact an admin.")
            } catch (replyError) {
              console.error('Failed to send error reply to user:', replyError)
            }
          }
        } else if (detectedIntent === 'view_schedule') {
            // TODO: Implement logic for viewing the schedule (likely in a future tutorial)
            console.log('View schedule intent detected (handler not implemented yet).')
            // await message.reply("Handling 'view schedule' is not implemented yet."); 
        } else {
            console.log('LLM did not return a recognized intent.')
            // Optionally, provide a generic helpful response if intent is unclear
            // await message.reply("I'm not sure what you mean. You can ask me to 'sign up to speak' or 'view the schedule'.")
        }

      } catch (llmError) {
        console.error('Error during LLM intent detection:', llmError)
        // Inform the user about the LLM issue
        try {
            await message.reply("Sorry, I'm having trouble understanding requests right now. Please try again later.")
        } catch (replyError) {
            console.error('Failed to send LLM error reply to user:', replyError)
        }
      }
    }) // End of messageCreate listener
    ```

**Explanation:**

1.  **Initial Checks:** Ignores messages from bots and ensures the message specifically mentions the bot user.
2.  **Content Cleaning:** Removes the bot mention (`<@... >`) from the message content before sending it to the LLM.
3.  **LLM Call:**
    *   Constructs a `systemMessage` to guide the LLM's response towards specific intents ('sign\_up', 'view\_schedule').
    *   Calls the `completion` function with the system message and the cleaned user message.
    *   Trims and lowercases the LLM response for easier comparison.
4.  **Intent Handling (`sign_up`):**
    *   Checks if the detected intent is `'sign_up'`.
    *   **Thread Creation:** Uses `message.startThread()` to create a new thread associated with the original message.
        *   Sets a descriptive `name`.
        *   Sets `autoArchiveDuration`.
        *   *(Commented out)* Shows where you might specify `ChannelType.PrivateThread` if desired and supported. Public threads are the default.
    *   **Initial Thread Message:** Sends a prompt message directly into the newly created `thread` using `thread.send()`, asking the user for their topic.
    *   **Error Handling:** Includes `try...catch` blocks for both the LLM call and the thread creation/sending process, logging errors and attempting to inform the user if something goes wrong.
5.  **Other Intents:** Includes placeholders for handling `view_schedule` or unrecognized intents.

---

## Step 3: Test the Interaction

1.  Ensure your bot is running with the updated code.
2.  Go to a Discord channel where the bot is present.
3.  Mention the bot and express intent to sign up (e.g., `@YourBotName I'd like to sign up to give a talk`).
4.  Verify:
    *   The bot recognizes the mention.
    *   The LLM correctly identifies the 'sign\_up' intent (check console logs).
    *   A new thread is created with the correct name.
    *   The initial prompt ("Hi \[UserMention], ... presentation topic?") appears *inside* the newly created thread.
    *   Test error cases (e.g., mention the bot in a channel where it can't create threads, if applicable).

---

**Conclusion:**

Your Discord bot can now detect when a user mentions it with the intent to sign up for speaking. It initiates the process by creating a dedicated thread and prompting the user for the next piece of information (their topic). The next tutorial will likely cover handling the user's response within this thread to collect the topic and available dates.
