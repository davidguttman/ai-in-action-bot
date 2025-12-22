# Tasks

## TODO

### Phase 1: Create GuildSettings Model
- [ ] Create `models/guildSettings.js` with schema (guildId, proactiveAnnouncementsChannelId, updatedAt, updatedBy)
- [ ] Import mongoose and define GuildSettings schema with required fields
- [ ] Export GuildSettings model from models/guildSettings.js
- [ ] Implement getGuildSettings(guildId) function that queries MongoDB
- [ ] Implement getProactiveChannelId(guildId) function that returns channel ID or null
- [ ] Define SlashCommandBuilder with channel option (ChannelType.GuildText)
- [ ] Use client.channels.fetch() to verify channel exists
- [ ] Check channel.permissionsFor(client.user) to verify bot can send messages
- [ ] Use GuildSettings.findOneAndUpdate() with upsert: true to save channel ID
- [ ] Store updatedBy field with interaction.user.id
- [ ] Replace config.proactive.announcementsChannelId with getProactiveChannelId(guildId) call
- [ ] Read guildId from config.discord.guildId or pass as parameter to job
- [ ] Return error message indicating channel not configured when getProactiveChannelId returns null
- [ ] Add unique index on guildId
- [ ] Create helper `lib/proactive/getGuildSettings.js` with `getGuildSettings()` and `getProactiveChannelId()` functions
- [ ] Add tests `test/models/guildSettings.test.js` (create/update, unique constraint, queries)

### Phase 2: Create Discord Command
- [ ] Create `lib/discord/commands/set-proactive-channel.js` with channel option
- [ ] Add channel validation (exists, bot can send messages)
- [ ] Implement MongoDB upsert logic
- [ ] Add confirmation response message
- [ ] Add tests `test/lib/discord/commands/set-proactive-channel.test.js` (validation, DB update, error handling)

### Phase 3: Update Weekly Announcement Job
- [ ] Update `lib/proactive/jobs/weeklyAnnouncement.js` to use MongoDB lookup
- [ ] Update error messages for missing configuration
- [ ] Update existing tests to cover MongoDB lookup scenarios

### Phase 4: Optional - View Command
- [ ] Create `lib/discord/commands/get-proactive-channel.js` to show current configuration
- [ ] Add tests for view command

### Phase 5: Documentation
- [ ] Update `config/index.js` to remove PROACTIVE_ANNOUNCEMENTS_CHANNEL_ID
- [ ] Update `README.md` with new command documentation
- [ ] Update `AGENTS.md` with proactive messaging command info
- [ ] Verify all existing tests pass

