# Tutorial: Implement Core Scheduling Logic

This tutorial explains how to create the core functions for finding available speaker slots and managing speaker data using the `ScheduledSpeaker` Mongoose model.

**Goal:** Implement functions to find available Fridays, schedule speakers, and retrieve the upcoming schedule.

**Prerequisites:**

*   Completion of the previous tutorial ([01-mongodb-setup.md](01-mongodb-setup.md)), ensuring the `ScheduledSpeaker` model exists.
*   A shared Mongoose connection established elsewhere in your project.

---

## Step 1: Create the Logic File (`lib/schedulingLogic.js`)

This file will house the functions that interact with the database for scheduling purposes.

1.  Create a new directory named `lib` if it doesn't already exist at the root of your project.
2.  Inside the `lib` directory, create a new file named `schedulingLogic.js`.

---

## Step 2: Require Model and Define Functions

Open `lib/schedulingLogic.js` and add the following code. Explanations for each function follow the code block.

```javascript
// lib/schedulingLogic.js
const ScheduledSpeaker = require('../models/scheduledSpeaker')

/**
 * Finds the next available Fridays that are not booked.
 * @param {number} [count=3] - The number of available Fridays to find.
 * @returns {Promise<Date[]>} - A promise that resolves to an array of available Date objects (normalized to midnight UTC).
 */
async function findAvailableFridays (count = 3) {
  const availableFridays = []
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0) // Normalize today to midnight UTC

  // Start searching from the next day
  let currentDate = new Date(today)
  currentDate.setUTCDate(currentDate.getUTCDate() + 1)

  try {
    while (availableFridays.length < count) {
      // Move to the next Friday
      const dayOfWeek = currentDate.getUTCDay() // 0 = Sunday, 5 = Friday, 6 = Saturday
      const daysUntilFriday = (5 - dayOfWeek + 7) % 7
      // If it's already Friday or later, move to *next* week's Friday unless it's Friday today (handled by starting search tomorrow)
      const daysToAdd = daysUntilFriday === 0 ? (dayOfWeek === 5 ? 7 : 0) : daysUntilFriday
      
      if (daysToAdd > 0) {
         currentDate.setUTCDate(currentDate.getUTCDate() + daysToAdd)
      }
      currentDate.setUTCHours(0, 0, 0, 0) // Ensure we check against midnight UTC

      // Check if this Friday is booked
      const existingSpeaker = await ScheduledSpeaker.findOne({ scheduledDate: currentDate }).lean() // .lean() for performance if we only need to check existence

      if (!existingSpeaker) {
        availableFridays.push(new Date(currentDate)) // Add a copy of the date
      }

      // Move to the next day to continue the search for the *next* Friday slot
      currentDate.setUTCDate(currentDate.getUTCDate() + 1) 
    }
    return availableFridays
  } catch (error) {
    console.error('Error finding available Fridays:', error)
    return [] // Return empty array on error
  }
}

/**
 * Schedules a speaker for a specific date.
 * @param {object} options - Scheduling options.
 * @param {string} options.discordUserId - The Discord User ID.
 * @param {string} options.discordUsername - The Discord Username.
 * @param {string} options.topic - The speaker's topic.
 * @param {Date} options.scheduledDate - The date to schedule for.
 * @param {string} [options.threadId] - Optional Discord thread ID.
 * @returns {Promise<object|null|string>} - A promise resolving to the saved speaker document, null if date is booked, or throws an error.
 */
async function scheduleSpeaker ({ discordUserId, discordUsername, topic, scheduledDate, threadId }) {
  try {
    // Normalize date to midnight UTC before saving/checking
    const dateToSchedule = new Date(scheduledDate)
    dateToSchedule.setUTCHours(0, 0, 0, 0)

    const speaker = new ScheduledSpeaker({
      discordUserId,
      discordUsername,
      topic,
      scheduledDate: dateToSchedule, // Use normalized date
      threadId // Optional
    })
    const savedSpeaker = await speaker.save()
    return savedSpeaker
  } catch (error) {
    // Check for duplicate key error (code 11000) on scheduledDate
    if (error.code === 11000 && error.keyPattern && error.keyPattern.scheduledDate) {
      console.warn(`Attempted to book an already scheduled date: ${scheduledDate.toISOString().split('T')[0]}`)
      return null // Indicate date is already booked
    }
    console.error('Error scheduling speaker:', error)
    throw error // Re-throw other errors
  }
}

/**
 * Gets the upcoming scheduled speakers.
 * @param {number} [limit=5] - The maximum number of upcoming speakers to retrieve.
 * @returns {Promise<object[]>} - A promise resolving to an array of scheduled speaker documents.
 */
async function getUpcomingSchedule (limit = 5) {
  try {
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0) // Normalize to midnight UTC

    const upcoming = await ScheduledSpeaker.find({
      scheduledDate: { $gte: today }
    })
      .sort({ scheduledDate: 1 }) // Sort by date ascending
      .limit(limit)
      .lean() // Use .lean() if you don't need Mongoose documents features downstream

    return upcoming
  } catch (error) {
    console.error('Error fetching upcoming schedule:', error)
    return [] // Return empty array on error
  }
}

module.exports = {
  findAvailableFridays,
  scheduleSpeaker,
  getUpcomingSchedule
}
```

