const fs = require('node:fs')
const path = require('node:path')
const { parse } = require('node:querystring')
const {
  Client,
  Collection,
  GatewayIntentBits,
  Events,
  ChannelType,
} = require('discord.js')
const { completion } = require('../llm')
const {
  findAvailableFridays,
  scheduleSpeaker,
  getUpcomingSchedule,
  cancelSpeaker,
} = require('../schedulingLogic')
const talkHistory = require('../talkHistory') // Assuming lib/talkHistory.js

const { token, guildId, openrouterApiKey } = require('../../config')

const commands = {}
// Stores { threadId: { userId: string, state: string, topic?: string, proposedDates?: Date[], lastUpdated?: number, referringUserId?: string, originalChannelId?: string } }
const activeSignups = {}
const TIMEOUT_DURATION = 60 * 60 * 1000 // 1 hour in milliseconds

// Helper Function for formatting dates
function formatDatesForDisplay(dates) {
  if (!dates || dates.length === 0) return ''
  return dates
    .map((date, index) => {
      const options = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      }
      // Simple ordinal suffix logic
      let day = date.getUTCDate()
      let suffix = 'th'
      if (day % 10 === 1 && day !== 11) suffix = 'st'
      else if (day % 10 === 2 && day !== 12) suffix = 'nd'
      else if (day % 10 === 3 && day !== 13) suffix = 'rd'
      return `${index + 1}. ${date.toLocaleDateString('en-US', options).replace(/(\d+)(, \d{4})$/, `$1${suffix}$2`)}`
    })
    .join('\n')
}

// System message for LLM to determine user intent when bot is mentioned
const MAIN_INTENT_SYSTEM_MESSAGE =
  "You are an assistant classifying user intent in a Discord message where the bot was mentioned. Possible intents are 'sign_up', 'view_schedule', 'cancel_talk', 'query_talks', 'REFERRAL_SCHEDULE_TALK', or 'other'.\n- Classify as 'sign_up' ONLY if the user explicitly asks to sign up, volunteer, present, or talk for themselves.\n- Classify as 'view_schedule' ONLY if the user explicitly asks to see the schedule, upcoming talks, or who is speaking.\n- Classify as 'cancel_talk' ONLY if the user explicitly asks to cancel, withdraw, or back out of their scheduled talk.\n- Classify as 'query_talks' ONLY if the user is asking about past talks, previous topics, or if specific topics have been covered before.\n- Classify as 'REFERRAL_SCHEDULE_TALK' if the user suggests scheduling *another specific user* for a talk (e.g., 'ask @UserB to talk', 'I think @UserC should present').\n- Otherwise, classify as 'other'. This includes simple replies, acknowledgements, questions not related to the above, or unclear requests.\nRespond with ONLY the intent name ('sign_up', 'view_schedule', 'cancel_talk', 'query_talks', 'REFERRAL_SCHEDULE_TALK', 'other')."

const TOPIC_CHECK_SYSTEM_MESSAGE =
  "You are an assistant helping determine if a user's message is a presentation topic. Respond with ONLY 'topic' if it seems like a plausible topic, or 'clarify' if it's conversational filler, a question, or clearly not a topic."

const USER_B_REFERRAL_RESPONSE_SYSTEM_MESSAGE =
  "A user was referred by someone else to give a talk. They were asked if they'd like to present and what their topic would be. Based on their reply, are they: (A) Agreeing and providing a topic? (B) Declining the offer? (C) Asking for clarification or being non-committal? Respond with A, B, or C. If A, also provide the topic after a colon, e.g., 'A: My Awesome Topic'."

