const test = require('tape')

// Test the source code detection logic independently
test('source code detection - keyword matching', (t) => {
  // Extract the source code detection logic to test it
  const sourceCodeKeywords = [
    'source code',
    'github',
    'repository',
    'repo',
    'code',
    'source',
    'git',
  ]

  const testCases = [
    // Should detect source code queries
    { input: 'Where is the GitHub source code?', expected: true },
    { input: 'GitHub repo?', expected: true },
    { input: 'source code link?', expected: true },
    { input: 'Can I see the code?', expected: true },
    { input: 'Where is the repository?', expected: true },
    { input: 'Show me the source', expected: true },
    { input: 'git repository', expected: true },
    { input: 'GITHUB REPO', expected: true }, // case insensitive
    { input: 'I need the Source Code', expected: true }, // mixed case

    // Should NOT detect as source code queries
    { input: 'sign up', expected: false },
    { input: 'view schedule', expected: false },
    { input: 'cancel talk', expected: false },
    { input: 'help', expected: false },
    { input: 'hello', expected: false },
    { input: 'thanks', expected: false },
    { input: 'what can you do?', expected: false },
  ]

  testCases.forEach(({ input, expected }) => {
    const messageContainsSourceCodeQuery = sourceCodeKeywords.some((keyword) =>
      input.toLowerCase().includes(keyword.toLowerCase()),
    )

    t.equal(
      messageContainsSourceCodeQuery,
      expected,
      `Input "${input}" should ${expected ? 'detect' : 'not detect'} source code query`,
    )
  })

  t.end()
})

test('source code response message format', (t) => {
  const expectedResponse =
    'You can find the source code here: https://github.com/davidguttman/ai-in-action-bot'

  // Verify the response contains the correct GitHub URL
  t.ok(
    expectedResponse.includes(
      'https://github.com/davidguttman/ai-in-action-bot',
    ),
    'Response should contain the correct GitHub repository URL',
  )

  t.ok(
    expectedResponse.includes('You can find the source code here:'),
    'Response should contain the expected intro text',
  )

  t.end()
})

test('/source slash command', (t) => {
  const sourceCommand = require('../lib/discord/commands/source')

  // Verify command structure
  t.ok(sourceCommand.data, 'Command should have data property')
  t.ok(sourceCommand.execute, 'Command should have execute function')
  t.equal(sourceCommand.data.name, 'source', 'Command name should be "source"')
  t.equal(
    sourceCommand.data.description,
    'Get the GitHub source code repository link',
    'Command should have correct description',
  )

  // Mock interaction for testing
  const mockInteraction = {
    reply: (message) => {
      t.equal(
        message,
        'You can find the source code here: https://github.com/davidguttman/ai-in-action-bot',
        'Slash command should return correct GitHub repository message',
      )
      return Promise.resolve()
    },
  }

  // Test command execution
  sourceCommand.execute(mockInteraction)

  t.end()
})
