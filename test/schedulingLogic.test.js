const test = require('tape')
const mongoose = require('../lib/mongo') // Assuming mongoose is exported from here
const ScheduledSpeaker = require('../models/scheduledSpeaker')
const {
  findAvailableFridays,
  scheduleSpeaker,
  getUpcomingSchedule,
  cancelSpeaker,
} = require('../lib/schedulingLogic')

// Helper function to get the date for the next specific day of the week (0=Sun, 5=Fri)
function getNextDayOfWeek(dayOfWeek, startingDate = new Date()) {
  const resultDate = new Date(startingDate)
  resultDate.setUTCDate(
    startingDate.getUTCDate() +
      ((dayOfWeek - startingDate.getUTCDay() + 7) % 7),
  )
  if (resultDate <= startingDate) {
    // If today is the day or past, get next week's
    resultDate.setUTCDate(resultDate.getUTCDate() + 7)
  }
  resultDate.setUTCHours(0, 0, 0, 0) // Normalize to midnight UTC
  return resultDate
}

test('schedulingLogic - findAvailableFridays - no speakers scheduled', async (t) => {
  await ScheduledSpeaker.deleteMany({}) // Clean slate

  const count = 3
  const available = await findAvailableFridays(count)

  t.equal(available.length, count, `should return ${count} dates`)

  let expectedDate = getNextDayOfWeek(5) // 5 = Friday
  for (let i = 0; i < count; i++) {
    t.ok(available[i] instanceof Date, `date ${i} should be a Date object`)
    t.equal(
      available[i].toISOString(),
      expectedDate.toISOString(),
      `date ${i} should be ${expectedDate.toISOString()}`,
    )
    // Calculate next Friday
    expectedDate.setUTCDate(expectedDate.getUTCDate() + 7)
  }

  t.end()
})

test('schedulingLogic - findAvailableFridays - one Friday booked', async (t) => {
  await ScheduledSpeaker.deleteMany({}) // Clean slate

  const nextFriday = getNextDayOfWeek(5)
  const secondFriday = getNextDayOfWeek(
    5,
    new Date(nextFriday.getTime() + 24 * 60 * 60 * 1000),
  ) // Day after next Friday
  const thirdFriday = getNextDayOfWeek(
    5,
    new Date(secondFriday.getTime() + 24 * 60 * 60 * 1000),
  )
  const fourthFriday = getNextDayOfWeek(
    5,
    new Date(thirdFriday.getTime() + 24 * 60 * 60 * 1000),
  )

  // Book the second Friday
  await new ScheduledSpeaker({
    discordUserId: 'user1',
    discordUsername: 'test',
    topic: 'booked',
    scheduledDate: secondFriday,
  }).save()

  const count = 3
  const available = await findAvailableFridays(count)

  t.equal(available.length, count, `should return ${count} dates`)
  t.equal(
    available[0].toISOString(),
    nextFriday.toISOString(),
    'first available should be the immediate next Friday',
  )
  t.equal(
    available[1].toISOString(),
    thirdFriday.toISOString(),
    'second available should skip the booked one',
  )
  t.equal(
    available[2].toISOString(),
    fourthFriday.toISOString(),
    'third available should be the one after the skipped one',
  )

  await ScheduledSpeaker.deleteMany({}) // Cleanup
  t.end()
})

// Add more tests: e.g., multiple consecutive bookings, booking far in the future

test('schedulingLogic - scheduleSpeaker - successful booking', async (t) => {
  await ScheduledSpeaker.deleteMany({}) // Clean slate
  const dateToBook = getNextDayOfWeek(5)

  const details = {
    discordUserId: 'userSuccess',
    discordUsername: 'successUser',
    topic: 'Successful Talk',
    scheduledDate: dateToBook,
    threadId: 'thread123',
  }

  const result = await scheduleSpeaker(details)

  t.ok(result, 'should return a truthy result (the document)')
  t.equal(
    result.discordUserId,
    details.discordUserId,
    'saved document should have correct userId',
  )
  t.equal(
    result.topic,
    details.topic,
    'saved document should have correct topic',
  )
  t.equal(
    result.scheduledDate.toISOString(),
    dateToBook.toISOString(),
    'saved document should have correct date',
  )

  // Verify in DB
  const speakerInDb = await ScheduledSpeaker.findById(result._id)
  t.ok(speakerInDb, 'speaker should exist in DB')
  t.equal(
    speakerInDb.discordUsername,
    details.discordUsername,
    'DB document username should match',
  )

  await ScheduledSpeaker.deleteMany({}) // Cleanup
  t.end()
})

