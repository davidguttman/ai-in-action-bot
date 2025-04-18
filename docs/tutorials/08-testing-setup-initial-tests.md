# Tutorial: Testing Setup and Initial Tests

This tutorial covers verifying the existing test setup using `tape` and writing initial tests for the core scheduling logic functions (`findAvailableFridays`, `scheduleSpeaker`, `getUpcomingSchedule`).

**Goal:** Ensure the test environment is functional and create foundational tests for the `schedulingLogic` module to confirm its basic operations and edge cases.

**Prerequisites:**

*   Completion of previous tutorials, resulting in implemented scheduling logic (`lib/schedulingLogic.js`) and a `ScheduledSpeaker` model (`models/scheduledSpeaker.js`).
*   An existing test setup using `tape`, `mongodb-memory-server`, and a test runner (`test/index.js`).
*   Dependencies like `tape`, `mongodb-memory-server`, and potentially `supertest` (if used by other tests) installed as dev dependencies.

---

## Step 1: Verify Existing Test Environment

Before writing new tests, let's confirm the existing setup is as expected.

1.  **Check `package.json`:**
    *   Open `package.json`.
    *   Verify that `tape` and `mongodb-memory-server` are listed under `devDependencies`.
    *   Confirm the `scripts.test` command looks like `"NODE_ENV=test node test/index.js"`.

2.  **Examine Test Runner (`test/index.js`):**
    *   Open `test/index.js`.
    *   Understand how it discovers and runs test files (e.g., does it use `glob`? Does it manually require files?).
    *   Identify if it handles global setup/teardown, especially for the MongoDB memory server. Look for calls like `mongoose.connect` (using the memory server URI) and `mongoose.disconnect`, potentially within helper functions required from `test/helpers/`.

3.  **Run Existing Tests:**
    *   Execute `npm test` in your terminal.
    *   Ensure the existing tests pass without errors. This confirms the basic runner and DB setup are working.

---

## Step 2: Create `test/schedulingLogic.test.js`

Now, let's create the test file specifically for our scheduling logic.

1.  **Create the file:** `test/schedulingLogic.test.js`.
2.  **Add Requires:** Start the file with the necessary requires.

    ```javascript
    // test/schedulingLogic.test.js
    const test = require('tape')
    const mongoose = require('../lib/mongo') // Assuming mongoose is exported from here
    const ScheduledSpeaker = require('../models/scheduledSpeaker')
    const {
      findAvailableFridays,
      scheduleSpeaker,
      getUpcomingSchedule
    } = require('../lib/schedulingLogic')

    // Helper function to get the date for the next specific day of the week (0=Sun, 5=Fri)
    function getNextDayOfWeek (dayOfWeek, startingDate = new Date()) {
      const resultDate = new Date(startingDate)
      resultDate.setUTCDate(startingDate.getUTCDate() + (dayOfWeek - startingDate.getUTCDay() + 7) % 7)
      if (resultDate <= startingDate) { // If today is the day or past, get next week's
        resultDate.setUTCDate(resultDate.getUTCDate() + 7)
      }
      resultDate.setUTCHours(0, 0, 0, 0) // Normalize to midnight UTC
      return resultDate
    }
    ```

---

## Step 3: Write Tests for `findAvailableFridays`

We'll add tests covering different scenarios for finding available slots.

