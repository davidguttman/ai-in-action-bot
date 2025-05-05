module.exports = {
  completion: async ({ prompt, systemMessage }) => {
    if (
      systemMessage &&
      systemMessage.includes('determine if a specific topic has been covered')
    ) {
      if (prompt.includes('Query topic: AI Agents')) {
        return 'yes'
      } else if (prompt.includes('Query topic: Quantum Computing')) {
        return 'no'
      }
    }

    if (
      systemMessage &&
      systemMessage.includes('find talks related to a specific topic')
    ) {
      if (prompt.includes('Query topic: AI Agents')) {
        return '1'
      } else {
        return 'none'
      }
    }

    return 'other'
  },
}
