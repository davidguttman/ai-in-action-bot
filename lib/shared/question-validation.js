const { completion } = require('../llm')

const INTENT_QUESTIONS = {
  sign_up: [
    'What topic does the user want to present on?',
    'What date or timeframe do they prefer?',
  ],
  schedule_for_others: [
    'Who does the user want to schedule? (Discord mention)',
    'What topic should they present on?',
    'What date or timeframe is preferred?',
  ],
  cancel_talk_for_others: [
    'Whose talk does the user want to cancel? (Discord mention)',
    'What is the reason for cancellation?',
  ],
  reschedule_talk_for_others: [
    'Whose talk does the user want to reschedule? (Discord mention)',
    'What new date or timeframe is preferred?',
    'What is the reason for rescheduling?',
  ],
  query_talks: [
    'What topic should be searched for?',
    'Which speaker should be searched for?',
    'What date range should be searched?',
    'How many results should be shown?',
    'What type of query is this? (existence check, list, search)',
  ],
  recent_changes: ['What time range should be searched for changes?'],
  view_schedule: [],
  cancel_talk: [],
  reschedule_talk: [],
  zoom_link: [],
  repo: [],
  other: [],
}

const INTENT_REQUIREMENTS = {
  sign_up: { required: [1], optional: [2] },
  schedule_for_others: { required: [1, 2], optional: [3] },
  cancel_talk_for_others: { required: [1], optional: [2] },
  reschedule_talk_for_others: { required: [1], optional: [2, 3] },
  query_talks: { required: [], optional: [1, 2, 3, 4, 5] },
  recent_changes: { required: [], optional: [1] },
  view_schedule: { required: [], optional: [] },
  cancel_talk: { required: [], optional: [] },
  reschedule_talk: { required: [], optional: [] },
  zoom_link: { required: [], optional: [] },
  repo: { required: [], optional: [] },
  other: { required: [], optional: [] },
}

/**
 * Validates a user message against intent-specific questions using LLM
 * @param {string} userMessage - The user's message content
 * @param {string} intent - The detected intent
 * @returns {Promise<{answered: Array, missingRequired: Array, questions: Array}>}
 */
async function validateMessageQuestions(userMessage, intent) {
  const questions = INTENT_QUESTIONS[intent]
  const requirements = INTENT_REQUIREMENTS[intent]

  if (!questions || !requirements) {
    return { answered: [], missingRequired: [], questions: [] }
  }

  if (questions.length === 0) {
    return { answered: [], missingRequired: [], questions: [] }
  }

  try {
    const questionList = questions.map((q, i) => `${i + 1}. ${q}`).join('\n')

    const systemMessage = `Given this user message, determine which of these questions have been answered.
Questions:
${questionList}

For each question, respond with:
- The question number
- "ANSWERED" if the message contains this information, followed by the extracted answer
- "NOT_ANSWERED" if the message does not contain this information

Format: "1. ANSWERED: machine learning" or "2. NOT_ANSWERED"`

    const response = await completion({
      systemMessage,
      prompt: userMessage,
      maxTokens: 300,
    })

    const parsed = parseAnsweredQuestions(response)
    const answeredNumbers = parsed.answered.map((a) => a.questionNumber)
    const missingRequired = requirements.required.filter(
      (reqNum) => !answeredNumbers.includes(reqNum),
    )

    return {
      answered: parsed.answered,
      missingRequired,
      questions,
    }
  } catch (error) {
    console.error('Question validation failed:', error)
    return {
      answered: [],
      missingRequired: requirements.required,
      questions,
    }
  }
}

/**
 * Parses LLM response to extract answered questions
 * @param {string} llmResponse - Raw LLM response
 * @returns {{answered: Array}}
 */
function parseAnsweredQuestions(llmResponse) {
  const lines = llmResponse.split('\n').filter((line) => line.trim())
  const answered = []

  lines.forEach((line) => {
    const match = line.match(/^(\d+)\.\s+(ANSWERED|NOT_ANSWERED)(?::\s*(.+))?/)
    if (match) {
      const [, questionNum, status, answer] = match
      if (status === 'ANSWERED') {
        answered.push({
          questionNumber: parseInt(questionNum),
          answer: answer?.trim() || '',
        })
      }
    }
  })

  return { answered }
}

module.exports = {
  validateMessageQuestions,
  parseAnsweredQuestions,
  INTENT_QUESTIONS,
  INTENT_REQUIREMENTS,
}
