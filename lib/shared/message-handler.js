const config = require('../../config')
const { completion } = require('../llm')
const {
  findAvailableFridays,
  scheduleSpeaker,
  getUpcomingSchedule,
  cancelSpeaker,
  getUserUpcomingTalk,
  rescheduleSpeaker,
} = require('../schedulingLogic')
const {
  getRecentMergeChanges,
  formatMergeChanges,
} = require('../git/recentChanges')
const { validateMessageQuestions } = require('./question-validation')

function formatDatesForDisplay(dates) {
  if (!dates || dates.length === 0) return ''
  return dates
    .map((date, index) => {
      const options = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }
      let day = date.getDate()
      let suffix = 'th'
      if (day % 10 === 1 && day !== 11) suffix = 'st'
      else if (day % 10 === 2 && day !== 12) suffix = 'nd'
      else if (day % 10 === 3 && day !== 13) suffix = 'rd'
      return `${index + 1}. ${date.toLocaleDateString('en-US', options).replace(/(\d+)(, \d{4})$/, `$1${suffix}$2`)}`
    })
    .join('\n')
}

async function resolveFirstMention({ message, client, excludeIds = [] }) {
  const mentionPattern = /<@!?([\w-]+)>/g
  const seen = new Set(excludeIds)
  let match
  while ((match = mentionPattern.exec(message.content))) {
    const userId = match[1]
    if (seen.has(userId)) continue
    try {
      const user = await client.users.fetch(userId)
      return user
    } catch (error) {
      continue
    }
  }
  return null
}

