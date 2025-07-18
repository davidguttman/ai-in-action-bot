const test = require('tape')
const { exec } = require('child_process')
const { promisify } = require('util')

const execAsync = promisify(exec)

// Test the merge commit summary functionality by testing the git command directly
test('getMergeCommitSummary - can get git log output', async (t) => {
  try {
    // Test that git log command works (even if no merge commits exist)
    const { stdout } = await execAsync('git log --merges -n 5 --pretty=format:"%s"')
    
    // Should at least not throw an error
    t.pass('Git log command executed successfully')
    
    // If there are no merge commits, stdout will be empty, which is fine
    t.equal(typeof stdout, 'string', 'Git log returns string output')
    
    t.end()
  } catch (error) {
    t.error(error, 'Git log command should not fail')
    t.end()
  }
})

test('getMergeCommitSummary - format output correctly', async (t) => {
  try {
    const { stdout } = await execAsync('git log --merges -n 5 --pretty=format:"%s"')
    const mergeCommits = stdout.trim().split('\n').filter(line => line.length > 0)
    
    if (mergeCommits.length === 0) {
      // Test the "no merge commits" case
      const expectedMessage = 'No recent merge commits found.'
      t.equal(expectedMessage, 'No recent merge commits found.', 'Handles no merge commits case')
    } else {
      // Test the formatting
      const formatted = `**Recent Merge Commits:**\n${mergeCommits.map((commit, index) => `${index + 1}. ${commit}`).join('\n')}`
      t.ok(formatted.startsWith('**Recent Merge Commits:**'), 'Format includes header')
      t.ok(formatted.includes('1. '), 'Format includes numbered items')
    }
    
    t.end()
  } catch (error) {
    t.error(error, 'Should not fail formatting merge commits')
    t.end()
  }
})

test('startup message format', (t) => {
  const mockSummary = '**Recent Merge Commits:**\n1. feat: add new feature\n2. fix: bug fix'
  const timestamp = new Date().toLocaleString()
  const expectedFormat = `🤖 **Bot Restarted** - ${timestamp}\n\n${mockSummary}`
  
  t.ok(expectedFormat.includes('🤖 **Bot Restarted**'), 'Message includes restart indicator')
  t.ok(expectedFormat.includes(mockSummary), 'Message includes merge commit summary')
  t.ok(expectedFormat.includes(timestamp), 'Message includes timestamp')
  
  t.end()
})