test('schedulingLogic - scheduleSpeaker - date conflict', async (t) => {
  await ScheduledSpeaker.deleteMany({}) // Clean slate
  const dateToBook = getNextDayOfWeek(5)

  // Pre-book the date
  await new ScheduledSpeaker({
    discordUserId: 'userConflict1',
    discordUsername: 'firstUser',
    topic: 'Booked First',
    scheduledDate: dateToBook,
  }).save()

  const details = {
    discordUserId: 'userConflict2',
    discordUsername: 'secondUser',
    topic: 'Conflicting Talk',
    scheduledDate: dateToBook,
  }

  // Check for null return value, assuming scheduleSpeaker returns null on conflict
  const result = await scheduleSpeaker(details)
  t.equal(result, null, 'should return null on conflict')

  // Verify no duplicate was inserted
  const count = await ScheduledSpeaker.countDocuments({
    scheduledDate: dateToBook,
  })
  t.equal(count, 1, 'should only be one speaker booked for the date')

  await ScheduledSpeaker.deleteMany({}) // Cleanup
  t.end()
})

test('schedulingLogic - getUpcomingSchedule - no speakers', async (t) => {
  await ScheduledSpeaker.deleteMany({}) // Clean slate
  const schedule = await getUpcomingSchedule()
  t.deepEqual(
    schedule,
    [],
    'should return an empty array when no speakers are scheduled',
  )
  t.end()
})

test('schedulingLogic - getUpcomingSchedule - past and future speakers', async (t) => {
  await ScheduledSpeaker.deleteMany({}) // Clean slate

  const today = new Date()
  const pastDate = new Date(today)
  pastDate.setDate(today.getDate() - 7)
  pastDate.setUTCHours(0, 0, 0, 0)

  const futureDate1 = getNextDayOfWeek(5)
  const futureDate2 = getNextDayOfWeek(
    5,
    new Date(futureDate1.getTime() + 24 * 60 * 60 * 1000),
  )

  await new ScheduledSpeaker({
    discordUserId: 'userPast',
    discordUsername: 'pastUser',
    topic: 'Past Talk',
    scheduledDate: pastDate,
  }).save()
  await new ScheduledSpeaker({
    discordUserId: 'userFuture1',
    discordUsername: 'futureUser1',
    topic: 'Future Talk 1',
    scheduledDate: futureDate1,
  }).save()
  await new ScheduledSpeaker({
    discordUserId: 'userFuture2',
    discordUsername: 'futureUser2',
    topic: 'Future Talk 2',
    scheduledDate: futureDate2,
  }).save()

  const schedule = await getUpcomingSchedule(5) // Limit high enough to get both

  t.equal(schedule.length, 2, 'should return only the 2 future speakers')
  t.equal(
    schedule[0].discordUsername,
    'futureUser1',
    'first speaker should be the soonest future one',
  )
  t.equal(
    schedule[0].scheduledDate.toISOString(),
    futureDate1.toISOString(),
    'first speaker date mismatch',
  )
  t.equal(
    schedule[1].discordUsername,
    'futureUser2',
    'second speaker should be the later future one',
  )
  t.equal(
    schedule[1].scheduledDate.toISOString(),
    futureDate2.toISOString(),
    'second speaker date mismatch',
  )

  await ScheduledSpeaker.deleteMany({}) // Cleanup
  t.end()
})

