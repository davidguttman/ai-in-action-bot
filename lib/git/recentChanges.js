const { exec } = require('node:child_process')
const { promisify } = require('node:util')

const execAsync = promisify(exec)

async function getRecentMergeChanges() {
  const format = ['%H', '%an', '%ad', '%s', '%b'].join('%x1f')
  const baseCommand = `git log --merges --date=short --pretty=format:${format}%x1e`
  const commands = [
    `${baseCommand} --since="1 month ago"`,
    `${baseCommand} -n 1`,
  ]

  for (const command of commands) {
    const { stdout } = await execAsync(command, { maxBuffer: 1024 * 1024 })
    const commits = parseGitLog(stdout)

    if (commits.length) {
      if (command.includes('--since')) return commits
      return commits.slice(0, 1)
    }
  }

  return []
}

function parseGitLog(stdout) {
  const entries = stdout.trim() ? stdout.split('\x1e').filter(Boolean) : []

  return entries.map((entry) => {
    const [hash, author, date, subject, body = ''] = entry.split('\x1f')

    return {
      hash,
      author,
      date,
      subject,
      body: body.trim(),
    }
  })
}

function formatMergeChanges(commits) {
  if (!commits.length) return 'No merge commits found for this repository.'

  const header = '**Recent Merge Changes**'
  const lines = commits.map((commit) => {
    const descriptionLines = commit.body
      ? commit.body.split('\n').filter(Boolean).map((line) => `> ${line}`)
      : ['> (no description provided)']

    return [
      `- ${commit.date} — ${commit.subject}`,
      `  by **${commit.author}**`,
      ...descriptionLines,
    ].join('\n')
  })

  return [header, ...lines].join('\n')
}

module.exports = { getRecentMergeChanges, formatMergeChanges }