async function cleanupStaleSignups(clientInstance) {
  const now = Date.now()
  for (const threadId in activeSignups) {
    const signupInfo = activeSignups[threadId]
    if (signupInfo.lastUpdated && now - signupInfo.lastUpdated > TIMEOUT_DURATION) {
      console.log(`Cleaning up stale signup state for thread ${threadId}`)
      try {
        const threadChannel = await clientInstance.channels.fetch(threadId)
        if (threadChannel && threadChannel.isTextBased()) {
          let timeoutMessage = `This talk scheduling session in <#${threadId}> has timed out due to inactivity.`
          if (signupInfo.state === 'awaiting_referred_topic' && signupInfo.referringUserId) {
            const targetUserMention = `<@${signupInfo.userId}>`
            const referringUserMention = `<@${signupInfo.referringUserId}>`
            timeoutMessage = `Hi ${targetUserMention}, since I haven't heard back about the talk suggestion from ${referringUserMention}, I'll cancel this scheduling attempt for now. Feel free to reach out if you change your mind! ${referringUserMention}, just letting you know.`
          }
          await threadChannel.send(timeoutMessage)
        }
      } catch (error) {
        console.error(`Error sending timeout message to thread ${threadId}:`, error)
      }
      delete activeSignups[threadId]
    }
  }
}

module.exports = createClient()

function createClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  })

  client.commands = new Collection()
  loadCommands().forEach(({ name, command }) => {
    if ('data' in command && 'execute' in command) {
      commands[name] = command
      client.commands.set(name, command)
      console.log(`Loaded command: ${name}`)
    } else {
      console.log(
        `[WARNING] The command ${name} is missing a required "data" or "execute" property.`,
      )
    }
  })

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`)
    readyClient.user.setActivity('for speaker sign-ups', { type: 'WATCHING' })
    setInterval(() => cleanupStaleSignups(readyClient), 5 * 60 * 1000) // Run every 5 minutes
  })

  client.on('interactionCreate', function (action) {
    handleInteraction(client, action)
  })

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return
    if (message.guildId !== guildId) {
      // console.log(`Ignoring message from guild ${message.guildId} - not the configured guild ${guildId}.`);
      return
    }

    const signupInfo = activeSignups[message.channel.id]
    if (
      message.channel.isThread() &&
      signupInfo &&
      message.author.id === signupInfo.userId // Only process messages from the target user in the thread
    ) {
      console.log(
        `Message received in active signup thread ${message.channel.id} from user ${message.author.id} in state ${signupInfo.state}`,
      )
      signupInfo.lastUpdated = Date.now()

      // --- State: awaiting_referred_topic (User B responds to referral) ---
      if (signupInfo.state === 'awaiting_referred_topic') {
        const userBResponse = message.content.trim()
        try {
          const llmDecision = await completion({
            systemMessage: USER_B_REFERRAL_RESPONSE_SYSTEM_MESSAGE,
            prompt: `User's response: '${userBResponse}'`,
            maxTokens: 50, // "A: Topic" is short
          })

          const decisionParts = llmDecision.trim().split(':')
          const decisionType = decisionParts[0].trim().toUpperCase()
          const extractedTopic = decisionParts[1] ? decisionParts[1].trim() : null

          if (decisionType === 'A' && extractedTopic) {
            signupInfo.topic = extractedTopic
            signupInfo.state = 'awaiting_topic_confirmation' // Intermediate state to propose dates
            await message.reply(
              `Great! Let's get you scheduled for the talk on '**${extractedTopic}**'.`,
            )
            // Now proceed to find and propose dates (similar to 'awaiting_topic' but without LLM topic check)
            const availableDates = await findAvailableFridays()
            if (!availableDates || availableDates.length === 0) {
              await message.reply(
                "Sorry, I couldn't find any available slots in the near future. Please check back later or contact an admin.",
              )
              delete activeSignups[message.channel.id]
              return
            }
            signupInfo.proposedDates = availableDates
            const formattedDates = formatDatesForDisplay(availableDates)
            await message.reply(
              `Here are the next available Fridays:\n${formattedDates}\nWhich date works best for you? (Please reply with the number, e.g., '1')`,
            )
            signupInfo.state = 'awaiting_date_selection'
          } else if (decisionType === 'B') {
            await message.reply(
              `Okay, ${message.author}. Thanks for letting me know! Maybe another time.`,
            )
            // Optionally inform User A (referringUser)
            if (signupInfo.referringUserId && signupInfo.originalChannelId) {
                try {
                    const originalChannel = await client.channels.fetch(signupInfo.originalChannelId);
                    if (originalChannel) {
                        await originalChannel.send(`<@${signupInfo.referringUserId}>, just a heads up: <@${signupInfo.userId}> has declined the talk suggestion for now.`);
                    }
                } catch (err) {
                    console.error("Error informing referring user about declination:", err);
                }
            }
            delete activeSignups[message.channel.id]
          } else { // 'C' or unclear
            await message.reply(
              "I'm not sure I understood. Are you interested in giving this talk? If so, what would be your topic?",
            )
          }
        } catch (llmError) {
          console.error("LLM error processing User B's referral response:", llmError)
          await message.reply("Sorry, I had trouble understanding your response. Could you please clarify if you're interested and what your topic would be?")
        }
        return
      }

      // --- State: awaiting_topic (Direct sign-up) ---
      if (signupInfo.state === 'awaiting_topic') {
        const userMessage = message.content.trim()
        try {
          const intentResponse = await completion({
            systemMessage: TOPIC_CHECK_SYSTEM_MESSAGE,
            prompt: userMessage,
          })
          const intent = intentResponse?.trim().toLowerCase()

          if (intent === 'topic') {
            signupInfo.topic = userMessage
            const availableDates = await findAvailableFridays()
            if (!availableDates || availableDates.length === 0) {
              await message.reply(
                "Sorry, I couldn't find any available slots in the near future. Please check back later or contact an admin.",
              )
              delete activeSignups[message.channel.id]
              return
            }
            signupInfo.proposedDates = availableDates
            const formattedDates = formatDatesForDisplay(availableDates)
            await message.reply(
              `Okay, your topic is '**${signupInfo.topic}**'. Here are the next available Fridays:\n${formattedDates}\nWhich date works best for you? (Please reply with the number, e.g., '1')`,
            )
            signupInfo.state = 'awaiting_date_selection'
          } else {
            await message.reply(
              'Thanks for the reply! To continue scheduling, could you please tell me your presentation topic?',
            )
          }
        } catch (llmError) {
          console.error('LLM error during topic intent check:', llmError)
          await message.reply(
            'Sorry, I had trouble understanding that. Could you please restate your presentation topic?',
          )
        }
        return
      }

      // --- State: awaiting_date_selection ---
      else if (signupInfo.state === 'awaiting_date_selection') {
        const userReply = message.content.trim()
        const proposedDates = signupInfo.proposedDates
        if (!proposedDates || proposedDates.length === 0) {
          await message.reply(
            "Sorry, something went wrong, and I don't have the proposed dates anymore. Please try the sign-up process again.",
          )
          delete activeSignups[message.channel.id]
          return
        }

        const formattedDatesForLLM = proposedDates
          .map((date, index) => `${index + 1}: ${date.toISOString().split('T')[0]}`)
          .join(', ')
        const dateSelectionSystemMessage = `You are an assistant helping parse user date selection. Given the user's message and a list of proposed dates (format: 'Index: YYYY-MM-DD'), identify which date index (1, 2, or 3) the user selected. Respond with ONLY the number (1, 2, or 3) or 'clarify' if the selection is ambiguous or requests a different date. Dates available: ${formattedDatesForLLM}`

        try {
          const llmResponse = await completion({
            systemMessage: dateSelectionSystemMessage,
            prompt: userReply,
          })
          const parsedChoice = llmResponse?.trim()
          let selectedDateObject = null
          let selectedIndex = -1

          if (parsedChoice === '1' || parsedChoice === '2' || parsedChoice === '3') {
            selectedIndex = parseInt(parsedChoice, 10) - 1
            if (selectedIndex >= 0 && selectedIndex < proposedDates.length) {
              selectedDateObject = proposedDates[selectedIndex]
            }
          }

          if (selectedDateObject) {
            const bookingResult = await scheduleSpeaker({
              discordUserId: signupInfo.userId,
              discordUsername: message.author.username,
              topic: signupInfo.topic,
              scheduledDate: selectedDateObject,
              threadId: message.channel.id,
            })

            if (bookingResult) {
              const confirmationDateString = selectedDateObject.toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
              })
              await message.reply(
                `Great! You're confirmed to speak on '**${signupInfo.topic}**' on ${confirmationDateString}.`,
              )
              delete activeSignups[message.channel.id]
            } else { // scheduleSpeaker returned null (likely conflict)
              const newAvailableDates = await findAvailableFridays()
              if (!newAvailableDates || newAvailableDates.length === 0) {
                await message.reply("Hmm, it seems that date might have just been taken, and I couldn't find any other slots right now. Please try signing up again later.")
                delete activeSignups[message.channel.id]
              } else {
                signupInfo.proposedDates = newAvailableDates
                const formattedNewDates = formatDatesForDisplay(newAvailableDates)
                await message.reply(
                  `It seems there was an issue booking that exact slot (it might have just been taken). Here are the updated available dates:\n${formattedNewDates}\nWhich of these works?`,
                )
              }
            }
          } else { // Ambiguous parse
            const formattedOriginalDates = formatDatesForDisplay(proposedDates)
            await message.reply(
              `Sorry, I didn't quite catch that. Please tell me which of these dates works best by replying with the number (1, 2, or 3):\n${formattedOriginalDates}`,
            )
          }
        } catch (error) { // Covers LLM error or scheduleSpeaker throwing non-11000 error
          console.error(`Error during date selection/booking for thread ${message.channel.id}:`, error)
          if (error.code === 11000 && error.keyPattern && error.keyPattern.scheduledDate) { // Explicit conflict from DB
            const newAvailableDates = await findAvailableFridays()
            if (!newAvailableDates || newAvailableDates.length === 0) {
              await message.reply("Oops! It looks like the date you selected just got booked, and unfortunately, I couldn't find any other slots right now. Please try signing up again later.")
              delete activeSignups[message.channel.id]
            } else {
              signupInfo.proposedDates = newAvailableDates
              const formattedNewDates = formatDatesForDisplay(newAvailableDates)
              await message.reply(
                `Oops! It looks like the date you selected just got booked. Here are the updated available dates:\n${formattedNewDates}\nWhich of these works?`,
              )
            }
          } else {
            await message.reply('Sorry, I encountered an issue processing your date selection. Please try again.')
          }
        }
        return
      }
    } // --- End of active sign-up thread check ---

    // --- Check if the bot was mentioned *at the beginning* of the message in a main channel ---
    const mentionPrefix1 = `<@${client.user.id}>`
    const mentionPrefix2 = `<@!${client.user.id}>`
    const trimmedContent = message.content.trim()

    if (
      !message.channel.isThread() &&
      (trimmedContent.startsWith(mentionPrefix1) || trimmedContent.startsWith(mentionPrefix2))
    ) {
      let userMessageContent = ''
      if (trimmedContent.startsWith(mentionPrefix1)) {
        userMessageContent = trimmedContent.substring(mentionPrefix1.length).trim()
      } else {
        userMessageContent = trimmedContent.substring(mentionPrefix2.length).trim()
      }
      if (!userMessageContent) userMessageContent = 'help'

      try {
        const intentResponse = await completion({
          systemMessage: MAIN_INTENT_SYSTEM_MESSAGE,
          prompt: userMessageContent,
        })
        const detectedIntent = intentResponse?.trim().toLowerCase()
        console.log(`Detected intent: ${detectedIntent} for message: "${userMessageContent}" by ${message.author.tag}`)

        if (detectedIntent === 'sign_up') {
          if (Object.values(activeSignups).some(s => s.userId === message.author.id && s.state.startsWith('awaiting_'))) {
            await message.reply("It looks like you're already in a sign-up process. Please complete or cancel that one first.");
            return;
          }
          const thread = await message.startThread({
            name: `Speaker Sign-up - ${message.author.username}`,
            autoArchiveDuration: 60,
            reason: `Initiating speaker sign-up for ${message.author.tag}`,
          })
          activeSignups[thread.id] = {
            userId: message.author.id,
            state: 'awaiting_topic',
            lastUpdated: Date.now(),
          }
          await thread.send(
            `Hi ${message.author}, thanks for offering to speak! To get you scheduled, could you please tell me your presentation topic?`,
          )
        } else if (detectedIntent === 'view_schedule') {
          const upcomingSpeakers = await getUpcomingSchedule(5)
          if (!upcomingSpeakers || upcomingSpeakers.length === 0) {
            await message.reply('There are currently no speakers scheduled.')
          } else {
            const scheduleLines = upcomingSpeakers.map((speaker) => {
              const formattedDate = new Date(speaker.scheduledDate).toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
              })
              return `- ${formattedDate}: @${speaker.discordUsername} - "${speaker.topic}"`
            })
            await message.reply(`**Upcoming Speakers (Next 5):**\n${scheduleLines.join('\n')}`)
          }
        } else if (detectedIntent === 'cancel_talk') {
          const cancelledTalk = await cancelSpeaker(message.author.id)
          if (cancelledTalk) {
            const formattedDate = new Date(cancelledTalk.scheduledDate).toLocaleDateString('en-US', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
            })
            await message.reply(
              `Okay, I have cancelled your talk "${cancelledTalk.topic}" scheduled for ${formattedDate}.`,
            )
          } else {
            await message.reply("You don't seem to have an upcoming talk scheduled that I can cancel.")
          }
        } else if (detectedIntent === 'query_talks') {
          const queryTypeSystemMessage =
            "You are an assistant classifying talk history queries. Possible types are 'existence_check' (asking if a topic has been covered), 'list_talks' (asking for talks about a topic), or 'other'. Respond with ONLY the query type followed by the topic in question, e.g., 'existence_check: AI agents' or 'list_talks: machine learning'."
          const queryTypeResponse = await completion({
            systemMessage: queryTypeSystemMessage,
            prompt: userMessageContent,
          })
          const [queryType, topic] = queryTypeResponse.split(':').map((s) => s.trim())

          if (queryType === 'existence_check' && topic) {
            const relatedTalks = await talkHistory.findRelatedTalks(topic) // findRelatedTalks implies existence
            if (relatedTalks.length > 0) {
                const talksList = relatedTalks.map(talk => {
                    const formattedDate = new Date(talk.scheduledDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
                    return `- ${formattedDate}: @${talk.discordUsername} - "${talk.topic}"`;
                }).join('\n');
                await message.reply(`Yes, there have been talks about '${topic}':\n${talksList}`);
            } else {
                await message.reply(`No, I don't see any previous talks about '${topic}'.`);
            }
          } else if (queryType === 'list_talks' && topic) {
            const relatedTalks = await talkHistory.findRelatedTalks(topic)
            if (relatedTalks.length > 0) {
              const talksList = relatedTalks.map(talk => {
                  const formattedDate = new Date(talk.scheduledDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
                  return `- ${formattedDate}: @${talk.discordUsername} - "${talk.topic}"`;
              }).join('\n');
              await message.reply(`Here are the talks related to '${topic}':\n${talksList}`);
            } else {
              await message.reply(`I couldn't find any talks related to '${topic}'.`)
            }
          } else {
            await message.reply("I'm not sure what you're asking about past talks. You can ask if a topic has been covered before or what talks have been about a specific topic.")
          }
        } else if (detectedIntent === 'referral_schedule_talk') {
          const referringUser = message.author
          const mentionedUsers = message.mentions.users.filter(user => !user.bot && user.id !== client.user.id)
          const targetUser = mentionedUsers.first()

          if (!targetUser) {
            await message.reply(`Sorry ${referringUser}, you need to mention a user you'd like me to ask. For example, "@${client.user.username} ask @SomeUser to give a talk."`)
            return
          }

          if (targetUser.id === referringUser.id) { // Self-referral
            if (Object.values(activeSignups).some(s => s.userId === referringUser.id && s.state.startsWith('awaiting_'))) {
                await message.reply("It looks like you're already in a sign-up process. Please complete or cancel that one first.");
                return;
            }
            const thread = await message.startThread({
              name: `Speaker Sign-up (Self-Referral) - ${referringUser.username}`,
              autoArchiveDuration: 60,
            })
            activeSignups[thread.id] = {
              userId: referringUser.id,
              state: 'awaiting_topic',
              lastUpdated: Date.now(),
              referringUserId: referringUser.id, // For context, though it's self
              originalChannelId: message.channel.id,
            }
            await thread.send(`Hi ${referringUser}! Looks like you want to schedule a talk for yourself. What topic would you like to present?`)
          } else { // Actual referral
            if (Object.values(activeSignups).some(s => s.userId === targetUser.id && s.state.startsWith('awaiting_'))) {
                await message.reply(`It looks like ${targetUser.username} is already in a scheduling process. Please wait for that to complete.`);
                return;
            }
            const thread = await message.startThread({
              name: `Talk Referral - ${targetUser.username} (from ${referringUser.username})`,
              autoArchiveDuration: 60,
            })
            activeSignups[thread.id] = {
              userId: targetUser.id,
              state: 'awaiting_referred_topic',
              lastUpdated: Date.now(),
              referringUserId: referringUser.id,
              originalChannelId: message.channel.id,
            }
            await thread.send(`Hi ${targetUser}! ${referringUser.username} suggested you might be interested in giving a talk. If you'd like to proceed, what topic would you like to discuss?`)
            await message.reply(`Okay, I've created a thread and asked ${targetUser.username} about giving a talk. They can reply in the thread <#${thread.id}>.`)
          }
        } else { // 'other' or unrecognized
          await message.reply("Sorry, I'm not sure how to help with that. You can ask me to 'sign up', 'view schedule', 'cancel talk', ask about 'past talks', or 'ask @User to talk'.")
        }
      } catch (error) {
        console.error('Error processing mention command:', error)
        await message.reply('Sorry, I encountered an error trying to understand that. Please try again later.')
      }
    }
  })

  client.login(token)
  return client
}

