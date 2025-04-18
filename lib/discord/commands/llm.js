const { SlashCommandBuilder } = require('discord.js')
const llm = require('../../llm')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('llm')
    .setDescription('Generate a response using an LLM')
    .addStringOption(
      option =>
        option
          .setName('prompt')
          .setDescription('The prompt to send to the LLM')
          .setRequired(true)
    )
    .addStringOption(
      option =>
        option
          .setName('model')
          .setDescription('The model to use (default: openai/gpt-4o-mini)')
    )
    .addStringOption(
      option =>
        option
          .setName('system-message')
          .setDescription('Optional system message to guide the model')
    )
    .addIntegerOption(
      option =>
        option
          .setName('max-tokens')
          .setDescription('Maximum number of tokens to generate (default: 100)')
    ),
  async execute (interaction) {
    const prompt = interaction.options.getString('prompt')
    const model = interaction.options.getString('model') || 'openai/gpt-4o-mini'
    const systemMessage = interaction.options.getString('system-message')
    const maxTokens = interaction.options.getInteger('max-tokens') || 100

    await interaction.deferReply()

    try {
      const response = await llm.completion({ prompt, model, systemMessage, maxTokens })
      return interaction.editReply(response)
    } catch (err) {
      console.error('LLM error:', err)
      return interaction.editReply('Sorry, I encountered an error processing your request.')
    }
  }
}
