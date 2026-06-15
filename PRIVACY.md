# AI in Action Bot Privacy Policy

Last updated: June 15, 2026

AI in Action Bot is a Discord bot used to manage speaker sign-ups, talk scheduling, reminders, weekly schedule announcements, and talk-history queries for an AI-focused Discord community.

## Data We Process

The bot processes Discord message content only when a user intentionally interacts with the bot, such as by mentioning the bot, using a bot-supported command, replying in a bot-created scheduling thread, or participating in a bot-supported talk-history workflow.

The bot may process or store the following limited data:

- Discord user ID and username
- Talk topic provided by a user
- Scheduled talk date
- Discord thread ID associated with a scheduling flow
- Scheduler user ID and username when one user schedules another user
- Reminder status and timestamps
- Guild-level bot settings, such as the configured announcement channel

The bot does not store complete server message transcripts or unrelated server messages.

## How We Use Data

We use this data only to operate the bot's scheduling and community workflow features, including:

- Understanding whether a user wants to sign up, reschedule, cancel, view the schedule, get the meeting link, or ask about past talks
- Collecting talk topics and selected dates
- Preventing double-booking of scheduled talk dates
- Showing upcoming and past talks
- Sending talk reminders and weekly schedule announcements
- Maintaining guild-specific bot configuration

## AI and Machine Learning

The bot uses OpenRouter for runtime language-model inference. Limited message text may be sent to OpenRouter to classify intent, parse topic or date replies, and answer talk-history queries.

Message content is not used by this bot to train, fine-tune, or improve machine learning or AI models.

## Storage and Third-Party Services

Scheduling and configuration data is stored in MongoDB. Discord provides the platform messages and user identifiers used by the bot. OpenRouter is used for runtime language-model inference as described above.

## Opt-Out and Deletion

Use of the bot is voluntary. Users can avoid message-content processing by not invoking the bot and not replying in bot-created scheduling or talk-history threads.

Users may ask server administrators or the bot operator to cancel scheduled talks or delete scheduling data associated with them. Deletion requests will be handled when reasonably possible, subject to operational needs such as preventing scheduling conflicts and maintaining community records.

## Data Retention

Scheduling records may be retained while needed to provide upcoming schedule, reminder, rescheduling, cancellation, and talk-history features. Data that is no longer needed may be deleted during normal maintenance.

## Contact

For questions or deletion requests, contact the server administrators for the Discord community where the bot is installed, or contact the repository owner through the public project repository:

https://github.com/davidguttman/ai-in-action-bot