**Explanation:**

1.  **`findAvailableFridays(count = 3)`:**
    *   Initializes an empty array `availableFridays`.
    *   Gets today's date and normalizes it to midnight UTC (`setUTCHours(0,0,0,0)`). Using UTC helps avoid timezone issues.
    *   Starts searching from the *next* day (`currentDate`).
    *   Enters a `while` loop that continues until the desired `count` of Fridays is found.
    *   Calculates the number of days until the *next* Friday from `currentDate`.
    *   Advances `currentDate` to that next Friday and normalizes it to midnight UTC.
    *   Queries the `ScheduledSpeaker` collection using `findOne({ scheduledDate: currentDate })` to see if a speaker exists for that specific date. `.lean()` is used for a slight performance boost as we don't need a full Mongoose document here.
    *   If `!existingSpeaker` (the date is free), a *copy* of the `currentDate` is added to the `availableFridays` array.
    *   `currentDate` is advanced by one day to ensure the loop searches for the *subsequent* Friday in the next iteration.
    *   Returns the `availableFridays` array. Includes basic error handling.

2.  **`scheduleSpeaker({ discordUserId, discordUsername, topic, scheduledDate, threadId })`:**
    *   Takes speaker details in an options object (good practice for functions with multiple arguments).
    *   Normalizes the incoming `scheduledDate` to midnight UTC to ensure consistency with how dates are checked and stored.
    *   Creates a new `ScheduledSpeaker` instance using the provided details and the normalized date.
    *   Calls `speaker.save()` to persist the data to MongoDB.
    *   Includes a `catch` block specifically to handle MongoDB's duplicate key error (code `11000`) if it occurs on the `scheduledDate` field (due to the `unique: true` index). If this specific error occurs, it logs a warning and returns `null` to signal that the date was already booked.
    *   Other database errors are logged and re-thrown.
    *   Returns the successfully saved speaker document otherwise.

3.  **`getUpcomingSchedule(limit = 5)`:**
    *   Gets today's date and normalizes it to midnight UTC.
    *   Queries the `ScheduledSpeaker` collection using `find({ scheduledDate: { $gte: today } })` to find all speakers scheduled for today or any future date.
    *   Sorts the results by `scheduledDate` in ascending order (`{ scheduledDate: 1 }`).
    *   Limits the number of results to `limit` (defaulting to 5).
    *   Uses `.lean()` as we likely just need the data, not full Mongoose documents.
    *   Returns the array of found speaker documents. Includes basic error handling.

4.  **`module.exports`:**
    *   Exports the three functions so they can be required and used in other parts of the application (like Discord command handlers).

---

**Conclusion:**

You have now created the core logic file `lib/schedulingLogic.js` containing functions to find available dates, schedule speakers, and retrieve the upcoming schedule. These functions encapsulate the database interactions related to scheduling. The next step would typically involve integrating these functions into your Discord bot's commands or API endpoints. 