const mongoose = require('../../lib/mongo')

async function cleanup () {
  if (process.env.NODE_ENV === 'test') {
    await mongoose.cleanup()
  }
}

// Ensure cleanup happens on process exit
process.on('exit', cleanup)

module.exports = cleanup
