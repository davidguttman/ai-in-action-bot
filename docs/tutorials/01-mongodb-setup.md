# Tutorial: Defining the Scheduled Speaker Model

This tutorial guides you through defining the Mongoose data model (`ScheduledSpeaker`) used to store information about speakers and their scheduled times for the Stream Speaker Scheduling Bot. It assumes a MongoDB connection is managed elsewhere in the application.

**Goal:** Define the data structure for scheduled speakers using a Mongoose model.

**Prerequisites:**

*   Node.js environment setup.
*   `mongoose` package installed (`npm install mongoose`).
*   A shared Mongoose connection established elsewhere in your project.

---

## Step 1: Prepare the Model File

If your project has a placeholder model file (e.g., `widget.js`), you should rename it to represent the speaker data. If not, create a new file.

1.  Locate or create the directory `models`.
2.  If `models/widget.js` exists, rename it to `models/scheduledSpeaker.js`. You can use your file explorer or the command line:
    ```bash
    mv models/widget.js models/scheduledSpeaker.js
    ```
3.  If no suitable file exists, create a new empty file: `models/scheduledSpeaker.js`.

---

## Step 2: Define the Speaker Schema and Model (`models/scheduledSpeaker.js`)

This file defines the structure (schema) of the documents that will be stored in the `scheduledSpeakers` collection in MongoDB and exports the Mongoose model.

1.  Open `models/scheduledSpeaker.js`.
2.  Update its content to the following:

```javascript
// models/scheduledSpeaker.js
const mongoose = require('mongoose') // Require mongoose directly

const scheduledSpeakerSchema = new mongoose.Schema({
  discordUserId: {
    type: String,
    required: true
  },
  discordUsername: {
    type: String,
    required: true
  },
  topic: {
    type: String,
    required: true
  },
  scheduledDate: {
    type: Date,
    required: true,
    unique: true, // Ensure only one speaker per date
    // Optional: Normalize date to midnight UTC to simplify date-only comparisons
    // set: (v) => {
    //   if (v instanceof Date) {
    //     return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
    //   }
    //   return v;
    // }
  },
  bookingTimestamp: {
    type: Date,
    default: Date.now // Automatically set when a document is created
  },
  threadId: {
    type: String // Optional: Store the Discord thread ID for context
  }
})

// Optional: Add index explicitly if not relying solely on `unique: true`
// scheduledSpeakerSchema.index({ scheduledDate: 1 }, { unique: true });

const ScheduledSpeaker = mongoose.model('ScheduledSpeaker', scheduledSpeakerSchema)

module.exports = ScheduledSpeaker
```

*   We require `mongoose` directly at the top.
*   The schema defines fields like `discordUserId`, `discordUsername`, `topic`, and `scheduledDate` as required.
*   `scheduledDate` is marked as `unique` to prevent double booking. A commented-out `set` function shows one way to normalize the date to midnight UTC if needed, though careful querying might suffice.
*   `bookingTimestamp` defaults to the current time.
*   `threadId` is optional.
*   Finally, we create and export the Mongoose model named `ScheduledSpeaker`. Mongoose will automatically use the plural, lowercased version (`scheduledspeakers`) as the collection name when interacting with the database via a pre-existing connection.

---

**Conclusion:**

You have now successfully defined the `ScheduledSpeaker` Mongoose model. This model can be required and used elsewhere in your application to interact with the `scheduledSpeakers` collection in your MongoDB database, assuming the connection is handled separately. 