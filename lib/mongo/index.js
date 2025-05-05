module.exports =
  process.env.NODE_ENV === 'test' ? require('./mock-mongo') : require('./mongo')