```javascript
// test/schedulingLogic.test.js (continued)

test('schedulingLogic - findAvailableFridays - no speakers scheduled', async (t) => {
  await ScheduledSpeaker.deleteMany({}) // Clean slate

  const count = 3
  const available = await findAvailableFridays(count)

  t.equal(available.length, count, `should return ${count} dates`)

  let expectedDate = getNextDayOfWeek(5) // 5 = Friday
  for (let i = 0; i < count; i++) {
    t.ok(available[i] instanceof Date, `date ${i} should be a Date object`)
    t.equal(available[i].toISOString(), expectedDate.toISOString(), `date ${i} should be ${expectedDate.toISOString()}`)
    // Calculate next Friday
    expectedDate.setUTCDate(expectedDate.getUTCDate() + 7)
  }

  t.end()
})

test('schedulingLogic - findAvailableFridays - one Friday booked', async (t) => {
  await ScheduledSpeaker.deleteMany({}) // Clean slate

  const nextFriday = getNextDayOfWeek(5)
  const secondFriday = getNextDayOfWeek(5, new Date(nextFriday.getTime() + 24 * 60 * 60 * 1000)) // Day after next Friday
  const thirdFriday = getNextDayOfWeek(5, new Date(secondFriday.getTime() + 24 * 60 * 60 * 1000))
  const fourthFriday = getNextDayOfWeek(5, new Date(thirdFriday.getTime() + 24 * 60 * 60 * 1000))

  // Book the second Friday
  await new ScheduledSpeaker({ discordUserId: 'user1', discordUsername: 'test', topic: 'booked', scheduledDate: secondFriday }).save()

  const count = 3
  const available = await findAvailableFridays(count)

  t.equal(available.length, count, `should return ${count} dates`)
  t.equal(available[0].toISOString(), nextFriday.toISOString(), 'first available should be the immediate next Friday')
  t.equal(available[1].toISOString(), thirdFriday.toISOString(), 'second available should skip the booked one')
  t.equal(available[2].toISOString(), fourthFriday.toISOString(), 'third available should be the one after the skipped one')

  await ScheduledSpeaker.deleteMany({}) // Cleanup
  t.end()
})

// Add more tests: e.g., multiple consecutive bookings, booking far in the future

```

---

## Step 4: Write Tests for `scheduleSpeaker`

Test both successful booking and conflict handling.

```javascript
// test/schedulingLogic.test.js (continued)

test('schedulingLogic - scheduleSpeaker - successful booking', async (t) => {
  await ScheduledSpeaker.deleteMany({}) // Clean slate
  const dateToBook = getNextDayOfWeek(5)

  const details = {
    discordUserId: 'userSuccess',
    discordUsername: 'successUser',
    topic: 'Successful Talk',
    scheduledDate: dateToBook,
    threadId: 'thread123'
  }

  const result = await scheduleSpeaker(details)

  t.ok(result, 'should return a truthy result (the document)')
  t.equal(result.discordUserId, details.discordUserId, 'saved document should have correct userId')
  t.equal(result.topic, details.topic, 'saved document should have correct topic')
  t.equal(result.scheduledDate.toISOString(), dateToBook.toISOString(), 'saved document should have correct date')

  // Verify in DB
  const speakerInDb = await ScheduledSpeaker.findById(result._id)
  t.ok(speakerInDb, 'speaker should exist in DB')
  t.equal(speakerInDb.discordUsername, details.discordUsername, 'DB document username should match')

  await ScheduledSpeaker.deleteMany({}) // Cleanup
  t.end()
})

test('schedulingLogic - scheduleSpeaker - date conflict', async (t) => {
  await ScheduledSpeaker.deleteMany({}) // Clean slate
  const dateToBook = getNextDayOfWeek(5)

  // Pre-book the date
  await new ScheduledSpeaker({ discordUserId: 'userConflict1', discordUsername: 'firstUser', topic: 'Booked First', scheduledDate: dateToBook }).save()

  const details = {
    discordUserId: 'userConflict2',
    discordUsername: 'secondUser',
    topic: 'Conflicting Talk',
    scheduledDate: dateToBook
  }

  // Depending on implementation: check for null/false OR catch specific error
  // Option 1: Check for null/false (if scheduleSpeaker returns this on conflict)
  // const result = await scheduleSpeaker(details)
  // t.equal(result, null, 'should return null on conflict')

  // Option 2: Expect specific error (if scheduleSpeaker throws on conflict)
  try {
    await scheduleSpeaker(details)
    t.fail('should have thrown an error for duplicate key')
  } catch (error) {
    // Check if the error indicates a duplicate key / conflict
    // This check depends heavily on how the error is thrown or what mongoose/driver returns
    t.ok(error.code === 11000 || (error.message && error.message.includes('duplicate key')), 'error should indicate a duplicate key conflict')
  }

  // Verify no duplicate was inserted
  const count = await ScheduledSpeaker.countDocuments({ scheduledDate: dateToBook })
  t.equal(count, 1, 'should only be one speaker booked for the date')

  await ScheduledSpeaker.deleteMany({}) // Cleanup
  t.end()
})

```

