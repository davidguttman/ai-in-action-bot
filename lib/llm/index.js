const fetch = require('isomorphic-fetch')
const config = require('../../config')

module.exports = {
  completion
}

async function completion ({
  prompt,
  messages,
  systemMessage,
  maxTokens = 100,
  model = 'openai/gpt-4o-mini'
}) {
  const payloadMessages = messages || []

  if (systemMessage) {
    payloadMessages.unshift({
      role: 'system',
      content: systemMessage
    })
  }

  if (prompt) {
    payloadMessages.push({
      role: 'user',
      content: prompt
    })
  }

  const payload = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openrouterApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: payloadMessages,
      max_tokens: maxTokens
    })
  }

  const response = await fetch(
    'https://openrouter.ai/api/v1/chat/completions',
    payload
  )

  const data = await response.json()
  return data.choices[0].message.content
}