function createMessageHandler({
  client,
  activeSignups,
  guildId = (config.discord && config.discord.guildId) || 'guild-1',
}) {
  const talkHistoryContexts = {}
  return async function handleMessage(message) {
    // Ignore bots
    if (message.author.bot) return
    // Guild scoping
    if (message.guildId !== guildId) return

    // Handle active sign-up thread states
    const signupInfo = activeSignups[message.channel.id]
    if (
      message.channel.isThread() &&
      signupInfo &&
      message.author.id === signupInfo.userId
    ) {
      signupInfo.lastUpdated = Date.now()

      // awaiting_topic
      if (signupInfo.state === 'awaiting_topic') {
        const userMessage = message.content.trim()
        const topicCheckSystemMessage =
          "You are an assistant helping determine if a user's message is a presentation topic. Be very permissive - respond with ONLY 'topic' if it could reasonably be a presentation topic (including creative, informal, or technical topics), or 'clarify' only if it's clearly conversational filler, a question, or completely unrelated to presenting."
        try {
          const intentResponse = await completion({
            systemMessage: topicCheckSystemMessage,
            prompt: userMessage,
          })
          const intent = intentResponse?.trim().toLowerCase()
          if (intent === 'topic') {
            const topic = userMessage
            signupInfo.topic = topic
            const availableDates = await findAvailableFridays()
            if (!availableDates || availableDates.length === 0) {
              await message.reply(
                "Sorry, I couldn't find any available slots in the near future. Please check back later or contact an admin.",
              )
              delete activeSignups[message.channel.id]
              return
            }
            signupInfo.proposedDates = availableDates
            const formattedDates = formatDatesForDisplay(availableDates)
            const proposalMessage = `Okay, your topic is '**${topic}**'. Here are the next available Fridays:\n${formattedDates}\nWhich date works best for you? (Please reply with the number, e.g., '1')`
            await message.reply(proposalMessage)
            signupInfo.state = 'awaiting_date_selection'
            activeSignups[message.channel.id] = signupInfo
          } else {
            await message.reply(
              'Thanks for the reply! To continue scheduling, could you please tell me your presentation topic?',
            )
          }
        } catch (e) {
          await message.reply(
            'Sorry, I had trouble understanding that. Could you please restate your presentation topic?',
          )
        }
        return
      }

      // awaiting_date_selection
      if (signupInfo.state === 'awaiting_date_selection') {
        const userReply = message.content.trim()
        const proposedDates = signupInfo.proposedDates || []
        if (!proposedDates.length) {
          await message.reply(
            "Sorry, something went wrong, and I don't have the proposed dates anymore. Please try the sign-up process again.",
          )
          delete activeSignups[message.channel.id]
          return
        }
        const formattedDatesForLLM = proposedDates
          .map((d, i) => `${i + 1}: ${d.toISOString().split('T')[0]}`)
          .join(', ')
        const dateSelectionSystemMessage = `You are an assistant helping parse user date selection. Given the user's message and a list of proposed dates (format: 'Index: YYYY-MM-DD'), identify which date index (1, 2, or 3) the user selected. Respond with ONLY the number (1, 2, or 3) or 'clarify' if the selection is ambiguous or requests a different date. Dates available: ${formattedDatesForLLM}`
        try {
          const llmResponse = await completion({
            systemMessage: dateSelectionSystemMessage,
            prompt: userReply,
          })
          const parsedChoice = llmResponse?.trim()
          let selectedIndex = -1
          if (['1', '2', '3'].includes(parsedChoice))
            selectedIndex = parseInt(parsedChoice, 10) - 1
          if (selectedIndex >= 0 && selectedIndex < proposedDates.length) {
            const selectedDateObject = proposedDates[selectedIndex]
            const bookingResult = await scheduleSpeaker({
              discordUserId: message.author.id,
              discordUsername: message.author.username,
              topic: signupInfo.topic,
              scheduledDate: selectedDateObject,
              threadId: message.channel.id,
            })
            if (bookingResult) {
              const confirmationDateString =
                selectedDateObject.toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })
              await message.reply(
                `Great! You're scheduled to speak on '**${signupInfo.topic}**' on ${confirmationDateString}.`,
              )
              delete activeSignups[message.channel.id]
            } else {
              const newDates = await findAvailableFridays()
              if (!newDates.length) {
                await message.reply(
                  "Oops! It looks like that date just got booked, and I couldn't find other slots right now. Please try again later.",
                )
                delete activeSignups[message.channel.id]
              } else {
                signupInfo.proposedDates = newDates
                const formattedDates = formatDatesForDisplay(newDates)
                await message.reply(
                  `Oops! That date just got booked. Here are updated available dates:\n${formattedDates}\nWhich works?`,
                )
              }
            }
          } else {
            const formattedOriginalDates = formatDatesForDisplay(proposedDates)
            await message.reply(
              `Sorry, I didn't quite catch that. Please tell me which of these dates works best by replying with the number (1, 2, or 3):\n${formattedOriginalDates}`,
            )
          }
        } catch (e) {
          await message.reply(
            "Sorry, I'm having trouble understanding your choice right now. Please try again.",
          )
        }
        return
      }

      // awaiting_reschedule_date_selection
      if (signupInfo.state === 'awaiting_reschedule_date_selection') {
        const userReply = message.content.trim()
        const proposedDates = signupInfo.proposedDates || []
        if (!proposedDates.length) {
          await message.reply(
            'Sorry, something went wrong and I lost the proposed dates. Please try again.',
          )
          delete activeSignups[message.channel.id]
          return
        }
        // Fast path: numeric 1-3
        const numeric = userReply.match(/^\s*([123])\s*$/)
        let selectedIndex = -1
        if (numeric) {
          selectedIndex = parseInt(numeric[1], 10) - 1
        } else {
          const formattedDatesForLLM = proposedDates
            .map((d, i) => `${i + 1}: ${d.toISOString().split('T')[0]}`)
            .join(', ')
          try {
            const llmResponse = await completion({
              systemMessage:
                "You are an assistant helping parse user date selection. Given the user's message and a list of proposed dates (format: 'Index: YYYY-MM-DD'), identify which date index (1, 2, or 3) the user selected. Respond with ONLY the number (1, 2, or 3) or 'clarify' if the selection is ambiguous or requests a different date. Dates available: " +
                formattedDatesForLLM,
              prompt: userReply,
            })
            const parsedChoice = (llmResponse || '').trim()
            if (['1', '2', '3'].includes(parsedChoice)) {
              selectedIndex = parseInt(parsedChoice, 10) - 1
            }
          } catch (e) {}
        }
        if (selectedIndex >= 0 && selectedIndex < proposedDates.length) {
          const selectedDate = proposedDates[selectedIndex]
          try {
            const result = await rescheduleSpeaker(
              message.author.id,
              selectedDate,
            )
            if (result) {
              const d = selectedDate.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })
              await message.reply(
                `All set! I moved your talk "${signupInfo.currentTopic}" to ${d}.`,
              )
              delete activeSignups[message.channel.id]
              return
            }
            // null => date booked
            const newDates = await findAvailableFridays(3)
            if (!newDates.length) {
              await message.reply(
                'Oops! That date was just booked and I could not find other slots right now. Please try later.',
              )
              delete activeSignups[message.channel.id]
              return
            }
            signupInfo.proposedDates = newDates
            const formatted = formatDatesForDisplay(newDates)
            await message.reply(
              `That date is taken. Here are updated options:\n${formatted}\nWhich works?`,
            )
            return
          } catch (err) {
            await message.reply(
              'Sorry, I ran into a problem rescheduling. Please try again later.',
            )
            delete activeSignups[message.channel.id]
            return
          }
        }
        const formattedOriginal = formatDatesForDisplay(proposedDates)
        await message.reply(
          `Sorry, I didn't quite catch that. Please reply with 1, 2, or 3:\n${formattedOriginal}`,
        )
        return
      }

      // awaiting_target_user_for_cancel
      if (signupInfo.state === 'awaiting_target_user_for_cancel') {
        const userMessage = message.content.trim()
        const match = userMessage.match(/<@!?([\w-]+)>/)
        if (!match) {
          await message.reply(
            "Please mention the person whose talk you'd like me to cancel (e.g., @username).",
          )
          return
        }
        const targetUserId = match[1]
        try {
          const targetUser = await client.users.fetch(targetUserId)
          const cancelled = await cancelSpeaker(targetUserId)
          if (cancelled) {
            const d = cancelled.scheduledDate.toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })
            await message.reply(
              `Okay, I have cancelled @${targetUser.username}'s talk "${cancelled.topic}" scheduled for ${d}.`,
            )
          } else {
            await message.reply(
              `I don't see an upcoming talk for @${targetUser.username} to cancel.`,
            )
          }
        } catch (e) {
          await message.reply(
            "I couldn't find that user. Please make sure you're mentioning a valid user.",
          )
        } finally {
          delete activeSignups[message.channel.id]
        }
        return
      }

      // awaiting_target_user_for_reschedule
      if (signupInfo.state === 'awaiting_target_user_for_reschedule') {
        const userMessage = message.content.trim()
        const match = userMessage.match(/<@!?([\w-]+)>/)
        if (!match) {
          await message.reply(
            "Please mention the person whose talk you'd like me to reschedule (e.g., @username).",
          )
          return
        }
        const targetUserId = match[1]
        try {
          const targetUser = await client.users.fetch(targetUserId)
          const current = await getUserUpcomingTalk(targetUserId)
          if (!current) {
            await message.reply(
              `I don't see an upcoming talk for @${targetUser.username} to reschedule.`,
            )
            delete activeSignups[message.channel.id]
            return
          }
          const availableDates = await findAvailableFridays(3)
          if (!availableDates.length) {
            await message.reply(
              "Sorry, I couldn't find any available slots to move their talk.",
            )
            delete activeSignups[message.channel.id]
            return
          }
          signupInfo.state = 'awaiting_reschedule_date_selection_for_others'
          signupInfo.targetUserId = targetUserId
          signupInfo.targetUsername = targetUser.username
          signupInfo.proposedDates = availableDates
          signupInfo.currentScheduledDate = current.scheduledDate
          signupInfo.currentTopic = current.topic
          activeSignups[message.channel.id] = signupInfo
          const formatted = formatDatesForDisplay(availableDates)
          const cd = current.scheduledDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
          await message.reply(
            `@${targetUser.username} is currently scheduled on ${cd} for "${current.topic}". Here are the next available Fridays:\n${formatted}\nWhich date works best? (Reply with 1, 2, or 3)`,
          )
        } catch (e) {
          await message.reply(
            "I couldn't find that user. Please make sure you're mentioning a valid user.",
          )
          delete activeSignups[message.channel.id]
        }
        return
      }

      // awaiting_reschedule_date_selection_for_others
      if (
        signupInfo.state === 'awaiting_reschedule_date_selection_for_others'
      ) {
        const userReply = message.content.trim()
        const { proposedDates, targetUserId, targetUsername, currentTopic } =
          signupInfo
        if (!proposedDates || proposedDates.length === 0) {
          await message.reply(
            'Sorry, I lost the proposed dates. Please start the reschedule process again.',
          )
          delete activeSignups[message.channel.id]
          return
        }
        let selectedIndex = -1
        const numeric = userReply.match(/^\s*([123])\s*$/)
        if (numeric) {
          selectedIndex = parseInt(numeric[1], 10) - 1
        } else {
          const formattedDatesForLLM = proposedDates
            .map((d, i) => `${i + 1}: ${d.toISOString().split('T')[0]}`)
            .join(', ')
          try {
            const llmResponse = await completion({
              systemMessage:
                "You are an assistant helping parse user date selection. Given the user's message and a list of proposed dates (format: 'Index: YYYY-MM-DD'), identify which date index (1, 2, or 3) the user selected. Respond with ONLY the number (1, 2, or 3) or 'clarify' if the selection is ambiguous or requests a different date. Dates available: " +
                formattedDatesForLLM,
              prompt: userReply,
            })
            const parsedChoice = (llmResponse || '').trim()
            if (['1', '2', '3'].includes(parsedChoice))
              selectedIndex = parseInt(parsedChoice, 10) - 1
          } catch (e) {}
        }
        if (selectedIndex >= 0 && selectedIndex < proposedDates.length) {
          const selectedDateObject = proposedDates[selectedIndex]
          try {
            const result = await rescheduleSpeaker(
              targetUserId,
              selectedDateObject,
            )
            if (result) {
              const d = selectedDateObject.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })
              await message.reply(
                `Done! I moved @${targetUsername}'s talk "${currentTopic}" to ${d}.`,
              )
              delete activeSignups[message.channel.id]
              return
            }
            // date booked
            const newDates = await findAvailableFridays(3)
            if (!newDates.length) {
              await message.reply(
                'Oops! That date was just booked and I could not find other options right now. Please try later.',
              )
              delete activeSignups[message.channel.id]
              return
            }
            signupInfo.proposedDates = newDates
            const formatted = formatDatesForDisplay(newDates)
            await message.reply(
              `That date is taken. Updated options:\n${formatted}\nWhich works?`,
            )
            return
          } catch (err) {
            await message.reply(
              'Sorry, I ran into a problem rescheduling. Please try again later.',
            )
            delete activeSignups[message.channel.id]
            return
          }
        }
        const formattedOriginal = formatDatesForDisplay(proposedDates)
        await message.reply(
          `Sorry, I didn't quite catch that. Please reply with 1, 2, or 3:\n${formattedOriginal}`,
        )
        return
      }

      // awaiting_target_user
      if (signupInfo.state === 'awaiting_target_user') {
        const userMessage = message.content.trim()
        // Accept typical Discord IDs (digits) and chat-sim IDs (e.g., u-1)
        const match = userMessage.match(/<@!?([\w-]+)>/)
        if (!match) {
          await message.reply(
            "I don't see a user mention in your message. Please mention the person you'd like to schedule (e.g., @username).",
          )
          return
        }
        const targetUserId = match[1]
        try {
          const targetUser = await client.users.fetch(targetUserId)
          if (targetUser.bot) {
            await message.reply(
              "I can't schedule bots to speak. Please mention a real person.",
            )
            return
          }
          signupInfo.targetUserId = targetUserId
          signupInfo.targetUsername = targetUser.username
          signupInfo.state = 'awaiting_topic_for_others'
          activeSignups[message.channel.id] = signupInfo
          await message.reply(
            `Great! I'll help you schedule ${targetUser.username} to speak. What topic would you like them to present on?`,
          )
        } catch (e) {
          await message.reply(
            "I couldn't find that user. Please make sure you're mentioning a valid Discord user.",
          )
        }
        return
      }

      // awaiting_topic_for_others
      if (signupInfo.state === 'awaiting_topic_for_others') {
        const userMessage = message.content.trim()
        const topicCheckSystemMessage =
          "You are an assistant helping determine if a user's message is a presentation topic. Be very permissive - respond with ONLY 'topic' if it could reasonably be a presentation topic (including creative, informal, or technical topics), or 'clarify' only if it's clearly conversational filler, a question, or completely unrelated to presenting."
        try {
          const intentResponse = await completion({
            systemMessage: topicCheckSystemMessage,
            prompt: userMessage,
          })
          const intent = intentResponse?.trim().toLowerCase()
          if (intent !== 'topic') {
            await message.reply(
              "That doesn't look like a valid topic. Could you provide a clearer presentation topic?",
            )
            return
          }
          signupInfo.topic = userMessage
          const availableDates = await findAvailableFridays(3)
          if (!availableDates || availableDates.length === 0) {
            await message.reply(
              "Sorry, I couldn't find any available slots in the near future. Please check back later or contact an admin.",
            )
            delete activeSignups[message.channel.id]
            return
          }
          signupInfo.proposedDates = availableDates
          const formattedDates = formatDatesForDisplay(availableDates)
          const proposalMessage = `Here are the available dates for ${signupInfo.targetUsername} to speak on "${userMessage}":\n${formattedDates}\nWhich date works best?`
          await message.reply(proposalMessage)
          signupInfo.state = 'awaiting_date_selection_for_others'
          activeSignups[message.channel.id] = signupInfo
        } catch (e) {
          await message.reply(
            'Sorry, something went wrong while processing the topic. Please try again later.',
          )
          delete activeSignups[message.channel.id]
        }
        return
      }

      // awaiting_date_selection_for_others
      if (signupInfo.state === 'awaiting_date_selection_for_others') {
        const userMessage = message.content.trim()
        const { proposedDates, topic, targetUserId, targetUsername } =
          signupInfo
        if (!proposedDates || proposedDates.length === 0) {
          await message.reply(
            "Sorry, something went wrong, and I don't have the proposed dates anymore. Please try the scheduling process again.",
          )
          delete activeSignups[message.channel.id]
          return
        }
        // Fast path: accept numeric choice 1-3 without LLM
        const numeric = userMessage.match(/^\s*([123])\s*$/)
        let selectedIndex = -1
        if (numeric) {
          selectedIndex = parseInt(numeric[1], 10) - 1
        } else {
          const formattedDatesForLLM = proposedDates
            .map((d, i) => `${i + 1}: ${d.toISOString().split('T')[0]}`)
            .join(', ')
          try {
            const llmResponse = await completion({
              systemMessage:
                "You are an assistant helping parse user date selection. Given the user's message and a list of proposed dates (format: 'Index: YYYY-MM-DD'), identify which date index (1, 2, or 3) the user selected. Respond with ONLY the number (1, 2, or 3) or 'clarify' if the selection is ambiguous or requests a different date. Dates available: " +
                formattedDatesForLLM,
              prompt: userMessage,
            })
            const parsedChoice = (llmResponse || '').trim()
            if (['1', '2', '3'].includes(parsedChoice)) {
              selectedIndex = parseInt(parsedChoice, 10) - 1
            }
          } catch (e) {
            // fall through to clarification
          }
        }
        if (selectedIndex >= 0 && selectedIndex < proposedDates.length) {
          const selectedDateObject = proposedDates[selectedIndex]
          try {
            const bookingResult = await scheduleSpeaker({
              discordUserId: targetUserId,
              discordUsername: targetUsername,
              topic,
              scheduledDate: selectedDateObject,
              threadId: message.channel.id,
              schedulerUserId: message.author.id,
              schedulerUsername: message.author.username,
            })
            if (bookingResult) {
              const confirmationDateString =
                selectedDateObject.toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })
              await message.reply(
                `Perfect! I've scheduled ${targetUsername} to speak on '**${topic}**' on ${confirmationDateString}.`,
              )
              delete activeSignups[message.channel.id]
            } else {
              const newDates = await findAvailableFridays()
              if (!newDates.length) {
                await message.reply(
                  'Oops! That date was just booked, and I could not find other slots right now. Please try later.',
                )
                delete activeSignups[message.channel.id]
              } else {
                signupInfo.proposedDates = newDates
                const formatted = formatDatesForDisplay(newDates)
                await message.reply(
                  `Oops! That date was booked. Updated available dates:\n${formatted}\nWhich works?`,
                )
              }
            }
          } catch (err) {
            await message.reply(
              'Sorry, I encountered a database issue while trying to book this slot. Please try again later.',
            )
            delete activeSignups[message.channel.id]
          }
        } else {
          const formattedOriginalDates = formatDatesForDisplay(proposedDates)
          await message.reply(
            `Sorry, I didn't quite catch that. Please tell me which of these dates works best by replying with the number (1, 2, or 3):\n${formattedOriginalDates}`,
          )
        }
        return
      }
      return
    }

    // Mention-at-start check (main channel)
    const mentionPrefix1 = `<@${client.user.id}>`
    const mentionPrefix2 = `<@!${client.user.id}>`
    const trimmedContent = message.content.trim()
    const mentionStarts =
      trimmedContent.startsWith(mentionPrefix1) ||
      trimmedContent.startsWith(mentionPrefix2)
    const isSignupThread =
      message.channel.isThread() && !!activeSignups[message.channel.id]
    const existingTalkHistoryContext = talkHistoryContexts[message.channel.id]
    const shouldHandleWithoutMention =
      message.channel.isThread() && !!existingTalkHistoryContext
    if ((mentionStarts && !isSignupThread) || shouldHandleWithoutMention) {
      let userMessageContent = ''
      if (mentionStarts) {
        if (trimmedContent.startsWith(mentionPrefix1))
          userMessageContent = trimmedContent
            .substring(mentionPrefix1.length)
            .trim()
        else if (trimmedContent.startsWith(mentionPrefix2))
          userMessageContent = trimmedContent
            .substring(mentionPrefix2.length)
            .trim()
        if (!userMessageContent) userMessageContent = 'help'
      } else {
        userMessageContent = trimmedContent
        if (!userMessageContent) return
      }

      try {
        let detectedIntent = 'other'
        if (shouldHandleWithoutMention) {
          detectedIntent = 'query_talks'
        } else {
          const intentSystemMessage =
            "You are an assistant classifying user intent in a Discord message where the bot was mentioned. Possible intents are 'sign_up', 'view_schedule', 'cancel_talk', 'reschedule_talk', 'cancel_talk_for_others', 'reschedule_talk_for_others', 'query_talks', 'zoom_link', 'schedule_for_others', 'repo', 'recent_changes', or 'other'.\n- Classify as 'sign_up' ONLY if the user explicitly asks to sign up, volunteer, present, or talk.\n- Classify as 'view_schedule' ONLY if the user explicitly asks to see the schedule, upcoming talks, or who is speaking.\n- Classify as 'cancel_talk' ONLY if the user explicitly asks to cancel, withdraw, or back out of their scheduled talk.\n- Classify as 'reschedule_talk' ONLY if the user asks to move, change, postpone, or reschedule the date of their already scheduled talk.\n- Classify as 'cancel_talk_for_others' ONLY if the user asks to cancel someone else's upcoming talk.\n- Classify as 'reschedule_talk_for_others' ONLY if the user asks to reschedule/move someone else's upcoming talk.\n- Classify as 'query_talks' ONLY if the user is asking about past talks, previous topics, or if specific topics have been covered before.\n- Classify as 'zoom_link' ONLY if the user is asking for a zoom link, meeting link, presentation link, meeting URL, or any variation of requesting a link/URL for meetings/presentations.\n- Classify as 'schedule_for_others' ONLY if the user explicitly asks to schedule someone else, book someone else, or sign up another person for a talk.\n- Classify as 'repo' ONLY if the user is asking for the GitHub repository, source code, or bot's code.\n- Classify as 'recent_changes' ONLY if the user is asking about recent code changes, git history, commits, or what changed recently.\n- Otherwise, classify as 'other'. This includes simple replies, acknowledgements, questions not related to the above, or unclear requests.\nRespond with ONLY the intent name ('sign_up', 'view_schedule', 'cancel_talk', 'reschedule_talk', 'cancel_talk_for_others', 'reschedule_talk_for_others', 'query_talks', 'zoom_link', 'schedule_for_others', 'repo', 'recent_changes', 'other')."
          const intentResponse = await completion({
            systemMessage: intentSystemMessage,
            prompt: userMessageContent,
          })
          detectedIntent = (intentResponse || '').trim().toLowerCase()
        }

        const validation = await validateMessageQuestions(
          userMessageContent,
          detectedIntent,
        )

        if (detectedIntent === 'sign_up') {
          if (validation.missingRequired.length === 0) {
            const topicAnswer = validation.answered.find(
              (a) => a.questionNumber === 1,
            )
            if (topicAnswer && topicAnswer.answer) {
              const availableDates = await findAvailableFridays(3)
              if (!availableDates.length) {
                return message.reply(
                  "Sorry, I couldn't find any available slots.",
                )
              }
              const formatted = formatDatesForDisplay(availableDates)
              return message.reply(
                `Great! I'll help you schedule a talk about "${topicAnswer.answer}". Here are the next available Fridays:\n${formatted}\nWhich date works best? (Reply with 1, 2, or 3)`,
              )
            }
          }
          if (!message.channel.threads) {
            await message.reply(
              "Sorry, I can't create sign-up threads in this channel.",
            )
            return
          }
          const thread = await message.startThread({
            name: `Speaker Sign-up - ${message.author.username}`,
            autoArchiveDuration: 60,
            reason: `Initiating speaker sign-up process for ${message.author.tag}`,
          })
          activeSignups[thread.id] = {
            userId: message.author.id,
            state: 'awaiting_topic',
            lastUpdated: Date.now(),
          }
          const missingQuestions = validation.missingRequired.map(
            (qNum) => validation.questions[qNum - 1],
          )
          const questionText =
            missingQuestions.length > 0
              ? missingQuestions[0]
              : 'What topic would you like to present on?'

          await thread.send(
            `Hi ${message.author}, thanks for offering to speak! ${questionText}`,
          )
          return
        }

        if (detectedIntent === 'view_schedule') {
          const limit = 5
          const upcoming = await getUpcomingSchedule(limit)
          if (!upcoming || !upcoming.length)
            return message.reply('There are currently no speakers scheduled.')
          const lines = upcoming.map((s) => {
            const d = s.scheduledDate.toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })
            return `- ${d}: @${s.discordUsername} - "${s.topic}"`
          })
          return message.reply(
            `**Upcoming Speakers (Next ${limit}):**\n${lines.join('\n')}`,
          )
        }

        if (detectedIntent === 'cancel_talk') {
          const cancelled = await cancelSpeaker(message.author.id)
          if (cancelled) {
            const d = cancelled.scheduledDate.toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })
            return message.reply(
              `Okay, I have cancelled your talk "${cancelled.topic}" scheduled for ${d}.`,
            )
          }
          return message.reply(
            "You don't seem to have an upcoming talk scheduled that I can cancel.",
          )
        }

        if (detectedIntent === 'reschedule_talk') {
          if (!message.channel.threads) {
            await message.reply(
              "Sorry, I can't create rescheduling threads in this channel.",
            )
            return
          }
          const current = await getUserUpcomingTalk(message.author.id)
          if (!current) {
            return message.reply(
              "You don't seem to have an upcoming talk to reschedule.",
            )
          }
          const thread = await message.startThread({
            name: `Reschedule - ${message.author.username}`,
            autoArchiveDuration: 60,
            reason: `Reschedule request for ${message.author.tag}`,
          })
          const availableDates = await findAvailableFridays(3)
          if (!availableDates || availableDates.length === 0) {
            await thread.send(
              "Sorry, I couldn't find any available slots to move your talk. Please check back later or contact an admin.",
            )
            return
          }
          activeSignups[thread.id] = {
            userId: message.author.id,
            state: 'awaiting_reschedule_date_selection',
            proposedDates: availableDates,
            currentScheduledDate: current.scheduledDate,
            currentTopic: current.topic,
            lastUpdated: Date.now(),
          }
          const formatted = formatDatesForDisplay(availableDates)
          const currentDateString = current.scheduledDate.toLocaleDateString(
            'en-US',
            { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
          )
          await thread.send(
            `You are currently scheduled to speak on ${currentDateString} about "${current.topic}". Here are the next available Fridays to reschedule to:\n${formatted}\nWhich date works best? (Reply with 1, 2, or 3)`,
          )
          return
        }

        if (detectedIntent === 'query_talks') {
          try {
            const talkHistory = require('../talkHistory')
            const originalChannelId = message.channel.id
            let contextKey = originalChannelId
            let parentContextKey = message.channel.isThread()
              ? message.channel.parent?.id || message.channel.parentId || null
              : null
            let previousContext = talkHistoryContexts[contextKey]
            if (!previousContext && parentContextKey)
              previousContext = talkHistoryContexts[parentContextKey]

            let historyThread = null
            if (!message.channel.isThread() && message.channel.threads) {
              try {
                historyThread = await message.startThread({
                  name: `Talk History - ${message.author.username}`,
                  autoArchiveDuration: 60,
                  reason: `Past talks request from ${message.author.tag}`,
                })
                contextKey = historyThread.id
                parentContextKey = originalChannelId
                previousContext =
                  talkHistoryContexts[contextKey] || previousContext
              } catch (err) {
                console.error('Failed to start talk history thread:', err)
                await message.reply(
                  'Sorry, I ran into an issue creating a thread for that. Please try again later.',
                )
                return
              }
            }

            const sendReply = async (content) => {
              if (historyThread) return historyThread.send(content)
              return message.reply(content)
            }
            const isReplyingInThread =
              !!historyThread || message.channel.isThread()

            const talkQuerySystemMessage = `You interpret user requests about past talks. Reply with ONLY a JSON object matching this TypeScript type:
{
  "type": "existence_check" | "list_topic" | "list_general" | "list_range" | "list_speaker" | "other",
  "topic": string | null,
  "speaker": string | null,
  "page": number | null,
  "pageSize": number | null,
  "startDate": string | null,
  "endDate": string | null,
  "groupBy": "month" | "year" | null,
  "direction": "asc" | "desc" | null
}
- Use "existence_check" when the user is asking if a topic has ever happened.
- Use "list_topic" when they want talks about a particular topic.
- Use "list_general" for requests like "what past talks have we had".
- Use "list_range" when they mention dates, months, years, or phrases like "between" or "from".
- Use "list_speaker" when they ask about a specific speaker.
- Default to {"type":"list_general"} if unsure.
- Dates should be ISO (YYYY-MM-DD) when possible. Page/pageSize should be numbers if specified.
`

            const talkQueryResponse = await completion({
              systemMessage: talkQuerySystemMessage,
              prompt: userMessageContent,
              maxTokens: 200,
            })

            function tryParseTalkQuery(raw) {
              if (!raw) return null
              const jsonMatch = raw.match(/\{[\s\S]*\}/)
              if (!jsonMatch) return null
              try {
                return JSON.parse(jsonMatch[0])
              } catch (err) {
                return null
              }
            }

            const parsedQuery = tryParseTalkQuery(talkQueryResponse) || {}
            const lowerInput = userMessageContent.toLowerCase()
            const continuationHintRegex =
              /(\bpage\b|\bnext\b|\bprev\b|\bprevious\b|\bback\b|\banother\b|\bmore\b)/

            const explicitTopic =
              typeof parsedQuery.topic === 'string' && parsedQuery.topic.trim()
            const explicitSpeaker =
              typeof parsedQuery.speaker === 'string' &&
              parsedQuery.speaker.trim()
            const explicitStart = parsedQuery.startDate
            const explicitEnd = parsedQuery.endDate
            const explicitGroup = parsedQuery.groupBy
            const explicitDirection = parsedQuery.direction
            const explicitType = parsedQuery.type
            const explicitPage = parsedQuery.page
            const explicitPageSize = parsedQuery.pageSize

            const isContinuation =
              !!previousContext &&
              continuationHintRegex.test(lowerInput) &&
              !explicitTopic &&
              !explicitSpeaker &&
              !explicitStart &&
              !explicitEnd &&
              !explicitGroup &&
              (!explicitType || explicitType === 'list_general')

            const baseDefaults = {
              type: 'list_general',
              topic: null,
              speaker: null,
              page: 1,
              pageSize: 5,
              startDate: null,
              endDate: null,
              groupBy: null,
              direction: 'desc',
            }

            const defaults =
              isContinuation && previousContext
                ? {
                    ...baseDefaults,
                    ...previousContext,
                  }
                : baseDefaults

            const talkRequest = {
              ...defaults,
              ...parsedQuery,
            }

            const normalisePositiveInt = (value, fallback) => {
              const num = Number(value)
              if (!Number.isFinite(num) || num < 1) return fallback
              return Math.floor(num)
            }

            talkRequest.pageSize = normalisePositiveInt(
              talkRequest.pageSize,
              defaults.pageSize,
            )
            talkRequest.page = normalisePositiveInt(
              talkRequest.page,
              defaults.page,
            )
            if (!['asc', 'desc'].includes(talkRequest.direction))
              talkRequest.direction = defaults.direction
            if (!['month', 'year'].includes(talkRequest.groupBy))
              talkRequest.groupBy = defaults.groupBy
            if (talkRequest.topic) talkRequest.topic = talkRequest.topic.trim()
            if (talkRequest.speaker)
              talkRequest.speaker = talkRequest.speaker.trim()

            const wantsNext = /\b(next|more|another)\b/.test(lowerInput)
            const wantsPrevious = /\b(prev|previous|back)\b/.test(lowerInput)

            if (isContinuation && previousContext) {
              if (!explicitType || explicitType === 'list_general')
                talkRequest.type = previousContext.type || talkRequest.type
              if (!explicitTopic && previousContext.topic)
                talkRequest.topic = previousContext.topic
              if (!explicitSpeaker && previousContext.speaker)
                talkRequest.speaker = previousContext.speaker
              if (!explicitStart && previousContext.startDate)
                talkRequest.startDate = previousContext.startDate
              if (!explicitEnd && previousContext.endDate)
                talkRequest.endDate = previousContext.endDate
              if (!explicitGroup && previousContext.groupBy)
                talkRequest.groupBy = previousContext.groupBy
              if (!explicitDirection && previousContext.direction)
                talkRequest.direction = previousContext.direction
              if (!explicitPageSize && previousContext.pageSize)
                talkRequest.pageSize = previousContext.pageSize

              if (!explicitPage) {
                const previousPage = previousContext.page || 1
                if (wantsNext) talkRequest.page = previousPage + 1
                else if (wantsPrevious)
                  talkRequest.page = Math.max(1, previousPage - 1)
                else talkRequest.page = previousPage
              }
            }

            const ensureDateString = (value) => {
              if (!value) return null
              const d = new Date(value)
              if (Number.isNaN(d.getTime())) return null
              return d.toISOString().split('T')[0]
            }

            const formatTalkLine = (talk) => {
              const date = talk.scheduledDate
                ? new Date(talk.scheduledDate)
                : null
              const formattedDate = date
                ? date.toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : 'Unknown date'
              const speaker = talk.discordUsername
                ? `@${talk.discordUsername}`
                : 'Unknown speaker'
              return `- ${formattedDate}: ${speaker} — "${talk.topic}"`
            }

            const groupTalks = (talks, groupBy) => {
              if (!groupBy) return null
              const normalised =
                groupBy === 'year'
                  ? 'year'
                  : groupBy === 'month'
                    ? 'month'
                    : null
              if (!normalised) return null
              const map = new Map()
              for (const talk of talks) {
                const date = talk.scheduledDate
                  ? new Date(talk.scheduledDate)
                  : null
                const label = date
                  ? date.toLocaleDateString(
                      'en-US',
                      normalised === 'month'
                        ? { month: 'long', year: 'numeric' }
                        : { year: 'numeric' },
                    )
                  : 'Unknown'
                const key = `${normalised}:${label}`
                if (!map.has(key)) map.set(key, { label, talks: [] })
                map.get(key).talks.push(talk)
              }
              return Array.from(map.values())
            }

            const formatPaginatedTalks = (result, requestMeta) => {
              const {
                talks,
                page,
                pageSize,
                total,
                hasMore,
                startDate,
                endDate,
                direction,
              } = result
              if (!talks.length)
                return "I couldn't find any past talks for that request."

              const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1
              const descriptorParts = []
              if (requestMeta.topic)
                descriptorParts.push(`about ${requestMeta.topic}`)
              if (requestMeta.speaker)
                descriptorParts.push(`by ${requestMeta.speaker}`)
              if (startDate || endDate) {
                const pieces = []
                if (startDate)
                  pieces.push(`from ${ensureDateString(startDate)}`)
                if (endDate) pieces.push(`until ${ensureDateString(endDate)}`)
                if (pieces.length) descriptorParts.push(pieces.join(' '))
              }
              const descriptor = descriptorParts.length
                ? ` (${descriptorParts.join(', ')})`
                : ''

              const header = `**Past Talks${descriptor}**`
              const lines = [
                header,
                `Showing ${talks.length} • Page ${page} of ${totalPages} • ${direction === 'asc' ? 'Oldest first' : 'Newest first'}`,
              ]

              const grouped = groupTalks(talks, requestMeta.groupBy)
              if (grouped) {
                for (const group of grouped) {
                  lines.push(`**${group.label}**`)
                  for (const talk of group.talks) {
                    lines.push(formatTalkLine(talk))
                  }
                }
              } else {
                lines.push(...talks.map(formatTalkLine))
              }

              if (hasMore) {
                const nextPage = page + 1
                lines.push(`(Ask for page ${nextPage} to see more.)`)
              }

              return lines.join('\n')
            }

            const updateTalkHistoryContext = ({ request, result }) => {
              const contextValue = {
                type: request.type,
                topic: request.topic || null,
                speaker: request.speaker || null,
                page: result?.page || request.page || 1,
                pageSize: result?.pageSize || request.pageSize || 5,
                startDate: request.startDate || null,
                endDate: request.endDate || null,
                groupBy: request.groupBy || null,
                direction: request.direction || 'desc',
              }
              talkHistoryContexts[contextKey] = contextValue
              if (isReplyingInThread && parentContextKey) {
                talkHistoryContexts[parentContextKey] = { ...contextValue }
              }
            }

            if (talkRequest.type === 'existence_check' && talkRequest.topic) {
              const relatedTalks = await talkHistory.findRelatedTalks(
                talkRequest.topic,
              )
              if (relatedTalks.length) {
                const items = relatedTalks
                  .map((t) => formatTalkLine(t))
                  .join('\n')
                updateTalkHistoryContext({
                  request: {
                    ...talkRequest,
                    page: 1,
                    pageSize: relatedTalks.length,
                  },
                  result: {
                    page: 1,
                    pageSize: relatedTalks.length,
                    talks: relatedTalks,
                  },
                })
                return sendReply(
                  `Yes, there have been talks about ${talkRequest.topic}:\n${items}`,
                )
              }
              return sendReply(
                `No, I don't see any previous talks about ${talkRequest.topic}.`,
              )
            }

            if (talkRequest.type === 'list_topic' && talkRequest.topic) {
              const relatedTalks = await talkHistory.findRelatedTalks(
                talkRequest.topic,
              )
              if (relatedTalks.length) {
                const items = relatedTalks
                  .map((t) => formatTalkLine(t))
                  .join('\n')
                updateTalkHistoryContext({
                  request: {
                    ...talkRequest,
                    page: 1,
                    pageSize: relatedTalks.length,
                  },
                  result: {
                    page: 1,
                    pageSize: relatedTalks.length,
                    talks: relatedTalks,
                  },
                })
                return sendReply(
                  `Here are talks related to ${talkRequest.topic}:\n${items}`,
                )
              }
              const fallbackList = await talkHistory.listPastTalks({
                page: talkRequest.page,
                pageSize: talkRequest.pageSize,
                topic: talkRequest.topic,
                direction: talkRequest.direction,
                startDate: talkRequest.startDate,
                endDate: talkRequest.endDate,
                speaker: talkRequest.speaker,
              })
              if (fallbackList.talks.length) {
                const formatted = formatPaginatedTalks(
                  fallbackList,
                  talkRequest,
                )
                updateTalkHistoryContext({
                  request: talkRequest,
                  result: fallbackList,
                })
                return sendReply(formatted)
              }
              return sendReply(
                `I couldn't find any talks related to ${talkRequest.topic}.`,
              )
            }

            if (talkRequest.type === 'list_speaker' && talkRequest.speaker) {
              const listResult = await talkHistory.listPastTalks({
                page: talkRequest.page,
                pageSize: talkRequest.pageSize,
                direction: talkRequest.direction,
                speaker: talkRequest.speaker,
                startDate: talkRequest.startDate,
                endDate: talkRequest.endDate,
                topic: talkRequest.topic,
              })
              if (!listResult.talks.length)
                return sendReply(
                  `I couldn't find any past talks for ${talkRequest.speaker}.`,
                )
              const formatted = formatPaginatedTalks(listResult, talkRequest)
              updateTalkHistoryContext({
                request: talkRequest,
                result: listResult,
              })
              return sendReply(formatted)
            }

            const listResult = await talkHistory.listPastTalks({
              page: talkRequest.page,
              pageSize: talkRequest.pageSize,
              startDate: talkRequest.startDate,
              endDate: talkRequest.endDate,
              direction: talkRequest.direction,
              speaker: talkRequest.speaker,
              topic: talkRequest.topic,
            })

            if (isContinuation && wantsNext && !listResult.talks.length) {
              return sendReply(
                "You're already seeing the latest page of past talks.",
              )
            }

            if (isContinuation && wantsPrevious && !listResult.talks.length) {
              return sendReply('There are no earlier pages to show.')
            }

            const formatted = formatPaginatedTalks(listResult, talkRequest)
            updateTalkHistoryContext({
              request: talkRequest,
              result: listResult,
            })
            return sendReply(formatted)
          } catch (e) {
            console.error('Talk history lookup failed:', e)
            return sendReply(
              'Sorry, I encountered an error while searching for past talks.',
            )
          }
        }

        if (detectedIntent === 'zoom_link') {
          const zoomLink = config.zoomLink
          const zoomPassword = config.zoomPassword
          if (!message.channel.threads) {
            let replyMessage
            if (zoomLink) {
              replyMessage = `Here's the zoom link for our meetings: ${zoomLink}`
              if (zoomPassword) replyMessage += `\nPassword: ${zoomPassword}`
            } else {
              replyMessage =
                "Sorry, I don't have a zoom link configured. Please contact an admin."
            }
            return message.reply(replyMessage)
          }
          const thread = await message.startThread({
            name: `Zoom Link - ${message.author.username}`,
            autoArchiveDuration: 60,
            reason: `Zoom link request from ${message.author.tag}`,
          })
          if (zoomLink) {
            let tm = `Here's the zoom link for our meetings: ${zoomLink}`
            if (zoomPassword) tm += `\nPassword: ${zoomPassword}`
            await thread.send(tm)
          } else {
            await thread.send(
              "Sorry, I don't have a zoom link configured. Please contact an admin.",
            )
          }
          return
        }

        if (detectedIntent === 'schedule_for_others') {
          if (validation.missingRequired.length === 0) {
            const whoAnswer = validation.answered.find(
              (a) => a.questionNumber === 1,
            )
            const whatAnswer = validation.answered.find(
              (a) => a.questionNumber === 2,
            )

            if (
              whoAnswer &&
              whatAnswer &&
              whoAnswer.answer &&
              whatAnswer.answer
            ) {
              const mentionedUser = await resolveFirstMention({
                message,
                client,
                excludeIds: [client.user.id, message.author.id],
              })

              if (mentionedUser) {
                const targetUsername =
                  mentionedUser.globalName ||
                  mentionedUser.username ||
                  mentionedUser.tag
                const availableDates = await findAvailableFridays(3)
                if (!availableDates.length) {
                  return message.reply(
                    "Sorry, I couldn't find any available slots.",
                  )
                }
                const formatted = formatDatesForDisplay(availableDates)
                return message.reply(
                  `Great! I'll help you schedule ${targetUsername} for a talk about "${whatAnswer.answer}". Here are the next available Fridays:\n${formatted}\nWhich date works best? (Reply with 1, 2, or 3)`,
                )
              }
            }
          }

          if (!message.channel.threads) {
            await message.reply(
              "Sorry, I can't create scheduling threads in this channel.",
            )
            return
          }
          const thread = await message.startThread({
            name: `Schedule Someone - ${message.author.username}`,
            autoArchiveDuration: 60,
            reason: `Initiating schedule-for-others process for ${message.author.tag}`,
          })
          const mentionedUser = await resolveFirstMention({
            message,
            client,
            excludeIds: [client.user.id, message.author.id],
          })
          if (mentionedUser) {
            const targetUsername =
              mentionedUser.globalName ||
              mentionedUser.username ||
              mentionedUser.tag
            activeSignups[thread.id] = {
              userId: message.author.id,
              state: 'awaiting_topic_for_others',
              targetUserId: mentionedUser.id,
              targetUsername,
              lastUpdated: Date.now(),
            }

            const missingQuestions = validation.missingRequired.map(
              (qNum) => validation.questions[qNum - 1],
            )
            const questionText =
              missingQuestions.length > 0
                ? missingQuestions[0]
                : 'What topic would you like them to present on?'

            await thread.send(
              `Hi ${message.author}, I'll help you schedule ${targetUsername} to speak! ${questionText}`,
            )
            return
          }
          activeSignups[thread.id] = {
            userId: message.author.id,
            state: 'awaiting_target_user',
            lastUpdated: Date.now(),
          }
          await thread.send(
            `Hi ${message.author}, I'll help you schedule someone else to speak! Please mention the person you'd like to schedule (e.g., @username).`,
          )
          return
        }

        if (detectedIntent === 'cancel_talk_for_others') {
          if (!message.channel.threads) {
            await message.reply(
              "Sorry, I can't create cancellation threads in this channel.",
            )
            return
          }
          const thread = await message.startThread({
            name: `Cancel Someone - ${message.author.username}`,
            autoArchiveDuration: 60,
            reason: `Cancel talk for others request from ${message.author.tag}`,
          })
          const mentionedUser = await resolveFirstMention({
            message,
            client,
            excludeIds: [client.user.id, message.author.id],
          })
          if (mentionedUser) {
            const targetUsername =
              mentionedUser.globalName ||
              mentionedUser.username ||
              mentionedUser.tag
            try {
              const cancelled = await cancelSpeaker(mentionedUser.id)
              if (cancelled) {
                const d = cancelled.scheduledDate.toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })
                await thread.send(
                  `Okay, I have cancelled @${targetUsername}'s talk "${cancelled.topic}" scheduled for ${d}.`,
                )
              } else {
                await thread.send(
                  `I don't see an upcoming talk for @${targetUsername} to cancel.`,
                )
              }
            } catch (e) {
              await thread.send(
                "I couldn't find that user. Please make sure you're mentioning a valid user.",
              )
            }
            return
          }
          activeSignups[thread.id] = {
            userId: message.author.id,
            state: 'awaiting_target_user_for_cancel',
            lastUpdated: Date.now(),
          }
          await thread.send(
            `Okay! Please mention the person whose upcoming talk you'd like me to cancel (e.g., @username).`,
          )
          return
        }

        if (detectedIntent === 'reschedule_talk_for_others') {
          if (!message.channel.threads) {
            await message.reply(
              "Sorry, I can't create rescheduling threads in this channel.",
            )
            return
          }
          const thread = await message.startThread({
            name: `Reschedule Someone - ${message.author.username}`,
            autoArchiveDuration: 60,
            reason: `Reschedule talk for others request from ${message.author.tag}`,
          })
          const mentionedUser = await resolveFirstMention({
            message,
            client,
            excludeIds: [client.user.id, message.author.id],
          })
          if (mentionedUser) {
            const targetUsername =
              mentionedUser.globalName ||
              mentionedUser.username ||
              mentionedUser.tag
            try {
              const current = await getUserUpcomingTalk(mentionedUser.id)
              if (!current) {
                await thread.send(
                  `I don't see an upcoming talk for @${targetUsername} to reschedule.`,
                )
                return
              }
              const availableDates = await findAvailableFridays(3)
              if (!availableDates.length) {
                await thread.send(
                  "Sorry, I couldn't find any available slots to move their talk.",
                )
                return
              }
              const formatted = formatDatesForDisplay(availableDates)
              const cd = current.scheduledDate.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })
              activeSignups[thread.id] = {
                userId: message.author.id,
                state: 'awaiting_reschedule_date_selection_for_others',
                lastUpdated: Date.now(),
                targetUserId: mentionedUser.id,
                targetUsername,
                proposedDates: availableDates,
                currentScheduledDate: current.scheduledDate,
                currentTopic: current.topic,
              }
              await thread.send(
                `@${targetUsername} is currently scheduled on ${cd} for "${current.topic}". Here are the next available Fridays:\n${formatted}\nWhich date works best? (Reply with 1, 2, or 3)`,
              )
              return
            } catch (e) {
              await thread.send(
                "I couldn't find that user. Please make sure you're mentioning a valid user.",
              )
              return
            }
          }
          activeSignups[thread.id] = {
            userId: message.author.id,
            state: 'awaiting_target_user_for_reschedule',
            lastUpdated: Date.now(),
          }
          await thread.send(
            `Great! Please mention the person whose talk you'd like me to reschedule (e.g., @username).`,
          )
          return
        }

        if (detectedIntent === 'repo') {
          return message.reply(
            'https://github.com/davidguttman/ai-in-action-bot',
          )
        }

        if (detectedIntent === 'recent_changes') {
          try {
            const commits = await getRecentMergeChanges()
            const formatted = formatMergeChanges(commits)
            return message.reply(formatted)
          } catch (error) {
            console.error('Failed to fetch recent merge changes:', error)
            return message.reply(
              "Sorry, I couldn't pull the recent history right now.",
            )
          }
        }

        // other
        return message.reply(
          "How can I help? You can ask me to 'sign up', 'schedule someone else', 'view schedule', 'reschedule talk', 'cancel talk', 'reschedule someone else', 'cancel someone else', ask about past talks, get the zoom link, or ask for my GitHub repo!",
        )
      } catch (e) {
        return message.reply(
          "Sorry, I'm having trouble understanding requests right now. Please try again later.",
        )
      }
    }
  }
}

module.exports = { createMessageHandler }
