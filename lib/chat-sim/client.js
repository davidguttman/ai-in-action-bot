const { EventEmitter } = require('events')
const { User, Channel, ThreadChannel, Message } = require('./entities')

class ChatClient extends EventEmitter {
  constructor({ guildId, botId = 'bot-1', botName = 'bot' }) {
    super()
    this.guildId = guildId
    this.user = new User({ id: botId, username: botName, bot: true })
    // Internal user map
    this._users = new Map()
    this._users.set(this.user.id, this.user)
    this.usernameIndex = new Map([[botName.toLowerCase(), this.user.id]])
    this.channels = new Map()
    // Discord-like users API shim
    this.users = {
      fetch: async (id) => {
        const u = this._users.get(id)
        if (!u) throw new Error(`User ${id} not found`)
        return u
      },
    }
  }

  ensureUser(username) {
    const key = username.toLowerCase()
    if (this.usernameIndex.has(key)) return this._users.get(this.usernameIndex.get(key))
    const id = `u-${this._users.size + 1}`
    const u = new User({ id, username })
    this._users.set(id, u)
    this.usernameIndex.set(key, id)
    return u
  }

  registerUser(user) {
    this._users.set(user.id, user)
    this.usernameIndex.set(user.username.toLowerCase(), user.id)
  }

  createTextChannel({ id = 'c-1', name = 'general' } = {}) {
    const ch = new Channel({ id, name, guildId: this.guildId })
    this.channels.set(id, ch)
    return ch
  }

  createMessage({ content, author, channel }) {
    return new Message({ content, author, channel, guildId: this.guildId, client: this })
  }
}

module.exports = { ChatClient }
