---
Title: Proactive Channel Configuration via MongoDB and Discord Command
Ticket: PROACTIVE_CHANNEL_CONFIG
Status: active
Topics:
    - discord
    - bot
    - proactive
    - configuration
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: models/guildSettings.js
      Note: New model to store guild-specific configuration
    - Path: lib/discord/commands/set-proactive-channel.js
      Note: New Discord command to configure proactive channel
    - Path: lib/proactive/jobs/weeklyAnnouncement.js
      Note: Update to read channel ID from MongoDB instead of config
    - Path: config/index.js
      Note: Remove PROACTIVE_ANNOUNCEMENTS_CHANNEL_ID from config
ExternalSources: []
Summary: Move proactive channel ID from environment variable to MongoDB storage with Discord slash command for configuration
LastUpdated: 2025-12-19T13:53:24.917442-08:00
---

# Proactive Channel Configuration via MongoDB and Discord Command

## Executive Summary

Currently, the proactive messaging channel ID is configured via the `PROACTIVE_ANNOUNCEMENTS_CHANNEL_ID` environment variable. This design proposes moving this configuration to MongoDB storage and adding a Discord slash command (`/set-proactive-channel`) to allow administrators to configure the channel directly from Discord without requiring environment variable changes or container restarts.

This change improves operational flexibility, allows per-guild configuration (preparing for potential multi-guild support), and provides a more user-friendly configuration interface.

## Problem Statement

The current implementation stores the proactive announcements channel ID in an environment variable (`PROACTIVE_ANNOUNCEMENTS_CHANNEL_ID`). This approach has several limitations:

1. **Operational overhead**: Changing the channel requires updating environment variables and restarting the container
2. **No runtime configuration**: Cannot change the channel without downtime
3. **No per-guild flexibility**: Environment variables are global, making multi-guild support difficult if needed in the future
4. **Poor user experience**: Administrators must know about environment variables and have access to deployment configuration

## Proposed Solution

### Components

1. **New MongoDB Model**: Create `GuildSettings` model to store guild-specific configuration
   - Schema: `guildId` (unique), `proactiveAnnouncementsChannelId` (optional string)
   - Single document per guild (upsert pattern)

2. **Discord Slash Command**: `/set-proactive-channel`
   - Required option: `channel` (Discord channel mention/ID)
   - Action: Store channel ID in MongoDB for the current guild
   - Response: Confirm channel set, show current channel if already configured

3. **Update Weekly Announcement Job**: Modify `lib/proactive/jobs/weeklyAnnouncement.js`
   - Read channel ID from MongoDB instead of `config.proactive.announcementsChannelId`
   - Handle missing configuration gracefully (skip job with clear error message)

### Architecture

```
Discord Command: /set-proactive-channel
  └─> Updates GuildSettings collection
        └─> Weekly announcement job reads from GuildSettings
```

## Design Decisions

### 1. GuildSettings Model Design

**Decision**: Single document per guild with flat structure
- **Rationale**: Simple, easy to query, supports future expansion (other guild settings)
- **Schema**:
  ```javascript
  {
    guildId: String (required, unique, indexed),
    proactiveAnnouncementsChannelId: String (optional),
    updatedAt: Date (auto-updated),
    updatedBy: String (Discord user ID who made the change)
  }
  ```

### 2. Channel Validation

**Decision**: Validate channel exists and bot has permission to send messages
- **Rationale**: Prevents configuration errors, provides immediate feedback
- **Implementation**: Use `client.channels.fetch()` and check `channel.permissionsFor(client.user)`

### 3. Command Response Format

**Decision**: Show current configuration and confirmation message
- **Rationale**: Clear feedback, allows verification
- **Format**: "✅ Proactive announcements channel set to #channel-name. Weekly announcements will be posted here."

## Alternatives Considered

### Alternative 1: Keep Environment Variable Only

**Rejected because**: Doesn't solve operational overhead or runtime configuration needs

### Alternative 2: Use Discord Application Commands with Channel Selection

