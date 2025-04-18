const fs = require('node:fs')
const path = require('node:path')
const { parse } = require('node:querystring')
const { Client, Collection, GatewayIntentBits } = require('discord.js')

const { token } = require('../../config').discord

const commands = {}

module.exports = createClient()

function createClient () {
  const client = new Client({ intents: [ GatewayIntentBits.Guilds ] })

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
