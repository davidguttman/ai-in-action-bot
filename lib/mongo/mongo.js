const mongoose = require('mongoose')
const deasync = require('deasync')
const config = require('../../config')

let db = null

mongoose
  .connect(config.mongoUri)
  .then((connection) => {
    db = connection
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err)
    process.exit(1)
  })

// Wait for connection
deasync.loopWhile(() => !db)

mongoose.checkHealth = async function () {
  const time = Date.now()
  const { db } = mongoose.connection
  const collection = db.collection('healthcheck')

  const query = { _id: 'heartbeat' }
  const value = { $set: { time } }
  await collection.updateOne(query, value, { upsert: true })

  const found = await collection.findOne({ time: { $gte: time } })
  if (!found) throw new Error('DB Healthcheck Failed')
  return !!found
}

module.exports = mongoose
