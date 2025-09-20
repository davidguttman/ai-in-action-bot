const test = require('tape')
const {
  parseAnsweredQuestions,
  INTENT_QUESTIONS,
  INTENT_REQUIREMENTS,
} = require('../lib/shared/question-validation')

test('parseAnsweredQuestions - parses LLM response correctly', (t) => {
  const mockResponse = `1. ANSWERED: machine learning
2. NOT_ANSWERED
3. ANSWERED: next Friday`

  const result = parseAnsweredQuestions(mockResponse)

  t.equal(result.answered.length, 2, 'Should find 2 answered questions')
  t.equal(
    result.answered[0].questionNumber,
    1,
    'First answer should be question 1',
  )
  t.equal(
    result.answered[0].answer,
    'machine learning',
    'First answer should be machine learning',
  )
  t.equal(
    result.answered[1].questionNumber,
    3,
    'Second answer should be question 3',
  )
  t.equal(
    result.answered[1].answer,
    'next Friday',
    'Second answer should be next Friday',
  )

  t.end()
})

test('INTENT_QUESTIONS - has questions for sign_up intent', (t) => {
  t.ok(INTENT_QUESTIONS.sign_up, 'Should have sign_up questions')
  t.equal(
    INTENT_QUESTIONS.sign_up.length,
    2,
    'Should have 2 questions for sign_up',
  )
  t.ok(
    INTENT_QUESTIONS.sign_up[0].includes('topic'),
    'First question should be about topic',
  )

  t.end()
})

test('INTENT_REQUIREMENTS - has requirements for sign_up intent', (t) => {
  t.ok(INTENT_REQUIREMENTS.sign_up, 'Should have sign_up requirements')
  t.deepEqual(
    INTENT_REQUIREMENTS.sign_up.required,
    [1],
    'Should require question 1',
  )
  t.deepEqual(
    INTENT_REQUIREMENTS.sign_up.optional,
    [2],
    'Should have question 2 as optional',
  )

  t.end()
})

test('parseAnsweredQuestions - handles empty response', (t) => {
  const mockResponse = ''

  const result = parseAnsweredQuestions(mockResponse)

  t.equal(result.answered.length, 0, 'Should find 0 answered questions')

  t.end()
})

test('parseAnsweredQuestions - handles malformed response', (t) => {
  const mockResponse = 'This is not a valid response format'

  const result = parseAnsweredQuestions(mockResponse)

  t.equal(result.answered.length, 0, 'Should find 0 answered questions')

  t.end()
})
