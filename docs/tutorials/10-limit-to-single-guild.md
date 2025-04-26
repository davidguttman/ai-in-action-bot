# Tutorial: Discord - Limit Bot Responses to a Single Guild

This tutorial demonstrates how to restrict the bot so it only responds to messages and interactions originating from a specific Discord server (guild), using the Guild ID configured in the environment variables.

**Goal:** Prevent the bot from processing messages or commands in servers other than the one specified by the `DISCORD_GUILD_ID` environment variable.

**Prerequisites:**

*   An existing Discord bot project structure, similar to the one developed in previous tutorials.
*   The main bot logic file (`lib/discord/index.js`) handles `MessageCreate` and `interactionCreate` events.
*   A configuration setup (`config/index.js`) that loads environment variables, including `DISCORD_GUILD_ID`.

---

## Step 1: Import the Guild ID

First, we need access to the configured Guild ID within our main Discord logic file.

1.  **Open `lib/discord/index.js`**.
2.  **Locate the `require` statements** at the top of the file.
3.  **Import `guildId`:** Modify the line that imports from `../../config` to include `guildId` from the `discord` object.

    **Change this:**
    ```javascript
    const { token } = require('../../config').discord
    ```

    **To this (or add `guildId` if other properties are already being imported):**
    ```javascript
    const { token, guildId } = require('../../config').discord // Added guildId
    ```

---

## Step 2: Add Guild Check for Messages (`MessageCreate`)

We will add a check at the beginning of the `MessageCreate` event handler to ignore messages from other guilds.

1.  **Find the `messageCreate` listener:** Locate the `client.on(Events.MessageCreate, async (message) => { ... });` block.
2.  **Add the Guild ID check:** Insert a check immediately after the bot author check (`if (message.author.bot) return`). This new check compares the `message.guildId` property with our configured `guildId`.

    ```javascript
    client.on(Events.MessageCreate, async (message) => {
      if (message.author.bot) return

      // --- Add this check --- 
      if (message.guildId !== guildId) {
        console.log(`Ignoring message from guild ${message.guildId} - not the configured guild ${guildId}.`)
        return // Ignore messages from other guilds
      }
      // --- End of added check ---

      // Existing checks for threads, mentions, etc.
      const signupInfo = activeSignups[message.channel.id]
      if (message.channel.isThread() && signupInfo && /*...*/) {
        // ... thread logic ...
      }

      if (!message.mentions.has(client.user.id)) return
      // ... mention logic ...
    });
    ```

**Explanation:**

*   The `message` object provided by `discord.js` has a `guildId` property indicating the ID of the server where the message was sent.
*   We compare this `message.guildId` with the `guildId` loaded from our configuration.
*   If they do not match, we log a message (optional but helpful for debugging) and `return`, effectively stopping any further processing of that message by our bot.

---

## Step 3: Add Guild Check for Interactions (`interactionCreate`)

Similarly, we need to ensure slash commands and other interactions are only processed if they come from the configured guild.

1.  **Find the `interactionCreate` listener:** Locate the `client.on('interactionCreate', function (action) { ... });` block.
2.  **Modify `handleInteraction`:** The current code calls the `handleInteraction` function. We will add the check inside *that* function for clarity.
3.  **Open `handleInteraction`:** Find the `async function handleInteraction (client, interaction) { ... }` definition (likely near the end of the file).
4.  **Add the Guild ID check:** Insert the check at the beginning of the `handleInteraction` function.

    ```javascript
    async function handleInteraction (client, interaction) {
      // --- Add this check --- 
      if (interaction.guildId !== guildId) {
        console.log(`Ignoring interaction from guild ${interaction.guildId} - not the configured guild ${guildId}.`)
        // Interactions should be replied to, even if ignored, to prevent an error state.
        // Check if it's a repliable interaction before attempting to reply.
        if (interaction.isRepliable()) {
            try {
              await interaction.reply({ content: 'This command is not available in this server.', ephemeral: true });
            } catch (replyError) {
              console.error(`Failed to send guild restriction reply for interaction in guild ${interaction.guildId}:`, replyError);
            }
        }
        return // Ignore interactions from other guilds
      }
      // --- End of added check ---
      
      // Existing interaction handling logic
      if (interaction.isAutocomplete()) return handleAutocomplete(client, interaction)
      if (interaction.isButton()) return handleButton(client, interaction)
      if (!interaction.isChatInputCommand()) return
      
      // ... rest of interaction handling ...
    }
    ```

**Explanation:**

*   The `interaction` object also has a `guildId` property.
*   We perform the same comparison as in the message handler.
*   **Important:** For interactions (like slash commands), Discord expects *some* kind of response, even if it's just an acknowledgement. If we simply `return`, the user will see an "Interaction failed" message. Therefore, we check if the interaction is `repliable` and send an ephemeral message indicating the command isn't available there before returning.

---

## Step 4: Test the Guild Restriction

1.  **Configure `DISCORD_GUILD_ID`:** Ensure your `.env` file has the correct `DISCORD_GUILD_ID` set to the ID of your intended test/development server.
2.  **Restart your bot** to load the changes in `lib/discord/index.js` and the updated configuration.
3.  **Test in the Correct Guild:**
    *   Go to the Discord server matching the `DISCORD_GUILD_ID`.
    *   Mention the bot (`@YourBotName show schedule`).
    *   Use a slash command (e.g., `/check`).
    *   **Verify:** The bot responds normally as before.
4.  **Test in a Different Guild:**
    *   Invite the bot to a *different* Discord server (one whose ID does *not* match `DISCORD_GUILD_ID`).
    *   Mention the bot in that server.
    *   Try using a slash command.
    *   **Verify:**
        *   The bot does *not* respond to the mention.
        *   Using the slash command results in an ephemeral message like "This command is not available in this server."
        *   Check your bot's console logs; you should see the "Ignoring message/interaction from guild..." messages.

---

**Conclusion:**

You have now successfully restricted your bot to operate only within the specific guild defined in your environment variables. This is a crucial step for controlling where your development or production bot is active, preventing accidental interactions in unintended servers. 