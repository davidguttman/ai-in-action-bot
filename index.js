const server = require('./server')
const discord = require('./lib/discord')

discord.once('ready', () => {
  console.log('Ready!')
})

const port = process.env.PORT || 3000

server.listen(port)
console.log(`AIIA Bot listening on port ${port}`)

// Graceful shutdown handling
function shutdown(signal) {
  console.log(`${signal} received, shutting down gracefully...`)

  // Stop proactive scheduler if running
  if (discord.proactiveScheduler) {
    discord.proactiveScheduler.stop()
  }

  // Destroy Discord client
  discord.destroy()

  // Close HTTP server
  server.close(() => {
    console.log('HTTP server closed')
    process.exit(0)
  })

  // Force exit after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error('Graceful shutdown timed out, forcing exit')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
