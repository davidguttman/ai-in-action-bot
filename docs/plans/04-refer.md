# Plan for "Referral Scheduling" Intent

## 1. Introduction

This document outlines the plan to implement a new "Referral Scheduling" feature for the bot. This feature will allow one user (User A, the referrer) to suggest that another user (User B, the target user) be scheduled for a talk. The bot will facilitate this interaction by directly attempting to schedule User B.

**Example Phrases:**

*   "Hey @BotName, can you schedule @UserB to talk about Advanced JavaScript?"
*   "@BotName, @UserB would be great to give a talk on Microservices Architecture."
*   "Could you ask @UserB if they want to present their latest project on AI, @BotName?"
*   "@BotName, I think @SomeUser should give a talk."

## 2. Intent Definition

*   **Intent Name:** `REFERRAL_SCHEDULE_TALK`
*   **Description:** This intent is triggered when a user (User A) mentions the bot and suggests scheduling another user (User B) for a talk.
*   **Key Elements to Identify:**
    *   **Bot Mention:** The message must mention the bot to activate it.
    *   **Target User (Person B):** The user who is being suggested for a talk. This will typically be a user mention (e.g., `@UserB`).
    *   **Referring User (Person A):** The user making the suggestion (i.e., the author of the message).
    *   **Topic (Optional):** The subject of the proposed talk.

## 3. Entity Extraction

The NLU (Natural Language Understanding) component will need to extract the following entities:

*   **`TARGET_USER`**:
    *   Description: The user to be scheduled for the talk.
    *   Example: `@UserB`, `UserB`
    *   Extraction: Primarily from user mentions.
*   **`TOPIC`**:
    *   Description: The proposed topic for the talk. This entity is optional.
    *   Example: "Advanced JavaScript", "Microservices Architecture", "AI"
    *   Extraction: From the text surrounding the user mentions and keywords related to talks/topics.
*   **`REFERRING_USER`**:
    *   Description: The user initiating the referral.
    *   Extraction: This will be the author of the message.

## 4. Action Flow and Dialogue Management

The interaction will proceed as follows:

1.  **Trigger:** User A sends a message that the NLU identifies as the `REFERRAL_SCHEDULE_TALK` intent, with `TARGET_USER`, `REFERRING_USER`, and optionally `TOPIC` extracted.
    *   Example: User A: "@BotName, please ask @UserB if they can talk about Python."

2.  **Bot Contacts Target User (User B) to Initiate Scheduling:**
    *   The bot directly contacts User B. This could be via a direct message (DM) or a public mention, depending on preferred interaction style and platform capabilities.
    *   The message to User B will indicate that User A made the suggestion.
    *   **If topic is present:**
        *   Bot (to @UserB): "Hi @UserB! @UserA suggested you might be interested in giving a talk on 'Python'. Would you like to schedule one? If so, we can start by finding a suitable date and time." (This would then transition into the standard scheduling flow, potentially asking for date/time next).
    *   **If no topic is present:**
        *   Bot (to @UserB): "Hi @UserB! @UserA suggested you might be interested in giving a talk. Would you like to schedule one? If so, what topic would you like to discuss?" (This would then transition into the standard scheduling flow, which would ask for topic, then date/time).

3.  **User B Responds and Engages in Scheduling Flow:**
    *   **If User B expresses interest** (e.g., "yes", "I'm interested", provides topic/date details):
        *   The bot transitions to the standard talk scheduling flow, pre-filling the topic if provided by User A or collected in the previous step.
        *   Example (if topic was 'Python'): Bot: "Great! Let's get you scheduled for the talk on 'Python'. What date and time works for you?" (or continues the existing scheduling dialogue).
    *   **If User B declines** (e.g., "no", "not right now", "I can't"):
        *   Bot (to @UserB): "Okay, @UserB. Thanks for letting me know! Maybe another time."
        *   (Optional) Bot informs User A: "@UserA, just a heads up, @UserB isn't available to give a talk at the moment."
    *   **If User B does not respond:**
        *   (To be defined: follow-up strategy, notification to User A after a timeout).

## 5. Implementation Steps

### 5.1. NLU (Natural Language Understanding) Updates

*   **Add New Intent:** Define `REFERRAL_SCHEDULE_TALK` in the NLU system.
*   **Training Data:** Add diverse example utterances for this intent:
    *   "@BotName, can @UserB talk about Docker?"
    *   "Hey @BotName, please schedule @OtherUser for a session on Kubernetes."
    *   "@BotName, I think @SpeakerPerson would be a good fit to discuss Python."
    *   "cc @BotName, @UserToSchedule should present their project."
    *   "@BotName, @UserB for a talk on AI please."
    *   "Maybe @UserC could talk about databases, @BotName?"
    *   "@BotName, ask @UserD to present."
