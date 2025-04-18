const fs = require('node:fs')
const path = require('node:path')
const { parse } = require('node:querystring')
const { Client, Collection, GatewayIntentBits, Events, ChannelType } = require('discord.js')
const { completion } = require('../llm')
const { findAvailableFridays, scheduleSpeaker } = require('../schedulingLogic')

const { token } = require('../../config').discord

const commands = {}
const activeSignups = {}

module.exports = createClient()

function createClient () {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  })

  client.commands = new Collection()
  loadCommands().forEach(
    ({ name, command }) => {
      commands[name] = command
      client.commands.set(name, command)
    }
  )

  client.on('interactionCreate', function (action) {
    handleInteraction(client, action)
  })

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return

    const signupInfo = activeSignups[message.channel.id]
    if (message.channel.isThread() && signupInfo && message.author.id === signupInfo.userId) {
      console.log(`Message received in active signup thread ${message.channel.id} from user ${message.author.id}`)

      if (signupInfo.state === 'awaiting_topic') {
        console.log('State is awaiting_topic. Processing message as topic.')
        const topic = message.content.trim()
        signupInfo.topic = topic

        console.log(`Stored topic for thread ${message.channel.id}: \"${topic}\"`)

        try {
          const availableDates = await findAvailableFridays()
          console.log(`Found available dates:`, availableDates)

          if (!availableDates || availableDates.length === 0) {
            console.log(`No available dates found for thread ${message.channel.id}.`)
            await message.reply("Sorry, I couldn't find any available slots in the near future. Please check back later or contact an admin.")
            delete activeSignups[message.channel.id]
            return
          }

          signupInfo.proposedDates = availableDates

          const formattedDates = formatDatesForDisplay(availableDates)

          const proposalMessage = `Okay, your topic is '**${topic}**'. Here are the next available Fridays:\n${formattedDates}\nWhich date works best for you? (Please reply with the number, e.g., '1')`

          await message.reply(proposalMessage)

          signupInfo.state = 'awaiting_date_selection'
          console.log(`Updated state for thread ${message.channel.id} to awaiting_date_selection`)
          activeSignups[message.channel.id] = signupInfo

        } catch (error) {
          console.error(`Error processing topic or finding dates for thread ${message.channel.id}:`, error)
          await message.reply("Sorry, something went wrong while trying to find available dates. Please try mentioning me again later.")
          delete activeSignups[message.channel.id]
        }
        return
      }

      else if (signupInfo.state === 'awaiting_date_selection') {
        console.log('State is awaiting_date_selection. Processing message as date choice.')
        const userReply = message.content.trim();
        const proposedDates = signupInfo.proposedDates;

        if (!proposedDates || proposedDates.length === 0) {
          console.error(`Error: No proposed dates found in state for thread ${message.channel.id} but state is awaiting_date_selection.`);
          await message.reply("Sorry, something went wrong, and I don't have the proposed dates anymore. Please try the sign-up process again.");
          delete activeSignups[message.channel.id];
          return;
        }

        const formattedDatesForLLM = proposedDates.map((date, index) => {
          return `${index + 1}: ${date.toISOString().split('T')[0]}`;
        }).join(', ');

        const systemMessage = `You are an assistant helping parse user date selection. Given the user's message and a list of proposed dates (format: 'Index: YYYY-MM-DD'), identify which date index (1, 2, or 3) the user selected. Respond with ONLY the number (1, 2, or 3) or 'clarify' if the selection is ambiguous or requests a different date. Dates available: ${formattedDatesForLLM}`;

        try {
          console.log(`Sending to LLM for date parsing. User message: \"${userReply}\". Dates: ${formattedDatesForLLM}`);
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
               selectedDateObject = null; 
            }
          } else {
            console.log('LLM did not return a valid index (1, 2, or 3). Assuming ambiguous.');
          }

          if (selectedDateObject) {
            const userId = message.author.id;
            const username = message.author.username;
            const topic = signupInfo.topic;
            const threadId = message.channel.id;

            console.log(`Attempting to book slot for ${username} (${userId}) on ${selectedDateObject.toISOString()} for topic \"${topic}\" in thread ${threadId}`);

            try {
              const bookingResult = await scheduleSpeaker({ 
                discordUserId: userId, 
                discordUsername: username, 
                topic: topic, 
                scheduledDate: selectedDateObject,
                threadId: threadId
              });

              if (bookingResult) {
                const confirmationDateString = selectedDateObject.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                await message.reply(`Great! You're confirmed to speak on '**${topic}**' on ${confirmationDateString}.`);
                console.log(`Booking confirmed for thread ${threadId}. Removing state.`);
                delete activeSignups[threadId];
              } else {
                console.warn(`scheduleSpeaker returned falsy value for thread ${threadId}, expected either success or error.`);
                await message.reply("Hmm, something unexpected happened while booking. Let's try finding new dates.");
                const newAvailableDates = await findAvailableFridays();
                if (!newAvailableDates || newAvailableDates.length === 0) {
                   await message.reply("Sorry, I couldn't find any available slots right now. Please try signing up again later.");
                   delete activeSignups[threadId];
                } else {
                   signupInfo.proposedDates = newAvailableDates;
                   activeSignups[threadId] = signupInfo;
                   const formattedNewDates = formatDatesForDisplay(newAvailableDates);
                   await message.reply(`It seems there was an issue. Here are the updated available dates:\n${formattedNewDates}\nWhich of these works?`);
                }
              }
            } catch (bookingError) {
              if (bookingError.message && bookingError.message.includes('duplicate key') || bookingError.code === 11000) { 
                 console.log(`Conflict detected for thread ${threadId} on date ${selectedDateObject.toISOString()}. Finding new dates.`);
                 const selectedDateString = selectedDateObject.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
                 
                 const newAvailableDates = await findAvailableFridays();
                 
                 if (!newAvailableDates || newAvailableDates.length === 0) {
                    await message.reply(`Oops! It looks like the date you selected (${selectedDateString}) just got booked, and unfortunately, I couldn't find any other slots right now. Please try signing up again later.`);
                    delete activeSignups[threadId];
                 } else {
                    signupInfo.proposedDates = newAvailableDates;
                    activeSignups[threadId] = signupInfo;

                    const formattedNewDates = formatDatesForDisplay(newAvailableDates);

                    await message.reply(`Oops! It looks like the date you selected (${selectedDateString}) just got booked. Here are the updated available dates:\n${formattedNewDates}\nWhich of these works?`);
                 }
              } else {
                console.error(`Database error during booking for thread ${threadId}:`, bookingError);
                await message.reply("Sorry, I encountered a database issue while trying to book your slot. Please try again later.");
                delete activeSignups[threadId];
              }
            }
          } 
          else {
            console.log(`Date selection ambiguous for thread ${message.channel.id}. Asking for clarification.`);
            const formattedOriginalDates = formatDatesForDisplay(proposedDates); 
            await message.reply(`Sorry, I didn't quite catch that. Please tell me which of these dates works best by replying with the number (1, 2, or 3):\n${formattedOriginalDates}`);
          }

        } catch (llmError) {
          console.error(`LLM error during date parsing for thread ${message.channel.id}:`, llmError);
          await message.reply("Sorry, I'm having trouble understanding your choice right now. Please try again.");
        }
        return;
      }

      else {
          console.log(`Message received in thread ${message.channel.id} with unhandled state: ${signupInfo.state}`)
      }

      return
    }

    if (!message.mentions.has(client.user.id)) return

    console.log(`Bot mentioned by ${message.author.tag} in channel ${message.channel.id}`)
    const userMessageContent = message.content.replace(/<@!?\d+>/g, '').trim()

    try {
      const systemMessage = "You are a helpful assistant determining user intent. The user might want to 'sign_up' to speak or 'view_schedule'. Respond with only the intent name (e.g., 'sign_up' or 'view_schedule')."
      
      console.log(`Sending to LLM: "${userMessageContent}"`)
      const intentResponse = await completion({
        systemMessage: systemMessage, 
        prompt: userMessageContent
      })
      const detectedIntent = intentResponse?.trim().toLowerCase()
      console.log(`LLM detected intent: ${detectedIntent}`)

      if (detectedIntent === 'sign_up') {
        if (!message.channel.threads) {
           console.warn(`Channel ${message.channel.id} does not support threads.`)
           return 
        }

        try {
          const thread = await message.startThread({
            name: `Speaker Sign-up - ${message.author.username}`,
            autoArchiveDuration: 60,
            reason: `Initiating speaker sign-up process for ${message.author.tag}`
          })

          console.log(`Created thread: ${thread.name} (${thread.id}) for user ${message.author.id}`)

          activeSignups[thread.id] = {
            userId: message.author.id,
            state: 'awaiting_topic'
          }
          console.log(`Stored initial state for thread ${thread.id}:`, activeSignups[thread.id])

          await thread.send(`Hi ${message.author}, thanks for offering to speak! To get you scheduled, could you please tell me your presentation topic?`)

        } catch (threadError) {
          console.error('Error creating thread or sending initial message:', threadError)
          try {
            await message.reply("Sorry, I couldn't start the sign-up thread. Please try again later or contact an admin.")
          } catch (replyError) {
            console.error('Failed to send error reply to user:', replyError)
          }
        }
      } else if (detectedIntent === 'view_schedule') {
          console.log('View schedule intent detected (handler not implemented yet).')
      } else {
          console.log('LLM did not return a recognized intent.')
      }

    } catch (llmError) {
      console.error('Error during LLM intent detection:', llmError)
      try {
          await message.reply("Sorry, I'm having trouble understanding requests right now. Please try again later.")
      } catch (replyError) {
          console.error('Failed to send LLM error reply to user:', replyError)
      }
    }
  })

  client.login(token)

  return client
}

