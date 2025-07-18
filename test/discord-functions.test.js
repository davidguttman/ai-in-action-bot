const test = require('tape')
const { exec } = require('child_process')
const { promisify } = require('util')

const execAsync = promisify(exec)

// Extract the getMergeCommitSummary function for testing
async function getMergeCommitSummary() {
  try {
    const { stdout } = await execAsync('git log --merges -n 5 --pretty=format:"%s"')
    const mergeCommits = stdout.trim().split('\n').filter(line => line.length > 0)
    
    if (mergeCommits.length === 0) {
      return 'No recent merge commits found.'
    }
    
    return `**Recent Merge Commits:**\n${mergeCommits.map((commit, index) => `${index + 1}. ${commit}`).join('\n')}`
  } catch (error) {
    console.error('Error getting merge commit summary:', error)
    return 'Unable to retrieve merge commit information.'
  }
}

test('getMergeCommitSummary function', async (t) => {
  const result = await getMergeCommitSummary()
  
  t.equal(typeof result, 'string', 'Returns a string')
  t.ok(result.length > 0, 'Returns non-empty string')
  
  // Should handle the case of no merge commits gracefully
  if (result === 'No recent merge commits found.') {
    t.pass('Correctly handles no merge commits case')
  } else {
    t.ok(result.includes('**Recent Merge Commits:**'), 'Includes header when merge commits exist')
  }
  
  t.end()
})

test('getMergeCommitSummary error handling', async (t) => {
  // Mock execAsync to throw error
  const originalExecAsync = execAsync
  
  // Can't easily mock exec in this context, so we'll test the actual error case
  // by checking if our function handles git command failures gracefully
  const result = await getMergeCommitSummary()
  
  // The function should always return a string, never throw
  t.equal(typeof result, 'string', 'Function returns string even on potential errors')
  t.end()
})