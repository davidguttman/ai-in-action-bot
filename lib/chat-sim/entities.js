const { EventEmitter } = require('events')

let nextThreadId = 1

class User {
  constructor({ id, username, bot = false }) {
    this.id = id
    this.username = username
    this.bot = bot
    this.tag = `${username}#0001`
  }
  toString() {
    return `@${this.username}`
  }
}

class Channel extends EventEmitter {
  constructor({ id, name, guildId }) {
    super()
    this.id = id
    this.name = name
    this.guildId = guildId
    this.threads = {}
    this.type = 'text'
  }
  isThread() {
    return false
  }
  async send(content) {
    this.emit('message', { channelId: this.id, content })
  }
  async startThread({ name }) {
    const id = `t-${nextThreadId++}`
    const thread = new ThreadChannel({ id, name, guildId: this.guildId, parent: this })
    this.threads[id] = thread
    this.emit('threadCreated', thread)
    return thread
  }
}

class ThreadChannel extends EventEmitter {
  constructor({ id, name, guildId, parent }) {
    super()
    this.id = id
    this.name = name
    this.guildId = guildId
    this.parent = parent
    this.type = 'thread'
  }
  isThread() {
    return true
  }
  async send(content) {
    this.emit('message', { channelId: this.id, content })
  }
}

class Message {
  constructor({ content, author, channel, guildId, client }) {
    this.content = content
    this.author = author
    this.channel = channel
    this.guildId = guildId
    this.client = client
  }
  async reply(content) {
    await this.channel.send(content)
  }
  async startThread(opts) {
    return this.channel.startThread(opts)
  }
}

module.exports = { User, Channel, ThreadChannel, Message }

