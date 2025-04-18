// Force test environment
process.env.NODE_ENV = 'test'

const test = require('tape')
const glob = require('glob')
const cleanup = require('./helpers/cleanup')

const TIMEOUT = 10 * 1000

const timeout = setTimeout(() => {
  console.error(`Tests timed out after ${Math.round(TIMEOUT / 1000)}s`)
  process.exit(1)
}, TIMEOUT)

// Get files to test - either from args or find all test files

const specifiedFiles = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : getAllTestFiles()

const filesToTest = specifiedFiles.map(relativeToRequire)

// Load all test files - tape will run them in sequence
filesToTest.forEach(file => {
  test(`File: ${file}`, t => t.end())
  require(file)
})

// Run final cleanup after all tests complete
test('cleanup', async t => {
  console.log('Running final cleanup...')
  try {
    await cleanup()
    console.log('Final cleanup complete')
    clearTimeout(timeout)
    t.end()
  } catch (err) {
    console.error('Final cleanup error:', err)
    t.error(err)
    t.end()
  }
})

function getAllTestFiles () {
  return glob.sync('**/*.test.js', {
    cwd: __dirname,
    ignore: ['node_modules/**', 'helpers/**']
  })
}

function relativeToRequire (relativePath) {
  return './' + relativePath.replace(/^test\//, '').replace(/\.js$/, '')
}
