const { SlashCommandBuilder, userMention } = require('discord.js')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('check')
    .setDescription('A simple test command that shows user info')
    .addStringOption(
      option =>
        option
          .setName('message')
          .setDescription('A message to include in the response')
    )
    .addUserOption(
      option =>
        option
          .setName('user')
          .setDescription('Optional user to check info for')
    ),
  async execute (interaction) {
    const message = interaction.options.getString('message')
    const targetUser = interaction.options.getUser('user') || interaction.user

    const messageText = message ? ` Your message was: "${message}"` : ''
    return interaction.reply(`🤖 Hello ${userMention(targetUser.id)}! I see you are ${targetUser.username}#${targetUser.discriminator}.${messageText}`)
  }
}
