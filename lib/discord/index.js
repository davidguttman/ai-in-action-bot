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

const config = require('../../config')
const { token, guildId } = config.discord

const commands = {}
const activeSignups = {} // Stores { threadId: { userId: string, state: string, topic?: string, proposedDates?: Date[], targetUserId?: string, targetUsername?: string, lastUpdated?: number } }

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
      }
      // Simple ordinal suffix logic
      let day = date.getDate()
      let suffix = 'th'
      if (day % 10 === 1 && day !== 11) suffix = 'st'
      else if (day % 10 === 2 && day !== 12) suffix = 'nd'
      else if (day % 10 === 3 && day !== 13) suffix = 'rd'
      // Use replace to add suffix correctly within the formatted string
      return `${index + 1}. ${date.toLocaleDateString('en-US', options).replace(/(\d+)(, \d{4})$/, `$1${suffix}$2`)}`
    })
    .join('\n')
}

// TODO: Implement periodic cleanup for stale activeSignups entries
// function cleanupStaleSignups() {
//   const now = Date.now();
//   const timeout = 60 * 60 * 1000; // 1 hour
//   for (const threadId in activeSignups) {
//     if (activeSignups[threadId].lastUpdated && (now - activeSignups[threadId].lastUpdated > timeout)) {
//       console.log(`Cleaning up stale signup state for thread ${threadId}`);
//       delete activeSignups[threadId];
//     }
//   }
// }
// setInterval(cleanupStaleSignups, 5 * 60 * 1000); // Run every 5 minutes

module.exports = createClient()

function createClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      // GatewayIntentBits.GuildMembers // May be needed later
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

  client.once(Events.ClientReady, () => {
    console.log(`Ready! Logged in as ${client.user.tag}`)
    client.user.setActivity('for speaker sign-ups', { type: 'WATCHING' })
  })

  client.on('interactionCreate', function (action) {
    handleInteraction(client, action)
  })

  client.on(Events.MessageCreate, async (message) => {
    // Ignore bots
    if (message.author.bot) return

    // Ignore messages outside the configured guild
    if (message.guildId !== guildId) {
      console.log(
        `Ignoring message from guild ${message.guildId} - not the configured guild ${guildId}.`,
      )
      return
    }

    // --- Check if message is in an active sign-up thread ---
    const signupInfo = activeSignups[message.channel.id]
    if (
      message.channel.isThread() &&
      signupInfo &&
      message.author.id === signupInfo.userId
    ) {
      console.log(
        `Message received in active signup thread ${message.channel.id} from user ${message.author.id}`,
      )
      signupInfo.lastUpdated = Date.now() // Update timestamp

      // --- State: awaiting_topic ---
      if (signupInfo.state === 'awaiting_topic') {
        console.log('State is awaiting_topic. Processing message as topic.')
        const userMessage = message.content.trim()

        console.log(
          `Checking if message "${userMessage}" looks like a topic using LLM.`,
        )
        const topicCheckSystemMessage =
          "You are an assistant helping determine if a user's message is a presentation topic. Be very permissive - respond with ONLY 'topic' if it could reasonably be a presentation topic (including creative, informal, or technical topics), or 'clarify' only if it's clearly conversational filler, a question, or completely unrelated to presenting."

        try {
          // Wrap LLM topic check
          const intentResponse = await completion({
            systemMessage: topicCheckSystemMessage,
            prompt: userMessage,
          })
          const intent = intentResponse?.trim().toLowerCase()
          console.log(`LLM topic intent check result: ${intent}`)

          if (intent === 'topic') {
            // Message looks like a topic, proceed as before
            const topic = userMessage
            signupInfo.topic = topic
            console.log(
              `Stored topic for thread ${message.channel.id}: "${topic}"`,
            )

            try {
              const availableDates = await findAvailableFridays()
              console.log(`Found available dates:`, availableDates)

              if (!availableDates || availableDates.length === 0) {
                console.log(
                  `No available dates found for thread ${message.channel.id}.`,
                )
                try {
                  // Wrap reply
                  await message.reply(
                    "Sorry, I couldn't find any available slots in the near future. Please check back later or contact an admin.",
                  )
                } catch (replyError) {
                  console.error(
                    `Failed to send no slots reply in thread ${message.channel.id}:`,
                    replyError,
                  )
                }
                delete activeSignups[message.channel.id]
                return
              }

              signupInfo.proposedDates = availableDates
              const formattedDates = formatDatesForDisplay(availableDates)
              const proposalMessage = `Okay, your topic is '**${topic}**'. Here are the next available Fridays:\n${formattedDates}\nWhich date works best for you? (Please reply with the number, e.g., '1')`

              try {
                // Wrap reply
                await message.reply(proposalMessage)
                // Update state only on successful reply
                signupInfo.state = 'awaiting_date_selection'
                console.log(
                  `Updated state for thread ${message.channel.id} to awaiting_date_selection`,
                )
                activeSignups[message.channel.id] = signupInfo
              } catch (replyError) {
                console.error(
                  `Failed to send date proposal reply in thread ${message.channel.id}:`,
                  replyError,
                )
                // Consider cleanup if reply fails
                delete activeSignups[message.channel.id]
              }
            } catch (error) {
              console.error(
                `Error processing topic or finding dates for thread ${message.channel.id}:`,
                error,
              )
              try {
                // Wrap error reply
                await message.reply(
                  'Sorry, something went wrong while trying to find available dates. Please try mentioning me again later.',
                )
              } catch (replyError) {
                console.error(
                  `Failed to send topic processing error reply in thread ${message.channel.id}:`,
                  replyError,
                )
              }
              delete activeSignups[message.channel.id]
            }
          } else {
            // Intent is 'clarify' or something else
            console.log(
              `Message from user in thread ${message.channel.id} doesn't seem like a topic. Asking for clarification.`,
            )
            try {
              // Wrap clarification reply
              await message.reply(
                'Thanks for the reply! To continue scheduling, could you please tell me your presentation topic?',
              )
            } catch (replyError) {
              console.error(
                `Failed to send topic clarification reply in thread ${message.channel.id}:`,
                replyError,
              )
            }
            // Keep state as 'awaiting_topic'
          }
        } catch (llmError) {
          console.error(
            `LLM error during topic intent check for thread ${message.channel.id}:`,
            llmError,
          )
          try {
            // Wrap LLM error reply
            await message.reply(
              'Sorry, I had trouble understanding that. Could you please restate your presentation topic?',
            )
          } catch (replyError) {
            console.error(
              `Failed to send LLM error reply during topic check in thread ${message.channel.id}:`,
              replyError,
            )
          }
          // Keep state as 'awaiting_topic'
        }
        return // Stop processing this message further
      }

      // --- State: awaiting_date_selection ---
      else if (signupInfo.state === 'awaiting_date_selection') {
        console.log(
          'State is awaiting_date_selection. Processing message as date choice.',
        )
        const userReply = message.content.trim()
        const proposedDates = signupInfo.proposedDates

        if (!proposedDates || proposedDates.length === 0) {
          console.error(
            `Error: No proposed dates found in state for thread ${message.channel.id} but state is awaiting_date_selection.`,
          )
          try {
            // Wrap reply
            await message.reply(
              "Sorry, something went wrong, and I don't have the proposed dates anymore. Please try the sign-up process again.",
            )
          } catch (replyError) {
            console.error(
              `Failed to send missing dates error reply in thread ${message.channel.id}:`,
              replyError,
            )
          }
          delete activeSignups[message.channel.id]
          return
        }

        const formattedDatesForLLM = proposedDates
          .map((date, index) => {
            return `${index + 1}: ${date.toISOString().split('T')[0]}`
          })
          .join(', ')

        const dateSelectionSystemMessage = `You are an assistant helping parse user date selection. Given the user's message and a list of proposed dates (format: 'Index: YYYY-MM-DD'), identify which date index (1, 2, or 3) the user selected. Respond with ONLY the number (1, 2, or 3) or 'clarify' if the selection is ambiguous or requests a different date. Dates available: ${formattedDatesForLLM}`

        try {
          // Outer try for LLM + Booking
          console.log(
            `Sending to LLM for date parsing. User message: "${userReply}". Dates: ${formattedDatesForLLM}`,
          )
          const llmResponse = await completion({
            systemMessage: dateSelectionSystemMessage,
            prompt: userReply,
          })
          const parsedChoice = llmResponse?.trim()
          console.log(`LLM parsed choice: ${parsedChoice}`)

          let selectedDateObject = null
          let selectedIndex = -1

          if (
            parsedChoice === '1' ||
            parsedChoice === '2' ||
            parsedChoice === '3'
          ) {
            selectedIndex = parseInt(parsedChoice, 10) - 1
            if (selectedIndex >= 0 && selectedIndex < proposedDates.length) {
              selectedDateObject = proposedDates[selectedIndex]
              console.log(
                `User selected index ${selectedIndex}, Date: ${selectedDateObject.toISOString()}`,
              )
            } else {
              console.warn(
                `LLM returned valid index ${parsedChoice} but it's out of bounds for proposedDates (length ${proposedDates.length})`,
              )
              selectedDateObject = null
            }
          } else {
            console.log(
              'LLM did not return a valid index (1, 2, or 3). Assuming ambiguous.',
            )
          }

          // --- Handle Successful Parsing ---
          if (selectedDateObject) {
            const userId = message.author.id
            const username = message.author.username
            const topic = signupInfo.topic
            const threadId = message.channel.id

            console.log(
              `Attempting to book slot for ${username} (${userId}) on ${selectedDateObject.toISOString()} for topic "${topic}" in thread ${threadId}`,
            )

            try {
              // Inner try for booking + confirmation reply
              const bookingResult = await scheduleSpeaker({
                discordUserId: userId,
                discordUsername: username,
                topic: topic,
                scheduledDate: selectedDateObject,
                threadId: threadId,
              })

              if (bookingResult) {
                const confirmationDateString =
                  selectedDateObject.toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                try {
                  // Wrap reply
                  await message.reply(
                    `Great! You're confirmed to speak on '**${topic}**' on ${confirmationDateString}.`,
                  )
                  console.log(
                    `Booking confirmed for thread ${threadId}. Removing state.`,
                  )
                  delete activeSignups[threadId]
                } catch (replyError) {
                  console.error(
                    `Failed to send confirmation reply in thread ${threadId}:`,
                    replyError,
                  )
                  // Booking succeeded, but reply failed. Logged. State might be stale.
                }
              } else {
                // This case might indicate scheduleSpeaker returned null due to a handled conflict (e.g., duplicate key handled gracefully)
                console.warn(
                  `scheduleSpeaker returned null/falsy for thread ${threadId}, possibly due to handled conflict.`,
                )
                // Re-propose dates (similar to conflict handling in catch block)
                const newAvailableDates = await findAvailableFridays()
                if (!newAvailableDates || newAvailableDates.length === 0) {
                  try {
                    await message.reply(
                      "Hmm, it seems that date might have just been taken, and I couldn't find any other slots right now. Please try signing up again later.",
                    )
                  } catch (replyError) {
                    console.error(
                      'Failed to send conflict/no new dates reply:',
                      replyError,
                    )
                  }
                  delete activeSignups[threadId]
                } else {
                  signupInfo.proposedDates = newAvailableDates
                  activeSignups[threadId] = signupInfo // Save updated state
                  const formattedNewDates =
                    formatDatesForDisplay(newAvailableDates)
                  try {
                    await message.reply(
                      `It seems there was an issue booking that exact slot. Here are the updated available dates:\n${formattedNewDates}\nWhich of these works?`,
                    )
                  } catch (replyError) {
                    console.error(
                      'Failed to send conflict/re-proposal reply:',
                      replyError,
                    )
                  }
                  // State remains 'awaiting_date_selection'
                }
              }
            } catch (bookingError) {
              // CONFLICT HANDLING (Specifically check for duplicate key error code 11000)
              if (
                bookingError.code === 11000 &&
                bookingError.keyPattern &&
                bookingError.keyPattern.scheduledDate
              ) {
                console.log(
                  `Conflict detected for thread ${threadId} on date ${selectedDateObject.toISOString()}. Finding new dates.`,
                )
                const selectedDateString =
                  selectedDateObject.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })
                const newAvailableDates = await findAvailableFridays()
                if (!newAvailableDates || newAvailableDates.length === 0) {
                  try {
                    // Wrap reply
                    await message.reply(
                      `Oops! It looks like the date you selected (${selectedDateString}) just got booked, and unfortunately, I couldn't find any other slots right now. Please try signing up again later.`,
                    )
                  } catch (replyError) {
                    console.error(
                      `Failed to send conflict/no slots reply in thread ${threadId}:`,
                      replyError,
                    )
                  }
                  delete activeSignups[threadId]
                } else {
                  signupInfo.proposedDates = newAvailableDates
                  activeSignups[threadId] = signupInfo
                  const formattedNewDates =
                    formatDatesForDisplay(newAvailableDates)
                  try {
                    // Wrap reply
                    await message.reply(
                      `Oops! It looks like the date you selected (${selectedDateString}) just got booked. Here are the updated available dates:\n${formattedNewDates}\nWhich of these works?`,
                    )
                  } catch (replyError) {
                    console.error(
                      `Failed to send conflict/new dates reply in thread ${threadId}:`,
                      replyError,
                    )
                  }
                  // State remains 'awaiting_date_selection'
                }
              } else {
                // OTHER DB ERROR
                console.error(
                  `Database error during booking for thread ${threadId}:`,
                  bookingError,
                )
                try {
                  // Wrap reply
                  await message.reply(
                    'Sorry, I encountered a database issue while trying to book your slot. Please try again later.',
                  )
                } catch (replyError) {
                  console.error(
                    `Failed to send DB error reply in thread ${threadId}:`,
                    replyError,
                  )
                }
                delete activeSignups[threadId]
              }
            }
          }
          // --- Handle Ambiguous Parsing ---
          else {
            // Ambiguous parse
            console.log(
              `Date selection ambiguous for thread ${message.channel.id}. Asking for clarification.`,
            )
            const formattedOriginalDates = formatDatesForDisplay(proposedDates)
            try {
              // Wrap reply
              await message.reply(
                `Sorry, I didn't quite catch that. Please tell me which of these dates works best by replying with the number (1, 2, or 3):\n${formattedOriginalDates}`,
              )
            } catch (replyError) {
              console.error(
                `Failed to send clarification reply in thread ${message.channel.id}:`,
                replyError,
              )
            }
            // State remains 'awaiting_date_selection'
          }
        } catch (llmError) {
          // Catch LLM errors
          console.error(
            `LLM error during date parsing for thread ${message.channel.id}:`,
            llmError,
          )
          try {
            // Wrap reply
            await message.reply(
              "Sorry, I'm having trouble understanding your choice right now. Please try again.",
            )
          } catch (replyError) {
            console.error(
              `Failed to send LLM error reply in thread ${message.channel.id}:`,
              replyError,
            )
          }
          // State remains 'awaiting_date_selection'
        }
        return // Stop processing this message
      }

      // --- State: awaiting_target_user ---
      else if (signupInfo.state === 'awaiting_target_user') {
        console.log(
          'State is awaiting_target_user. Processing message for user mention.',
        )
        const userMessage = message.content.trim()

        const userMentionRegex = /<@!?(\d+)>/
        const match = userMessage.match(userMentionRegex)

        if (!match) {
          try {
            await message.reply(
              "I don't see a user mention in your message. Please mention the person you'd like to schedule (e.g., @username).",
            )
          } catch (replyError) {
            console.error('Failed to send invalid mention reply:', replyError)
          }
          return
        }

        const targetUserId = match[1]

        try {
          const targetUser = await client.users.fetch(targetUserId)

          if (targetUser.bot) {
            try {
              await message.reply(
                "I can't schedule bots to speak. Please mention a real person.",
              )
            } catch (replyError) {
              console.error('Failed to send bot user reply:', replyError)
            }
            return
          }

          signupInfo.targetUserId = targetUserId
          signupInfo.targetUsername = targetUser.username
          signupInfo.state = 'awaiting_topic_for_others'
          activeSignups[message.channel.id] = signupInfo

          try {
            await message.reply(
              `Great! I'll help you schedule ${targetUser.username} to speak. What topic would you like them to present on?`,
            )
          } catch (replyError) {
            console.error('Failed to send topic prompt reply:', replyError)
          }
        } catch (fetchError) {
          console.error('Error fetching target user:', fetchError)
          try {
            await message.reply(
              "I couldn't find that user. Please make sure you're mentioning a valid Discord user.",
            )
          } catch (replyError) {
            console.error('Failed to send user not found reply:', replyError)
          }
        }
      }
      // --- State: awaiting_topic_for_others ---
      else if (signupInfo.state === 'awaiting_topic_for_others') {
        console.log(
          'State is awaiting_topic_for_others. Processing message as topic.',
        )
        const userMessage = message.content.trim()

        try {
          const topicCheckSystemMessage =
            "You are an assistant helping determine if a user's message is a presentation topic. Be very permissive - respond with ONLY 'topic' if it could reasonably be a presentation topic (including creative, informal, or technical topics), or 'clarify' only if it's clearly conversational filler, a question, or completely unrelated to presenting."
          const intentResponse = await completion({
            systemMessage: topicCheckSystemMessage,
            prompt: userMessage,
          })
          const intent = intentResponse?.trim().toLowerCase()

          if (intent !== 'topic') {
            try {
              await message.reply(
                "That doesn't look like a valid topic. Could you provide a clearer presentation topic?",
              )
            } catch (replyError) {
              console.error('Failed to send invalid topic reply:', replyError)
            }
            return
          }

          signupInfo.topic = userMessage
          console.log(
            `Topic "${userMessage}" accepted for schedule-for-others thread ${message.channel.id}`,
          )

          const availableDates = await findAvailableFridays(3)
          if (!availableDates || availableDates.length === 0) {
            console.log(
              `No available dates found for schedule-for-others thread ${message.channel.id}.`,
            )
            try {
              await message.reply(
                "Sorry, I couldn't find any available slots in the near future. Please check back later or contact an admin.",
              )
            } catch (replyError) {
              console.error('Failed to send no slots reply:', replyError)
            }
            delete activeSignups[message.channel.id]
            return
          }

          signupInfo.proposedDates = availableDates
          const formattedDates = formatDatesForDisplay(availableDates)
          const proposalMessage = `Here are the available dates for ${signupInfo.targetUsername} to speak on "${userMessage}":\n${formattedDates}\nWhich date works best?`

          try {
            await message.reply(proposalMessage)
            signupInfo.state = 'awaiting_date_selection_for_others'
            activeSignups[message.channel.id] = signupInfo
          } catch (replyError) {
            console.error('Failed to send date proposal reply:', replyError)
            delete activeSignups[message.channel.id]
          }
        } catch (error) {
          console.error(
            'Error processing topic for schedule-for-others:',
            error,
          )
          try {
            await message.reply(
              'Sorry, something went wrong while processing the topic. Please try again later.',
            )
          } catch (replyError) {
            console.error(
              'Failed to send topic processing error reply:',
              replyError,
            )
          }
          delete activeSignups[message.channel.id]
        }
      }
      // --- State: awaiting_date_selection_for_others ---
      else if (signupInfo.state === 'awaiting_date_selection_for_others') {
        console.log(
          'State is awaiting_date_selection_for_others. Processing date selection.',
        )
        const userMessage = message.content.trim()
        const { proposedDates, topic, targetUserId, targetUsername } =
          signupInfo

        if (!proposedDates || proposedDates.length === 0) {
          console.error(
            'Error: No proposed dates found in state for schedule-for-others thread',
          )
          try {
            await message.reply(
              "Sorry, something went wrong, and I don't have the proposed dates anymore. Please try the scheduling process again.",
            )
          } catch (replyError) {
            console.error(
              'Failed to send missing dates error reply:',
              replyError,
            )
          }
          delete activeSignups[message.channel.id]
          return
        }

        const formattedDatesForLLM = proposedDates
          .map(
            (date, index) =>
              `${index + 1}. ${date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
          )
          .join('\n')

        try {
          const llmResponse = await completion({
            systemMessage: `Parse the user's date selection from these options:\n${formattedDatesForLLM}\n\nRespond with ONLY the date in YYYY-MM-DD format, or "invalid" if unclear.`,
            prompt: userMessage,
          })

          const selectedDateString = llmResponse?.trim()
          let selectedDateObject = null

          if (selectedDateString && selectedDateString !== 'invalid') {
            selectedDateObject = proposedDates.find(
              (date) => date.toISOString().split('T')[0] === selectedDateString,
            )
          }

          if (selectedDateObject) {
            try {
              const bookingResult = await scheduleSpeaker({
                discordUserId: targetUserId,
                discordUsername: targetUsername,
                topic: topic,
                scheduledDate: selectedDateObject,
                threadId: message.channel.id,
                schedulerUserId: message.author.id,
                schedulerUsername: message.author.username,
              })

              if (bookingResult) {
                const confirmationDateString =
                  selectedDateObject.toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })

                try {
                  await message.reply(
                    `Perfect! I've scheduled ${targetUsername} to speak on '**${topic}**' on ${confirmationDateString}. They should receive a notification about this.`,
                  )

                  try {
                    const targetUser = await client.users.fetch(targetUserId)
                    await targetUser.send(
                      `Hi ${targetUsername}! ${message.author.username} has scheduled you to speak on '**${topic}**' on ${confirmationDateString}. If you have any questions, please reach out to them or the server admins.`,
                    )
                  } catch (dmError) {
                    console.log(
                      `Could not send DM to ${targetUsername}:`,
                      dmError,
                    )
                  }

                  delete activeSignups[message.channel.id]
                } catch (replyError) {
                  console.error(
                    'Failed to send booking confirmation reply:',
                    replyError,
                  )
                }
              } else {
                // Handle booking conflict - reuse existing logic pattern
                console.log(
                  'Booking conflict detected for schedule-for-others, finding new dates',
                )
                const newAvailableDates = await findAvailableFridays(3)

                if (!newAvailableDates || newAvailableDates.length === 0) {
                  try {
                    await message.reply(
                      `Hmm, it seems that date might have just been taken, and I couldn't find any other slots right now. Please try scheduling ${targetUsername} again later.`,
                    )
                  } catch (replyError) {
                    console.error(
                      'Failed to send conflict/no new dates reply:',
                      replyError,
                    )
                  }
                  delete activeSignups[message.channel.id]
                } else {
                  signupInfo.proposedDates = newAvailableDates
                  activeSignups[message.channel.id] = signupInfo
                  const formattedNewDates =
                    formatDatesForDisplay(newAvailableDates)
                  try {
                    await message.reply(
                      `It seems there was an issue booking that exact slot. Here are the updated available dates for ${targetUsername}:\n${formattedNewDates}\nWhich of these works?`,
                    )
                  } catch (replyError) {
                    console.error(
                      'Failed to send conflict/re-proposal reply:',
                      replyError,
                    )
                  }
                }
              }
            } catch (bookingError) {
              console.error(
                'Database error during schedule-for-others booking:',
                bookingError,
              )
              try {
                await message.reply(
                  'Sorry, I encountered a database issue while trying to book the slot. Please try again later.',
                )
              } catch (replyError) {
                console.error('Failed to send DB error reply:', replyError)
              }
              delete activeSignups[message.channel.id]
            }
          } else {
            try {
              await message.reply(
                "I couldn't understand which date you selected. Please choose one of the numbered options or be more specific.",
              )
            } catch (replyError) {
              console.error('Failed to send invalid date reply:', replyError)
            }
          }
        } catch (llmError) {
          console.error(
            'Error during LLM date parsing for schedule-for-others:',
            llmError,
          )
          try {
            await message.reply(
              'Sorry, I had trouble understanding your date selection. Please try again.',
            )
          } catch (replyError) {
            console.error('Failed to send LLM error reply:', replyError)
          }
        }
      }
      // --- Other States (Optional) ---
      else {
        console.log(
          `Message received in thread ${message.channel.id} with unhandled state: ${signupInfo.state}`,
        )
        // Maybe send a generic "I'm waiting for X..." message or ignore.
      }

      // If the message in the thread wasn't handled by state logic, stop further processing.
      return
    } // --- End of active sign-up thread check ---

    // --- Check if the bot was mentioned *at the beginning* of the message in a main channel ---
    const mentionPrefix1 = `<@${client.user.id}>`
    const mentionPrefix2 = `<@!${client.user.id}>` // Mentions can sometimes include '!' (nickname mention)
    const trimmedContent = message.content.trim()

    // Only proceed if NOT in a thread (already handled above) AND message starts with mention
    if (
      !message.channel.isThread() &&
      (trimmedContent.startsWith(mentionPrefix1) ||
        trimmedContent.startsWith(mentionPrefix2))
    ) {
      console.log(
        `Bot mentioned at start by ${message.author.tag} in channel ${message.channel.id}`,
      )

      // Extract the message content *after* the mention
      let userMessageContent = ''
      if (trimmedContent.startsWith(mentionPrefix1)) {
        userMessageContent = trimmedContent
          .substring(mentionPrefix1.length)
          .trim()
      } else if (trimmedContent.startsWith(mentionPrefix2)) {
        userMessageContent = trimmedContent
          .substring(mentionPrefix2.length)
          .trim()
      }

      // Handle case where message only contains the mention
      if (!userMessageContent) {
        userMessageContent = 'help' // Default action if only mentioned
        console.log(
          'Mention was the only content, setting effective message to "help"',
        )
      }

      // **LLM Intent Detection**
      try {
        // Outer try for intent detection + handling
        const intentSystemMessage =
          "You are an assistant classifying user intent in a Discord message where the bot was mentioned. Possible intents are 'sign_up', 'view_schedule', 'cancel_talk', 'query_talks', 'zoom_link', 'schedule_for_others', 'debug', or 'other'.\n- Classify as 'sign_up' ONLY if the user explicitly asks to sign up, volunteer, present, or talk.\n- Classify as 'view_schedule' ONLY if the user explicitly asks to see the schedule, upcoming talks, or who is speaking.\n- Classify as 'cancel_talk' ONLY if the user explicitly asks to cancel, withdraw, or back out of their scheduled talk.\n- Classify as 'query_talks' ONLY if the user is asking about past talks, previous topics, or if specific topics have been covered before.\n- Classify as 'zoom_link' ONLY if the user is asking for a zoom link, meeting link, presentation link, meeting URL, or any variation of requesting a link/URL for meetings/presentations.\n- Classify as 'schedule_for_others' ONLY if the user explicitly asks to schedule someone else, book someone else, or sign up another person for a talk.\n- Classify as 'debug' ONLY if the user asks for debug info, debug logs, debugging, troubleshooting, or wants to see how the bot processes messages.\n- Otherwise, classify as 'other'. This includes simple replies, acknowledgements, questions not related to the above, or unclear requests.\nRespond with ONLY the intent name ('sign_up', 'view_schedule', 'cancel_talk', 'query_talks', 'zoom_link', 'schedule_for_others', 'debug', 'other')."

        console.log(`Sending to LLM: "${userMessageContent}"`)
        const intentResponse = await completion({
          systemMessage: intentSystemMessage,
          prompt: userMessageContent,
        })
        const detectedIntent = intentResponse?.trim().toLowerCase()
        console.log(`LLM detected intent: ${detectedIntent}`)

        // --- Handle 'sign_up' Intent ---
        if (detectedIntent === 'sign_up') {
          if (!message.channel.threads) {
            console.warn(
              `Channel ${message.channel.id} does not support threads.`,
            )
            try {
              // Wrap reply
              await message.reply(
                "Sorry, I can't create sign-up threads in this channel.",
              )
            } catch (replyError) {
              console.error(
                'Failed to send no thread support reply:',
                replyError,
              )
            }
            return
          }

          try {
            // Inner try for thread creation + initial send
            const thread = await message.startThread({
              name: `Speaker Sign-up - ${message.author.username}`,
              autoArchiveDuration: 60,
              reason: `Initiating speaker sign-up process for ${message.author.tag}`,
            })

            console.log(
              `Created thread: ${thread.name} (${thread.id}) for user ${message.author.id}`,
            )

            activeSignups[thread.id] = {
              userId: message.author.id,
              state: 'awaiting_topic',
              lastUpdated: Date.now(),
            }
            console.log(
              `Stored initial state for thread ${thread.id}:`,
              activeSignups[thread.id],
            )

            try {
              // Wrap initial send
              await thread.send(
                `Hi ${message.author}, thanks for offering to speak! To get you scheduled, could you please tell me your presentation topic?`,
              )
            } catch (sendError) {
              console.error(
                `Failed to send initial message to thread ${thread.id}:`,
                sendError,
              )
              // Optionally try to inform user in main channel if thread send failed
              // try { await message.reply("I created the thread, but couldn't send the first message.").catch(e => console.error("...")) } catch(e){}
            }
          } catch (threadError) {
            console.error(
              'Error creating thread or sending initial message:',
              threadError,
            )
            try {
              // Wrap error reply
              await message.reply(
                "Sorry, I couldn't start the sign-up thread. Please try again later or contact an admin.",
              )
            } catch (replyError) {
              console.error(
                'Failed to send thread creation error reply:',
                replyError,
              )
            }
          }
        }
        // --- Handle 'view_schedule' Intent ---
        else if (detectedIntent === 'view_schedule') {
          console.log('View schedule intent detected.')
          try {
            // Inner try for getting schedule + replying
            const limit = 5
            const upcomingSpeakers = await getUpcomingSchedule(limit)
            console.log(
              `Retrieved ${upcomingSpeakers.length} upcoming speakers.`,
            )

            if (!upcomingSpeakers || upcomingSpeakers.length === 0) {
              try {
                // Wrap reply
                await message.reply(
                  'There are currently no speakers scheduled.',
                )
              } catch (replyError) {
                console.error('Failed to send no speakers reply:', replyError)
              }
            } else {
              const scheduleLines = upcomingSpeakers.map((speaker) => {
                const formattedDate = speaker.scheduledDate.toLocaleDateString(
                  'en-US',
                  {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  },
                )
                const userDisplay = speaker.discordUsername
                return `- ${formattedDate}: @${userDisplay} - "${speaker.topic}"`
              })

              const scheduleMessage = `**Upcoming Speakers (Next ${limit}):**\n${scheduleLines.join('\n')}`
              try {
                // Wrap reply
                await message.reply(scheduleMessage)
              } catch (replyError) {
                console.error('Failed to send schedule reply:', replyError)
              }
            }
          } catch (dbError) {
            console.error('Database error retrieving schedule:', dbError)
            try {
              // Wrap error reply
              await message.reply(
                "Sorry, I couldn't retrieve the schedule due to a database error.",
              )
            } catch (replyError) {
              console.error(
                'Failed to send DB error schedule reply:',
                replyError,
              )
            }
          }
        }
        // --- Handle 'cancel_talk' Intent ---
        else if (detectedIntent === 'cancel_talk') {
          console.log(
            `Cancel talk intent detected for user ${message.author.id}.`,
          )
          try {
            // Inner try for cancelling talk + replying
            const cancelledTalk = await cancelSpeaker(message.author.id)

            if (cancelledTalk) {
              const formattedDate =
                cancelledTalk.scheduledDate.toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })
              try {
                // Wrap reply
                await message.reply(
                  `Okay, I have cancelled your talk "${cancelledTalk.topic}" scheduled for ${formattedDate}.`,
                )
              } catch (replyError) {
                console.error(
                  'Failed to send cancel confirmation reply:',
                  replyError,
                )
              }
            } else {
              try {
                // Wrap reply
                await message.reply(
                  "You don't seem to have an upcoming talk scheduled that I can cancel.",
                )
              } catch (replyError) {
                console.error(
                  'Failed to send no talk to cancel reply:',
                  replyError,
                )
              }
            }
          } catch (error) {
            console.error(
              `Error processing cancel_talk for ${message.author.id}:`,
              error,
            )
            try {
              // Wrap error reply
              await message.reply(
                'Sorry, I encountered an error trying to cancel your talk. Please try again later or contact an admin.',
              )
            } catch (replyError) {
              console.error('Failed to send cancel error reply:', replyError)
            }
          }
        }
        // --- Handle 'query_talks' Intent ---
        else if (detectedIntent === 'query_talks') {
          console.log('Query talks intent detected.')
          try {
            const talkHistory = require('../talkHistory')

            const queryTypeSystemMessage =
              "You are an assistant classifying talk history queries. Possible types are 'existence_check' (asking if a topic has been covered), 'list_talks' (asking for talks about a topic), or 'other'. Respond with ONLY the query type followed by the topic in question, e.g., 'existence_check: AI agents' or 'list_talks: machine learning'."

            const queryTypeResponse = await completion({
              systemMessage: queryTypeSystemMessage,
              prompt: userMessageContent,
            })

            const [queryType, topic] = queryTypeResponse
              .split(':')
              .map((s) => s.trim())

            if (queryType === 'existence_check' && topic) {
              const relatedTalks = await talkHistory.findRelatedTalks(topic)

              if (relatedTalks.length > 0) {
                const talksList = relatedTalks
                  .map((talk) => {
                    const formattedDate = talk.scheduledDate.toLocaleDateString(
                      'en-US',
                      {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      },
                    )
                    return `- ${formattedDate}: @${talk.discordUsername} - "${talk.topic}"`
                  })
                  .join('\n')

                await message.reply(
                  `Yes, there have been talks about ${topic}:\n${talksList}`,
                )
              } else {
                await message.reply(
                  `No, I don't see any previous talks about ${topic}.`,
                )
              }
            } else if (queryType === 'list_talks' && topic) {
              const relatedTalks = await talkHistory.findRelatedTalks(topic)

              if (relatedTalks.length > 0) {
                const talksList = relatedTalks
                  .map((talk) => {
                    const formattedDate = talk.scheduledDate.toLocaleDateString(
                      'en-US',
                      {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      },
                    )
                    return `- ${formattedDate}: @${talk.discordUsername} - "${talk.topic}"`
                  })
                  .join('\n')

                await message.reply(
                  `Here are the talks related to ${topic}:\n${talksList}`,
                )
              } else {
                await message.reply(
                  `I couldn't find any talks related to ${topic}.`,
                )
              }
            } else {
              await message.reply(
                "I'm not sure what you're asking about past talks. You can ask if a topic has been covered before or what talks have been about a specific topic.",
              )
            }
          } catch (error) {
            console.error('Error processing talk query:', error)
            await message.reply(
              'Sorry, I encountered an error while searching for past talks.',
            )
          }
        }
        // --- Handle 'zoom_link' Intent ---
        else if (detectedIntent === 'zoom_link') {
          console.log('Zoom link intent detected.')
          const zoomLink = config.zoomLink
          const zoomPassword = config.zoomPassword

          if (!message.channel.threads) {
            console.warn(
              `Channel ${message.channel.id} does not support threads for zoom link.`,
            )
            try {
              let replyMessage
              if (zoomLink) {
                replyMessage = `Here's the zoom link for our meetings: ${zoomLink}`
                if (zoomPassword) {
                  replyMessage += `\nPassword: ${zoomPassword}`
                }
              } else {
                replyMessage =
                  "Sorry, I don't have a zoom link configured. Please contact an admin."
              }
              await message.reply(replyMessage)
            } catch (replyError) {
              console.error('Failed to send zoom link reply:', replyError)
            }
            return
          }

          try {
            const thread = await message.startThread({
              name: `Zoom Link - ${message.author.username}`,
              autoArchiveDuration: 60,
              reason: `Zoom link request from ${message.author.tag}`,
            })

            console.log(
              `Created thread for zoom link: ${thread.name} (${thread.id})`,
            )

            if (zoomLink) {
              try {
                let threadMessage = `Here's the zoom link for our meetings: ${zoomLink}`
                if (zoomPassword) {
                  threadMessage += `\nPassword: ${zoomPassword}`
                }
                await thread.send(threadMessage)
              } catch (sendError) {
                console.error(
                  `Failed to send zoom link to thread ${thread.id}:`,
                  sendError,
                )
              }
            } else {
              try {
                await thread.send(
                  "Sorry, I don't have a zoom link configured. Please contact an admin.",
                )
              } catch (sendError) {
                console.error(
                  `Failed to send no zoom link message to thread ${thread.id}:`,
                  sendError,
                )
              }
            }
          } catch (threadError) {
            console.error('Error creating thread for zoom link:', threadError)
            try {
              await message.reply(
                "Sorry, I couldn't create a thread for the zoom link. Please try again later.",
              )
            } catch (replyError) {
              console.error(
                'Failed to send thread creation error reply:',
                replyError,
              )
            }
          }
        }
        // --- Handle 'schedule_for_others' Intent ---
        else if (detectedIntent === 'schedule_for_others') {
          console.log('Schedule for others intent detected.')
          if (!message.channel.threads) {
            console.warn(
              `Channel ${message.channel.id} does not support threads for schedule_for_others.`,
            )
            try {
              await message.reply(
                "Sorry, I can't create scheduling threads in this channel.",
              )
            } catch (replyError) {
              console.error(
                'Failed to send no thread support reply:',
                replyError,
              )
            }
            return
          }

          try {
            const thread = await message.startThread({
              name: `Schedule Someone - ${message.author.username}`,
              autoArchiveDuration: 60,
              reason: `Initiating schedule-for-others process for ${message.author.tag}`,
            })

            console.log(
              `Created schedule-for-others thread: ${thread.name} (${thread.id}) for user ${message.author.id}`,
            )

            activeSignups[thread.id] = {
              userId: message.author.id,
              state: 'awaiting_target_user',
              lastUpdated: Date.now(),
            }

            try {
              await thread.send(
                `Hi ${message.author}, I'll help you schedule someone else to speak! Please mention the person you'd like to schedule (e.g., @username).`,
              )
            } catch (sendError) {
              console.error(
                `Failed to send initial message to schedule-for-others thread ${thread.id}:`,
                sendError,
              )
            }
          } catch (threadError) {
            console.error(
              'Error creating schedule-for-others thread:',
              threadError,
            )
            try {
              await message.reply(
                "Sorry, I couldn't start the scheduling thread. Please try again later or contact an admin.",
              )
            } catch (replyError) {
              console.error(
                'Failed to send thread creation error reply:',
                replyError,
              )
            }
          }
        }
        // --- Handle 'debug' Intent ---
        else if (detectedIntent === 'debug') {
          console.log('Debug intent detected.')
          try {
            // Collect debug information
            const debugInfo = {
              originalMessage: message.content,
              trimmedContent: trimmedContent,
              userMessageContent: userMessageContent,
              detectedIntent: detectedIntent,
              userId: message.author.id,
              username: message.author.username,
              channelId: message.channel.id,
              channelType: message.channel.type,
              isThread: message.channel.isThread(),
              guildId: message.guildId,
              timestamp: new Date().toISOString()
            }

            // Check if user has any active signup threads
            const activeSignupThreads = Object.entries(activeSignups)
              .filter(([threadId, signup]) => signup.userId === message.author.id)
              .map(([threadId, signup]) => ({
                threadId,
                state: signup.state,
                topic: signup.topic || 'not set',
                lastUpdated: signup.lastUpdated ? new Date(signup.lastUpdated).toISOString() : 'unknown'
              }))

            const debugMessage = `🔍 **Debug Information**

**Message Processing:**
• Original message: \`${debugInfo.originalMessage}\`
• Cleaned content sent to LLM: \`${debugInfo.userMessageContent}\`
• Detected intent: \`${debugInfo.detectedIntent}\`

**User Context:**
• User ID: \`${debugInfo.userId}\`
• Username: \`${debugInfo.username}\`
• Channel ID: \`${debugInfo.channelId}\`
• Is thread: \`${debugInfo.isThread}\`
• Guild ID: \`${debugInfo.guildId}\`

**Active Signups:**
${activeSignupThreads.length > 0 
  ? activeSignupThreads.map(thread => 
      `• Thread \`${thread.threadId}\`: ${thread.state} (topic: "${thread.topic}", updated: ${thread.lastUpdated})`
    ).join('\n')
  : '• No active signup threads for this user'
}