test('schedulingLogic - getUpcomingSchedule - respect limit', async (t) => {
  await ScheduledSpeaker.deleteMany({}) // Clean slate

  const dates = []
  for (let i = 0; i < 5; i++) {
    dates.push(getNextDayOfWeek(5, dates[i - 1] || new Date()))
    await new ScheduledSpeaker({
      discordUserId: `user${i}`,
      discordUsername: `futureUser${i}`,
      topic: `Future Talk ${i}`,
      scheduledDate: dates[i],
    }).save()
  }

  const limit = 3
  const schedule = await getUpcomingSchedule(limit)

  t.equal(schedule.length, limit, `should return exactly ${limit} speakers`)
  t.equal(
    schedule[0].discordUsername,
    'futureUser0',
    'first speaker should be correct',
  )
  t.equal(
    schedule[limit - 1].discordUsername,
    `futureUser${limit - 1}`,
    'last speaker should be correct based on limit',
  )

  await ScheduledSpeaker.deleteMany({}) // Cleanup
  t.end()
})

test('schedulingLogic - cancelSpeaker - successful cancellation', async (t) => {
  await ScheduledSpeaker.deleteMany({}) // Clean slate
  const userId = 'userToCancel'
  const futureDate = getNextDayOfWeek(5)
  const topic = 'Talk to Cancel'

  // Schedule a talk for the user
  await scheduleSpeaker({
    discordUserId: userId,
    discordUsername: 'cancelMe',
    topic: topic,
    scheduledDate: futureDate,
  })

  // Verify it was scheduled
  const speakerBefore = await ScheduledSpeaker.findOne({
    discordUserId: userId,
  })
  t.ok(speakerBefore, 'Speaker should exist before cancellation')

  // Attempt cancellation
  const cancelledTalk = await cancelSpeaker(userId)

  t.ok(cancelledTalk, 'cancelSpeaker should return the cancelled document')
  t.equal(
    cancelledTalk.discordUserId,
    userId,
    'Returned document should have correct userId',
  )
  t.equal(
    cancelledTalk.topic,
    topic,
    'Returned document should have correct topic',
  )
  t.equal(
    cancelledTalk.scheduledDate.toISOString(),
    futureDate.toISOString(),
    'Returned document should have correct date',
  )

  // Verify it's gone from DB
  const speakerAfter = await ScheduledSpeaker.findOne({ discordUserId: userId })
  t.notOk(speakerAfter, 'Speaker should not exist after cancellation')

  await ScheduledSpeaker.deleteMany({}) // Cleanup
  t.end()
})

test('schedulingLogic - cancelSpeaker - no upcoming talk found', async (t) => {
  await ScheduledSpeaker.deleteMany({}) // Clean slate
  const userId = 'userWithNoTalk'

  // Attempt cancellation
  const result = await cancelSpeaker(userId)

  t.equal(
    result,
    null,
    'cancelSpeaker should return null when no talk is found',
  )

  // Verify DB is still empty for this user
  const speaker = await ScheduledSpeaker.findOne({ discordUserId: userId })
  t.notOk(speaker, 'No speaker should exist for the user')

  t.end()
})

test('schedulingLogic - cancelSpeaker - only past talk exists', async (t) => {
  await ScheduledSpeaker.deleteMany({}) // Clean slate
  const userId = 'userWithPastTalk'
  const pastDate = new Date()
  pastDate.setDate(pastDate.getDate() - 7) // 1 week ago
  pastDate.setUTCHours(0, 0, 0, 0)

  // Schedule a talk in the past
  await new ScheduledSpeaker({
    discordUserId: userId,
    discordUsername: 'pastSpeaker',
    topic: 'Old Talk',
    scheduledDate: pastDate,
  }).save()

  // Verify it was scheduled
  const speakerBefore = await ScheduledSpeaker.findOne({
    discordUserId: userId,
  })
  t.ok(
    speakerBefore,
    'Speaker with past date should exist before cancellation attempt',
  )

  // Attempt cancellation
  const result = await cancelSpeaker(userId)

  t.equal(
    result,
    null,
    'cancelSpeaker should return null when only a past talk exists',
  )

  // Verify the past talk is still in DB
  const speakerAfter = await ScheduledSpeaker.findOne({ discordUserId: userId })
  t.ok(
    speakerAfter,
    'Speaker with past date should still exist after cancellation attempt',
  )
  t.equal(
    speakerAfter.scheduledDate.toISOString(),
    pastDate.toISOString(),
    'The remaining speaker should be the past one',
  )

  await ScheduledSpeaker.deleteMany({}) // Cleanup
  t.end()
})
