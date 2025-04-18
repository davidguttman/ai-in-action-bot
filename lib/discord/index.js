const fs = require('node:fs')
const path = require('node:path')
const { parse } = require('node:querystring')
const { Client, Collection, GatewayIntentBits, Events, ChannelType } = require('discord.js')
const { completion } = require('../llm')

const { token } = require('../../config').discord

const commands = {}

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
    if (!message.mentions.has(client.user.id)) return

    if (message.channel.isThread()) {
       console.log('Bot mentioned within a thread, proceeding cautiously.')
    }

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

          console.log(`Created thread: ${thread.name} (${thread.id})`)
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