function loadCommands() {
  const commandsPath = path.join(__dirname, 'commands')
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith('.js'))

  return commandFiles.map(function (file) {
    const filePath = path.join(commandsPath, file)
    const command = require(filePath)
    const name = command.data.name
    return { name, command }
  })
}

async function handleInteraction(client, interaction) {
  if (interaction.guildId !== guildId) {
    if (interaction.isRepliable()) {
      try {
        await interaction.reply({
          content: 'This command is not available in this server.',
          ephemeral: true,
        })
      } catch (replyError) {
        console.error('Failed to send guild restriction reply:', replyError)
      }
    }
    return
  }

  if (interaction.isAutocomplete()) return handleAutocomplete(client, interaction)
  if (interaction.isButton()) return handleButton(client, interaction)
  if (!interaction.isChatInputCommand()) return

  const command = client.commands.get(interaction.commandName)
  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`)
    return
  }

  try {
    await command.execute(interaction)
  } catch (error) {
    console.error(error)
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: 'There was an error while executing this command!',
        ephemeral: true,
      })
    } else {
      await interaction.reply({
        content: 'There was an error while executing this command!',
        ephemeral: true,
      })
    }
  }
}

async function handleAutocomplete(client, interaction) {
  const command = client.commands.get(interaction.commandName)
  if (!command || !command.autocomplete) return
  try {
    await command.autocomplete(interaction)
  } catch (err) {
    console.error(err)
  }
}

async function handleButton(client, interaction) {
  const button = parse(interaction.customId)
  const cmd = commands[button.command]
  if (!cmd || !cmd.handleButton) return
  try {
    cmd.handleButton(interaction, button)
  } catch (err) {
    console.error(err)
  }
}
