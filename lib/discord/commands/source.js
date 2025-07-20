const { SlashCommandBuilder } = require('discord.js')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('source')
    .setDescription('Get the GitHub source code repository link'),
  async execute(interaction) {
    return interaction.reply(
      'You can find the source code here: https://github.com/davidguttman/ai-in-action-bot',
    )
  },
}