---

## Step 5: Write Tests for `getUpcomingSchedule`

Test retrieving the schedule under different conditions.

```javascript
// test/schedulingLogic.test.js (continued)

test('schedulingLogic - getUpcomingSchedule - no speakers', async (t) => {
  await ScheduledSpeaker.deleteMany({}) // Clean slate
  const schedule = await getUpcomingSchedule()
  t.deepEqual(schedule, [], 'should return an empty array when no speakers are scheduled')
  t.end()
})

test('schedulingLogic - getUpcomingSchedule - past and future speakers', async (t) => {
  await ScheduledSpeaker.deleteMany({}) // Clean slate

  const today = new Date()
  const pastDate = new Date(today)
  pastDate.setDate(today.getDate() - 7)
  pastDate.setUTCHours(0,0,0,0)

  const futureDate1 = getNextDayOfWeek(5)
  const futureDate2 = getNextDayOfWeek(5, new Date(futureDate1.getTime() + 24 * 60 * 60 * 1000))

  await new ScheduledSpeaker({ discordUserId: 'userPast', discordUsername: 'pastUser', topic: 'Past Talk', scheduledDate: pastDate }).save()
  await new ScheduledSpeaker({ discordUserId: 'userFuture1', discordUsername: 'futureUser1', topic: 'Future Talk 1', scheduledDate: futureDate1 }).save()
  await new ScheduledSpeaker({ discordUserId: 'userFuture2', discordUsername: 'futureUser2', topic: 'Future Talk 2', scheduledDate: futureDate2 }).save()

  const schedule = await getUpcomingSchedule(5) // Limit high enough to get both

  t.equal(schedule.length, 2, 'should return only the 2 future speakers')
  t.equal(schedule[0].discordUsername, 'futureUser1', 'first speaker should be the soonest future one')
  t.equal(schedule[0].scheduledDate.toISOString(), futureDate1.toISOString(), 'first speaker date mismatch')
  t.equal(schedule[1].discordUsername, 'futureUser2', 'second speaker should be the later future one')
  t.equal(schedule[1].scheduledDate.toISOString(), futureDate2.toISOString(), 'second speaker date mismatch')

  await ScheduledSpeaker.deleteMany({}) // Cleanup
  t.end()
})

test('schedulingLogic - getUpcomingSchedule - respect limit', async (t) => {
  await ScheduledSpeaker.deleteMany({}) // Clean slate

  const dates = []
  for (let i = 0; i < 5; i++) {
    dates.push(getNextDayOfWeek(5, dates[i-1] || new Date()))
    await new ScheduledSpeaker({ 
      discordUserId: `user${i}`, 
      discordUsername: `futureUser${i}`, 
      topic: `Future Talk ${i}`, 
      scheduledDate: dates[i] 
    }).save()
  }

  const limit = 3
  const schedule = await getUpcomingSchedule(limit)

  t.equal(schedule.length, limit, `should return exactly ${limit} speakers`)
  t.equal(schedule[0].discordUsername, 'futureUser0', 'first speaker should be correct')
  t.equal(schedule[limit - 1].discordUsername, `futureUser${limit - 1}`, 'last speaker should be correct based on limit')

  await ScheduledSpeaker.deleteMany({}) // Cleanup
  t.end()
})

```

---

## Step 6: Run All Tests

1.  Execute `npm test` again.
2.  Verify that all tests, including the new ones in `test/schedulingLogic.test.js`, pass.
3.  Address any failures by debugging the test logic or the implementation in `lib/schedulingLogic.js`.

---

**Conclusion:**

You have now verified your test setup and created a solid suite of initial tests for the core scheduling logic. These tests cover finding available dates, booking speakers, handling conflicts, and retrieving the upcoming schedule. This forms a crucial safety net for future development and refactoring. 