**Considered**: Use Discord's built-in channel option type
**Decision**: Use this approach - Discord provides `ChannelType.GuildText` option type
**Rationale**: Better UX, built-in validation, no need to parse channel mentions

### Alternative 3: Separate Collection for Each Setting Type

**Rejected because**: Over-engineered for current needs; single GuildSettings model is simpler and sufficient

### Alternative 4: Store in Existing ScheduledSpeaker Model

**Rejected because**: Violates single responsibility principle; settings are not speaker-specific

## Implementation Plan

### Phase 1: Create GuildSettings Model

1. Create `models/guildSettings.js`
   - Define schema with `guildId` (unique, indexed), `proactiveAnnouncementsChannelId`, `updatedAt`, `updatedBy`
   - Export Mongoose model

2. Add helper function `lib/proactive/getGuildSettings.js`
   - Function: `getGuildSettings(guildId)` - returns settings document or null
   - Function: `getProactiveChannelId(guildId)` - returns channel ID or null

**Tests**: `test/models/guildSettings.test.js`
- Create/update guild settings
- Unique constraint on guildId
- Query by guildId

### Phase 2: Create Discord Command

1. Create `lib/discord/commands/set-proactive-channel.js`
   - Command definition: `/set-proactive-channel` with `channel` option (ChannelType.GuildText)
   - Validation: Verify channel exists and bot can send messages
   - Database update: Upsert GuildSettings document
   - Response: Confirmation message with channel name

2. Register command in `lib/discord/deploy-commands.js` (automatic via file discovery)

**Tests**: `test/lib/discord/commands/set-proactive-channel.test.js`
- Command validates channel
- Command updates MongoDB
- Command shows confirmation message
- Command handles invalid channel gracefully

### Phase 3: Update Weekly Announcement Job

1. Update `lib/proactive/jobs/weeklyAnnouncement.js`
   - Replace `config.proactive.announcementsChannelId` with MongoDB lookup
   - Use `getProactiveChannelId(guildId)` helper
   - Handle missing configuration gracefully (skip job with clear error message)

2. Update job to accept `guildId` parameter (or read from config.discord.guildId)

**Tests**: `test/lib/proactive/jobs/weeklyAnnouncement.test.js` (update existing)
- Reads from MongoDB when configured
- Handles missing configuration gracefully
- Error messages indicate configuration is missing

### Phase 4: Add Command to View Current Configuration

1. Optional: Add `/get-proactive-channel` command
   - Shows current channel configuration
   - Shows "not configured" if not set

**Tests**: `test/lib/discord/commands/get-proactive-channel.test.js`
- Shows MongoDB configuration when set
- Shows "not configured" when not set

### Phase 5: Documentation

1. Update `config/index.js`
   - Remove `PROACTIVE_ANNOUNCEMENTS_CHANNEL_ID` from config

2. Update documentation
   - `README.md`: Document new command
   - `AGENTS.md`: Update proactive messaging section with new command

3. Update tests
   - Ensure all existing tests still pass
   - Add integration tests for full flow

## Open Questions

1. **Should we support multiple channels?** Currently single channel per guild. Future enhancement could support multiple announcement channels.

2. **Should we add a command to disable proactive announcements?** Could set channel to null or add a separate `enabled` flag.

3. **Should we log configuration changes?** The `updatedBy` field captures who made the change, but should we add audit logging?

4. **Should we validate channel type?** Currently using `ChannelType.GuildText` - should we allow other channel types (announcement channels, forums)?

## References

- Related ticket: `ADD_PROACTIVE_MESSAGES` - Original proactive messaging implementation
- Discord.js documentation: [Slash Commands](https://discord.js.org/#/docs/discord.js/main/class/SlashCommandBuilder)
- Discord.js documentation: [Channel Types](https://discord.js.org/#/docs/discord.js/main/typedef/ChannelType)
- Mongoose documentation: [Schemas](https://mongoosejs.com/docs/guide.html)
