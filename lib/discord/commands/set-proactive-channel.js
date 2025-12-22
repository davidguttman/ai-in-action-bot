const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js')
const GuildSettings = require('../../../models/guildSettings')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-proactive-channel')
    .setDescription('Set the channel for proactive weekly announcements')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('The channel to post weekly announcements')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText),
    ),
  async execute(interaction) {
    const channel = interaction.options.getChannel('channel')
    const guildId = interaction.guildId
    const userId = interaction.user.id

    if (!channel) {
      return interaction.reply({
        content: '❌ Please specify a valid text channel.',
        ephemeral: true,
      })
    }

    // Verify channel exists and bot can send messages
    try {
      const fetchedChannel = await interaction.client.channels.fetch(channel.id)
      if (!fetchedChannel) {
        return interaction.reply({
          content: '❌ Channel not found.',
          ephemeral: true,
        })
      }

      // Check bot permissions
      const botMember = await interaction.guild.members.fetch(
        interaction.client.user.id,
      )
      if (fetchedChannel.permissionsFor) {
        const permissions = fetchedChannel.permissionsFor(botMember)
        if (
          !permissions ||
          !permissions.has(PermissionFlagsBits.SendMessages)
        ) {
          return interaction.reply({
            content:
              '❌ I do not have permission to send messages in that channel. Please ensure I have "Send Messages" permission.',
            ephemeral: true,
          })
        }
      }
    } catch (error) {
      console.error('Error validating channel:', error)
      return interaction.reply({
        content: '❌ Error validating channel. Please try again.',
        ephemeral: true,
      })
    }

    // Upsert guild settings
    try {
      await GuildSettings.findOneAndUpdate(
        { guildId },
        {
          guildId,
          proactiveAnnouncementsChannelId: channel.id,
          updatedBy: userId,
          updatedAt: new Date(),
        },
        { upsert: true, new: true },
      )

      return interaction.reply({
        content: `✅ Proactive announcements channel set to ${channel}. Weekly announcements will be posted here.`,
        ephemeral: false,
      })
    } catch (error) {
      console.error('Error saving guild settings:', error)
      return interaction.reply({
        content: '❌ Error saving channel configuration. Please try again.',
        ephemeral: true,
      })
    }
  },
}
