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
const { createMessageHandler } = require('../shared/message-handler')

const config = require('../../config')
const { token, guildId } = config.discord

const commands = {}
const activeSignups = {} // Stores { threadId: { userId: string, state: string, topic?: string, proposedDates?: Date[], targetUserId?: string, targetUsername?: string, lastUpdated?: number } }

// (Formatting helper removed; shared handler contains presentation logic.)

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

  const sharedHandleMessage = createMessageHandler({
    client,
    activeSignups,
    guildId,
  })

  client.on(Events.MessageCreate, async (message) => {
    return await sharedHandleMessage(message)
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
