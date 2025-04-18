const server = require('./server')
const discord = require('./lib/discord')

discord.once('ready', () => {
  console.log('Ready!')
})

const port = process.env.PORT || 3000

server.listen(port)
console.log(`AIIA Bot listening on port ${port}`)