*   **Entity Training:** Ensure the NLU model is trained to accurately extract `TARGET_USER` (especially from platform-specific mentions) and `TOPIC`.
*   **Model Retraining:** Retrain and evaluate the NLU model.

### 5.2. Bot Logic / Action Handler

*   **Create New Action:** Develop a new action handler function (e.g., `handleReferralScheduleTalk`) corresponding to the `REFERRAL_SCHEDULE_TALK` intent.
*   **Input:** This handler will receive the extracted entities (`TARGET_USER`, `TOPIC`) and the `REFERRING_USER` (message author).
*   **Functionality:**
    1.  Validate `TARGET_USER` (e.g., check if the user exists on the platform). If invalid, inform `REFERRING_USER`.
    2.  Formulate and send the initial contact message to `TARGET_USER`, mentioning `REFERRING_USER` and the (optional) `TOPIC`.
    3.  Transition the conversation with `TARGET_USER` into the standard talk scheduling flow.
    4.  Handle responses from `TARGET_USER` (acceptance leading to scheduling, declination, no response).
    5.  Implement logging for referral requests and outcomes.

### 5.3. Dialogue State Management

*   The bot needs to manage the state of the conversation, particularly:
    *   The context of the referral (who referred whom, for what topic) when initiating the scheduling flow with User B.
    *   The standard states involved in the existing talk scheduling flow once User B engages.

### 5.4. User Profile/Mention Resolution

*   Ensure the bot can correctly resolve user mentions (e.g., `@UserB`) to actual user IDs or profiles for direct messaging or proper addressing.

### 5.5. Configuration

*   Potentially add configuration options for:
    *   Messages used when contacting User B.
    *   Notification preferences (DM vs. public mention for User B).
    *   Timeout durations for User B's response.
    *   Whether to notify User A if User B declines or doesn't respond.

## 6. Testing Plan

*   **NLU Testing:**
    *   Test intent classification accuracy for `REFERRAL_SCHEDULE_TALK` against other intents.
    *   Test entity extraction accuracy for `TARGET_USER` and `TOPIC`.
    *   Include edge cases: messages with multiple user mentions, ambiguous phrasing.
*   **Unit Tests:**
    *   Test the `handleReferralScheduleTalk` action handler with various inputs (with/without topic, valid/invalid `TARGET_USER`).
    *   Test individual functions for message formatting to User B.
*   **Integration Tests:**
    *   Test the end-to-end flow:
        1.  User A refers User B (with and without topic).
        2.  Bot contacts User B, mentioning User A.
        3.  User B accepts/declines the talk.
        4.  Bot initiates/continues scheduling flow for User B if accepted.
        5.  (If configured) Bot informs User A of User B's declination/timeout.
*   **User Acceptance Testing (UAT):**
    *   Have real users test the feature in a staging environment.
    *   Collect feedback on clarity, ease of use, and overall experience.

## 7. Error Handling and Edge Cases

*   **Invalid `TARGET_USER`:** If User A mentions a non-existent user.
    *   Bot to User A: "Sorry @UserA, I couldn't find a user named '@InvalidUser'. Please check the username."
*   **User B Timeout:** If User B doesn't respond to the bot's contact to initiate scheduling.
    *   (Optional, if configured) Bot informs User A: "@UserA, I tried reaching out to @UserB about the talk suggestion, but haven't heard back yet."
*   **Bot Permissions:** Ensure the bot has necessary permissions to DM users or mention them as required.
*   **Self-Referral:** If User A tries to refer themselves (e.g., "@BotName, ask @UserA to talk about X").
    *   The `TARGET_USER` would be User A. The bot should recognize this and can directly initiate the standard self-scheduling flow with User A. The message might be slightly adapted: "Okay @UserA, you'd like to schedule a talk for yourself on X. Let's proceed..." or simply transition to the standard self-schedule flow.

## 8. Future Enhancements (Optional)

*   **Multiple Target Users:** Allow User A to suggest multiple people in one go.
*   **Reason for Referral:** Allow User A to provide a brief reason why User B would be a good speaker (this could be passed to User B).
*   **Tracking/Dashboard:** A way for admins or User A to see the status of their referrals.
*   **Reminders:** If User B expresses tentative interest but doesn't schedule, the bot could send a reminder.