function loadCommands () {
  const commandsPath = path.join(__dirname, 'commands')
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter(file => file.endsWith('.js'))

  return commandFiles.map(function (file) {
    const filePath = path.join(commandsPath, file)
    const command = require(filePath)
    const name = command.data.name

    return { name, command }
  })
}

async function handleInteraction (client, interaction) {
  if (interaction.isAutocomplete()) return handleAutocomplete(client, interaction)
  if (interaction.isButton()) return handleButton(client, interaction)
  if (!interaction.isChatInputCommand()) return

  console.log({
    commandName: interaction.commandName,
    userTag: interaction.user.tag,
    channelName: interaction.channel.name
  })

  const command = client.commands.get(interaction.commandName)
  if (!command) return

  try {
    await command.execute(interaction)
  } catch (error) {
    console.error(error)
    await interaction.reply({
      content: 'There was an error while executing this command!',
      ephemeral: true
    })
  }
}

async function handleAutocomplete (client, interaction) {
  const command = client.commands.get(interaction.commandName)
  if (!command) return

  if (!command.autocomplete) return

  try {
    await command.autocomplete(interaction)
  } catch (err) {
    console.error(err)
  }
}

async function handleButton (client, interaction) {
  const button = parse(interaction.customId)
  console.log(button)
  const cmd = commands[button.command]
  if (!cmd) return
  const handler = cmd.handleButton
  if (!handler) return
  handler(interaction, button)
}

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