**Next Steps:**
Based on the detected intent \`${debugInfo.detectedIntent}\`, the bot would:
${detectedIntent === 'sign_up' ? '✅ Create a new speaker signup thread' :
  detectedIntent === 'view_schedule' ? '✅ Display the upcoming speaker schedule' :
  detectedIntent === 'cancel_talk' ? '✅ Cancel your scheduled talk (if any)' :
  detectedIntent === 'query_talks' ? '✅ Search past talk history' :
  detectedIntent === 'zoom_link' ? '✅ Provide the meeting link in a private thread' :
  detectedIntent === 'schedule_for_others' ? '✅ Start the process to schedule someone else' :
  '❓ Provide help with available commands'}

**Timestamp:** \`${debugInfo.timestamp}\``

            await message.reply(debugMessage)
          } catch (error) {
            console.error('Error generating debug information:', error)
            try {
              await message.reply(
                '🔍 Debug mode activated, but I encountered an error generating the debug information. Check the console logs for details.'
              )
            } catch (replyError) {
              console.error('Failed to send debug error reply:', replyError)
            }
          }
        }
        // --- Handle 'other' or Unrecognized Intent ---
        else {
          // Handles 'other' or any unrecognized intent from LLM
          console.log(
            `LLM intent classified as '${detectedIntent}'. No specific action taken.`,
          )
          // Send a keyword-focused help message if intent is 'other' or unclear
          try {
            const keywordsMessage = `I'm not sure what you're asking for. Here are the keywords I understand:

**📝 Speaking & Scheduling:**
• \`sign up\` - Volunteer to give a presentation
• \`schedule someone else\` - Book someone else to speak

**📅 Schedule Management:**
• \`view schedule\` - See upcoming talks
• \`cancel talk\` - Cancel your scheduled presentation

**🔍 Talk History:**
• \`query talks\` or \`past talks\` - Search previous presentations

**🔗 Meeting Info:**
• \`zoom link\` - Get the meeting link

**🔍 Troubleshooting:**
• \`debug\` - Show detailed processing information

Try mentioning me with one of these keywords!`
            await message.reply(keywordsMessage)
          } catch (e) {
            console.error(e)
          }
        }
      } catch (llmError) {
        // Catch LLM intent detection errors
        console.error('Error during LLM intent detection:', llmError)
        try {
          // Wrap error reply
          await message.reply(
            "Sorry, I'm having trouble understanding requests right now. Please try again later.",
          )
        } catch (replyError) {
          console.error('Failed to send LLM error reply to user:', replyError)
        }
      }
    } // --- End of mention-at-start check ---
  }) // End of messageCreate listener

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
  // Ignore interactions outside the configured guild
  if (interaction.guildId !== guildId) {
    console.log(
      `Ignoring interaction from guild ${interaction.guildId} - not the configured guild ${guildId}.`,
    )
    if (interaction.isRepliable()) {
      try {
        await interaction.reply({
          content: 'This command is not available in this server.',
          ephemeral: true,
        })
      } catch (replyError) {
        console.error(
          `Failed to send guild restriction reply for interaction in guild ${interaction.guildId}:`,
          replyError,
        )
      }
    }
    return
  }

  if (interaction.isAutocomplete())
    return handleAutocomplete(client, interaction)
  if (interaction.isButton()) return handleButton(client, interaction)
  if (!interaction.isChatInputCommand()) return

  console.log({
    commandName: interaction.commandName,
    userTag: interaction.user.tag,
    channelName: interaction.channel.name,
  })

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
  if (!command) return

  if (!command.autocomplete) return

  try {
    await command.autocomplete(interaction)
  } catch (err) {
    console.error(err)
  }
}

async function handleButton(client, interaction) {
  const button = parse(interaction.customId)
  console.log(button)
  const cmd = commands[button.command]
  if (!cmd) return
  const handler = cmd.handleButton
  if (!handler) return
  handler(interaction, button)
}
