const config = require('../../config')
const { completion } = require('../llm')
const {
  findAvailableFridays,
  scheduleSpeaker,
  getUpcomingSchedule,
  cancelSpeaker,
} = require('../schedulingLogic')

function formatDatesForDisplay(dates) {
  if (!dates || dates.length === 0) return ''
  return dates
    .map((date, index) => {
      const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
      let day = date.getDate()
      let suffix = 'th'
      if (day % 10 === 1 && day !== 11) suffix = 'st'
      else if (day % 10 === 2 && day !== 12) suffix = 'nd'
      else if (day % 10 === 3 && day !== 13) suffix = 'rd'
      return `${index + 1}. ${date.toLocaleDateString('en-US', options).replace(/(\d+)(, \d{4})$/, `$1${suffix}$2`)}`
    })
    .join('\n')
}

function createMessageHandler({ client, activeSignups, guildId = (config.discord && config.discord.guildId) || 'guild-1' }) {
  return async function handleMessage(message) {
    // Ignore bots
    if (message.author.bot) return
    // Guild scoping
    if (message.guildId !== guildId) return

    // Handle active sign-up thread states
    const signupInfo = activeSignups[message.channel.id]
    if (message.channel.isThread() && signupInfo && message.author.id === signupInfo.userId) {
      signupInfo.lastUpdated = Date.now()

      // awaiting_topic
      if (signupInfo.state === 'awaiting_topic') {
        const userMessage = message.content.trim()
        const topicCheckSystemMessage =
          "You are an assistant helping determine if a user's message is a presentation topic. Be very permissive - respond with ONLY 'topic' if it could reasonably be a presentation topic (including creative, informal, or technical topics), or 'clarify' only if it's clearly conversational filler, a question, or completely unrelated to presenting."
        try {
          const intentResponse = await completion({ systemMessage: topicCheckSystemMessage, prompt: userMessage })
          const intent = intentResponse?.trim().toLowerCase()
          if (intent === 'topic') {
            const topic = userMessage
            signupInfo.topic = topic
            const availableDates = await findAvailableFridays()
            if (!availableDates || availableDates.length === 0) {
              await message.reply("Sorry, I couldn't find any available slots in the near future. Please check back later or contact an admin.")
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
            await message.reply('Thanks for the reply! To continue scheduling, could you please tell me your presentation topic?')
          }
        } catch (e) {
          await message.reply('Sorry, I had trouble understanding that. Could you please restate your presentation topic?')
        }
        return
      }

      // awaiting_date_selection
      if (signupInfo.state === 'awaiting_date_selection') {
        const userReply = message.content.trim()
        const proposedDates = signupInfo.proposedDates || []
        if (!proposedDates.length) {
          await message.reply("Sorry, something went wrong, and I don't have the proposed dates anymore. Please try the sign-up process again.")
          delete activeSignups[message.channel.id]
          return
        }
        const formattedDatesForLLM = proposedDates
          .map((d, i) => `${i + 1}: ${d.toISOString().split('T')[0]}`)
          .join(', ')
        const dateSelectionSystemMessage = `You are an assistant helping parse user date selection. Given the user's message and a list of proposed dates (format: 'Index: YYYY-MM-DD'), identify which date index (1, 2, or 3) the user selected. Respond with ONLY the number (1, 2, or 3) or 'clarify' if the selection is ambiguous or requests a different date. Dates available: ${formattedDatesForLLM}`
        try {
          const llmResponse = await completion({ systemMessage: dateSelectionSystemMessage, prompt: userReply })
          const parsedChoice = llmResponse?.trim()
          let selectedIndex = -1
          if (['1', '2', '3'].includes(parsedChoice)) selectedIndex = parseInt(parsedChoice, 10) - 1
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
              const confirmationDateString = selectedDateObject.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
              await message.reply(`Great! You're scheduled to speak on '**${signupInfo.topic}**' on ${confirmationDateString}.`)
              delete activeSignups[message.channel.id]
            } else {
              const newDates = await findAvailableFridays()
              if (!newDates.length) {
                await message.reply("Oops! It looks like that date just got booked, and I couldn't find other slots right now. Please try again later.")
                delete activeSignups[message.channel.id]
              } else {
                signupInfo.proposedDates = newDates
                const formattedDates = formatDatesForDisplay(newDates)
                await message.reply(`Oops! That date just got booked. Here are updated available dates:\n${formattedDates}\nWhich works?`)
              }
            }
          } else {
            const formattedOriginalDates = formatDatesForDisplay(proposedDates)
            await message.reply(`Sorry, I didn't quite catch that. Please tell me which of these dates works best by replying with the number (1, 2, or 3):\n${formattedOriginalDates}`)
          }
        } catch (e) {
          await message.reply("Sorry, I'm having trouble understanding your choice right now. Please try again.")
        }
        return
      }

      // awaiting_target_user
      if (signupInfo.state === 'awaiting_target_user') {
        const userMessage = message.content.trim()
        // Accept typical Discord IDs (digits) and chat-sim IDs (e.g., u-1)
        const match = userMessage.match(/<@!?([\w-]+)>/)
        if (!match) {
          await message.reply("I don't see a user mention in your message. Please mention the person you'd like to schedule (e.g., @username).")
          return
        }
        const targetUserId = match[1]
        try {
          const targetUser = await client.users.fetch(targetUserId)
          if (targetUser.bot) {
            await message.reply("I can't schedule bots to speak. Please mention a real person.")
            return
          }
          signupInfo.targetUserId = targetUserId
          signupInfo.targetUsername = targetUser.username
          signupInfo.state = 'awaiting_topic_for_others'
          activeSignups[message.channel.id] = signupInfo
          await message.reply(`Great! I'll help you schedule ${targetUser.username} to speak. What topic would you like them to present on?`)
        } catch (e) {
          await message.reply("I couldn't find that user. Please make sure you're mentioning a valid Discord user.")
        }
        return
      }

      // awaiting_topic_for_others
      if (signupInfo.state === 'awaiting_topic_for_others') {
        const userMessage = message.content.trim()
        const topicCheckSystemMessage =
          "You are an assistant helping determine if a user's message is a presentation topic. Be very permissive - respond with ONLY 'topic' if it could reasonably be a presentation topic (including creative, informal, or technical topics), or 'clarify' only if it's clearly conversational filler, a question, or completely unrelated to presenting."
        try {
          const intentResponse = await completion({ systemMessage: topicCheckSystemMessage, prompt: userMessage })
          const intent = intentResponse?.trim().toLowerCase()
          if (intent !== 'topic') {
            await message.reply("That doesn't look like a valid topic. Could you provide a clearer presentation topic?")
            return
          }
          signupInfo.topic = userMessage
          const availableDates = await findAvailableFridays(3)
          if (!availableDates || availableDates.length === 0) {
            await message.reply("Sorry, I couldn't find any available slots in the near future. Please check back later or contact an admin.")
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
          await message.reply('Sorry, something went wrong while processing the topic. Please try again later.')
          delete activeSignups[message.channel.id]
        }
        return
      }

      // awaiting_date_selection_for_others
      if (signupInfo.state === 'awaiting_date_selection_for_others') {
        const userMessage = message.content.trim()
        const { proposedDates, topic, targetUserId, targetUsername } = signupInfo
        if (!proposedDates || proposedDates.length === 0) {
          await message.reply("Sorry, something went wrong, and I don't have the proposed dates anymore. Please try the scheduling process again.")
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
              const confirmationDateString = selectedDateObject.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
              await message.reply(`Perfect! I've scheduled ${targetUsername} to speak on '**${topic}**' on ${confirmationDateString}.`)
              delete activeSignups[message.channel.id]
            } else {
              const newDates = await findAvailableFridays()
              if (!newDates.length) {
                await message.reply('Oops! That date was just booked, and I could not find other slots right now. Please try later.')
                delete activeSignups[message.channel.id]
              } else {
                signupInfo.proposedDates = newDates
                const formatted = formatDatesForDisplay(newDates)
                await message.reply(`Oops! That date was booked. Updated available dates:\n${formatted}\nWhich works?`)
              }
            }
          } catch (err) {
            await message.reply('Sorry, I encountered a database issue while trying to book this slot. Please try again later.')
            delete activeSignups[message.channel.id]
          }
        } else {
          const formattedOriginalDates = formatDatesForDisplay(proposedDates)
          await message.reply(`Sorry, I didn't quite catch that. Please tell me which of these dates works best by replying with the number (1, 2, or 3):\n${formattedOriginalDates}`)
        }
        return
      }
      return
    }

    // Mention-at-start check (main channel)
    const mentionPrefix1 = `<@${client.user.id}>`
    const mentionPrefix2 = `<@!${client.user.id}>`
    const trimmedContent = message.content.trim()
    if (!message.channel.isThread() && (trimmedContent.startsWith(mentionPrefix1) || trimmedContent.startsWith(mentionPrefix2))) {
      let userMessageContent = ''
      if (trimmedContent.startsWith(mentionPrefix1)) userMessageContent = trimmedContent.substring(mentionPrefix1.length).trim()
      else if (trimmedContent.startsWith(mentionPrefix2)) userMessageContent = trimmedContent.substring(mentionPrefix2.length).trim()
      if (!userMessageContent) userMessageContent = 'help'

      try {
        const intentSystemMessage =
          "You are an assistant classifying user intent in a Discord message where the bot was mentioned. Possible intents are 'sign_up', 'view_schedule', 'cancel_talk', 'query_talks', 'zoom_link', 'schedule_for_others', or 'other'.\n- Classify as 'sign_up' ONLY if the user explicitly asks to sign up, volunteer, present, or talk.\n- Classify as 'view_schedule' ONLY if the user explicitly asks to see the schedule, upcoming talks, or who is speaking.\n- Classify as 'cancel_talk' ONLY if the user explicitly asks to cancel, withdraw, or back out of their scheduled talk.\n- Classify as 'query_talks' ONLY if the user is asking about past talks, previous topics, or if specific topics have been covered before.\n- Classify as 'zoom_link' ONLY if the user is asking for a zoom link, meeting link, presentation link, meeting URL, or any variation of requesting a link/URL for meetings/presentations.\n- Classify as 'schedule_for_others' ONLY if the user explicitly asks to schedule someone else, book someone else, or sign up another person for a talk.\n- Otherwise, classify as 'other'. This includes simple replies, acknowledgements, questions not related to the above, or unclear requests.\nRespond with ONLY the intent name ('sign_up', 'view_schedule', 'cancel_talk', 'query_talks', 'zoom_link', 'schedule_for_others', 'other')."
        const intentResponse = await completion({ systemMessage: intentSystemMessage, prompt: userMessageContent })
        const detectedIntent = (intentResponse || '').trim().toLowerCase()

        if (detectedIntent === 'sign_up') {
          if (!message.channel.threads) {
            await message.reply("Sorry, I can't create sign-up threads in this channel.")
            return
          }
          const thread = await message.startThread({
            name: `Speaker Sign-up - ${message.author.username}`,
            autoArchiveDuration: 60,
            reason: `Initiating speaker sign-up process for ${message.author.tag}`,
          })
          activeSignups[thread.id] = { userId: message.author.id, state: 'awaiting_topic', lastUpdated: Date.now() }
          await thread.send(`Hi ${message.author}, thanks for offering to speak! To get you scheduled, could you please tell me your presentation topic?`)
          return
        }

        if (detectedIntent === 'view_schedule') {
          const limit = 5
          const upcoming = await getUpcomingSchedule(limit)
          if (!upcoming || !upcoming.length) return message.reply('There are currently no speakers scheduled.')
          const lines = upcoming.map((s) => {
            const d = s.scheduledDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
            return `- ${d}: @${s.discordUsername} - "${s.topic}"`
          })
          return message.reply(`**Upcoming Speakers (Next ${limit}):**\n${lines.join('\n')}`)
        }

        if (detectedIntent === 'cancel_talk') {
          const cancelled = await cancelSpeaker(message.author.id)
          if (cancelled) {
            const d = cancelled.scheduledDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
            return message.reply(`Okay, I have cancelled your talk "${cancelled.topic}" scheduled for ${d}.`)
          }
          return message.reply("You don't seem to have an upcoming talk scheduled that I can cancel.")
        }

        if (detectedIntent === 'query_talks') {
          try {
            const talkHistory = require('../talkHistory')
            const queryTypeSystemMessage =
              "You are an assistant classifying talk history queries. Possible types are 'existence_check' (asking if a topic has been covered), 'list_talks' (asking for talks about a topic), or 'other'. Respond with ONLY the query type followed by the topic in question, e.g., 'existence_check: AI agents' or 'list_talks: machine learning'."
            const queryTypeResponse = await completion({ systemMessage: queryTypeSystemMessage, prompt: userMessageContent })
            const [type, topic] = (queryTypeResponse || '').split(':').map((s) => (s || '').trim())
            const relatedTalks = topic ? await talkHistory.findRelatedTalks(topic) : []
            if (type === 'existence_check' && topic) {
              if (relatedTalks.length) {
                const items = relatedTalks
                  .map((t) => `- ${t.scheduledDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}: @${t.discordUsername} - "${t.topic}"`)
                  .join('\n')
                return message.reply(`Yes, there have been talks about ${topic}:\n${items}`)
              }
              return message.reply(`No, I don't see any previous talks about ${topic}.`)
            }
            if (type === 'list_talks' && topic) {
              if (relatedTalks.length) {
                const items = relatedTalks
                  .map((t) => `- ${t.scheduledDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}: @${t.discordUsername} - "${t.topic}"`)
                  .join('\n')
                return message.reply(`Here are talks related to ${topic}:\n${items}`)
              }
              return message.reply(`I couldn't find any talks related to ${topic}.`)
            }
            return message.reply("I'm not sure what you're asking about past talks. Could you clarify?")
          } catch (e) {
            return message.reply('Sorry, I encountered an error while searching for past talks.')
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
              replyMessage = "Sorry, I don't have a zoom link configured. Please contact an admin."
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
            await thread.send("Sorry, I don't have a zoom link configured. Please contact an admin.")
          }
          return
        }

        if (detectedIntent === 'schedule_for_others') {
          if (!message.channel.threads) {
            await message.reply("Sorry, I can't create scheduling threads in this channel.")
            return
          }
          const thread = await message.startThread({
            name: `Schedule Someone - ${message.author.username}`,
            autoArchiveDuration: 60,
            reason: `Initiating schedule-for-others process for ${message.author.tag}`,
          })
          activeSignups[thread.id] = { userId: message.author.id, state: 'awaiting_target_user', lastUpdated: Date.now() }
          await thread.send(`Hi ${message.author}, I'll help you schedule someone else to speak! Please mention the person you'd like to schedule (e.g., @username).`)
          return
        }

        // other
        return message.reply("How can I help? You can ask me to 'sign up', 'schedule someone else', 'view schedule', 'cancel talk', ask about past talks, or get the zoom link!")
      } catch (e) {
        return message.reply("Sorry, I'm having trouble understanding requests right now. Please try again later.")
      }
    }
  }
}

module.exports = { createMessageHandler }
