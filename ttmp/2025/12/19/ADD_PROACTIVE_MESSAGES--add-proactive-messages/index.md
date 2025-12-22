---
Title: Add Proactive Messages
Ticket: ADD_PROACTIVE_MESSAGES
Status: active
Topics:
    - discord
    - bot
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Add proactive messaging capabilities to the Discord bot
LastUpdated: 2025-12-22T08:10:34.704651-08:00
---



# Add Proactive Messages

## Overview

This ticket aims to add proactive messaging capabilities to the AI in Action Discord bot. Currently, the bot only responds to user messages and slash commands. We need to implement the ability for the bot to send messages proactively based on events, schedules, or other triggers.

**Current State Analysis**: A comprehensive analysis of the message sending architecture and runtime has been completed. See the [Message Sending and Runtime Architecture Analysis](./reference/01-message-sending-and-runtime-architecture-analysis.md) document for details on:
- How messages are currently sent (reply, thread creation, slash commands)
- Runtime architecture (Discord client + HTTP server)
- Event handling patterns
- State management
- LLM integration points

**Next Steps**: Design proactive messaging patterns that integrate with the existing architecture.

## Key Links

- **[Message Sending and Runtime Architecture Analysis](./reference/01-message-sending-and-runtime-architecture-analysis.md)** - Comprehensive analysis of current message sending mechanisms and runtime architecture
- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **active**

## Topics

- discord
- bot

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
