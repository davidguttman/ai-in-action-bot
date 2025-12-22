---
Title: Store proactive channel ID in MongoDB with Discord command
Ticket: PROACTIVE_CHANNEL_CONFIG
Status: complete
Topics:
    - discord
    - bot
    - proactive
    - configuration
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: models/guildSettings.js
      Note: New model to store guild-specific configuration including proactive channel ID
    - Path: lib/discord/commands/set-proactive-channel.js
      Note: New Discord command to configure proactive announcements channel
    - Path: lib/proactive/jobs/weeklyAnnouncement.js
      Note: Update to read channel ID from MongoDB instead of config, with env var fallback
    - Path: lib/proactive/getGuildSettings.js
      Note: Helper functions to get guild settings and proactive channel ID with fallback
    - Path: config/index.js
      Note: Mark PROACTIVE_ANNOUNCEMENTS_CHANNEL_ID as deprecated (keep for backward compatibility)
ExternalSources: []
Summary: Move proactive channel ID from environment variable to MongoDB storage with Discord slash command for configuration
LastUpdated: 2025-12-19T14:09:03.839542-08:00
---


# Store proactive channel ID in MongoDB with Discord command

## Overview

This ticket moves the proactive announcements channel ID from environment variable configuration to MongoDB storage, and adds a Discord slash command (`/set-proactive-channel`) to allow administrators to configure the channel directly from Discord.

**Current State**: Channel ID is stored in `PROACTIVE_ANNOUNCEMENTS_CHANNEL_ID` environment variable, requiring container restarts to change.

**Goal**: Store channel ID in MongoDB (`GuildSettings` model) and provide Discord command for runtime configuration without restarts.

**Status**: Design phase - see [design document](./design-doc/01-proactive-channel-configuration-via-mongodb-and-discord-command.md) for implementation plan.

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **active**

## Topics

- discord
- bot
- proactive
- configuration

## Tasks

See [tasks.md](./tasks.md) for the current task list.

## Changelog

See [changelog.md](./changelog.md) for recent changes and decisions.

## Structure

- design/ - Architecture and design documents
- reference/ - Prompt packs, API contracts, context summaries
- playbooks/ - Command sequences and test procedures
- scripts/ - Temporary code and tooling
- various/ - Working notes and research
- archive/ - Deprecated or reference-only artifacts
