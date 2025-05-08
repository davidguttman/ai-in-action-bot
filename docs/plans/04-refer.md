# Plan for "Referral Scheduling" Intent

## 1. Introduction

This document outlines the plan to implement a new "Referral Scheduling" feature for the bot. This feature will allow one user (User A, the referrer) to suggest that another user (User B, the target user) be scheduled for a talk. The bot will facilitate this interaction.

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

1.  **Trigger:** User A sends a message that the NLU identifies as the `REFERRAL_SCHEDULE_TALK` intent, with `TARGET_USER` and optionally `TOPIC` extracted.
    *   Example: User A: "@BotName, please ask @UserB if they can talk about Python."

2.  **Bot Acknowledges and Confirms with Referrer (User A):**
    *   The bot confirms the request with User A.
    *   **If topic is present:**
        *   Bot: "Okay @UserA, you'd like me to ask @UserB if they're interested in giving a talk on 'Python'. Is that correct?"
    *   **If no topic is present:**
        *   Bot: "Okay @UserA, you'd like me to ask @UserB if they're interested in giving a talk. Is that correct?"

3.  **User A Responds to Confirmation:**
    *   **If User A confirms** (e.g., "yes", "correct", "yep"):
        *   Proceed to Step 4.
    *   **If User A denies** (e.g., "no", "cancel", "stop"):
        *   Bot: "Alright, I'll cancel that request. Let me know if there's anything else!"
        *   End of flow.
    *   **If User A does not respond or provides an ambiguous answer:**
        *   Bot may timeout or ask for clarification. (To be defined: timeout period, re-prompt strategy).

4.  **Bot Contacts Target User (User B):**
    *   The bot will then contact User B. This could be via a direct message (DM) or a public mention, depending on preferred interaction style and platform capabilities.
    *   **If topic is present:**
        *   Bot (to @UserB): "Hi @UserB! @UserA suggested you might be interested in giving a talk on 'Python'. Would you like to schedule one or discuss this further?"
    *   **If no topic is present:**
        *   Bot (to @UserB): "Hi @UserB! @UserA suggested you might be interested in giving a talk. Would you like to schedule one or discuss this further?"

5.  **User B Responds:**
    *   **If User B expresses interest** (e.g., "yes", "I'm interested", "tell me more"):
        *   The bot transitions to the standard talk scheduling flow, pre-filling the topic if provided.
        *   Bot: "Great! Let's get you scheduled. What date and time works for you for the talk on 'Python'?" (or initiates the existing scheduling dialogue).
    *   **If User B declines** (e.g., "no", "not right now", "I can't"):
        *   Bot: "Okay, @UserB. Thanks for letting me know! Maybe another time."
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
    1.  Validate `TARGET_USER` (e.g., check if the user exists on the platform).
    2.  Formulate and send the confirmation message to `REFERRING_USER`.
    3.  Manage the conversation state while waiting for `REFERRING_USER`'s confirmation.
    4.  If confirmed, formulate and send the initial contact message to `TARGET_USER`.
    5.  Handle responses from `TARGET_USER` to either initiate the scheduling flow or close the interaction.
    6.  Implement logging for referral requests and outcomes.

### 5.3. Dialogue State Management

*   The bot needs to manage the state of the conversation, particularly:
    *   Waiting for confirmation from User A.
    *   Context of the referral (who referred whom, for what topic) when interacting with User B.

### 5.4. User Profile/Mention Resolution

*   Ensure the bot can correctly resolve user mentions (e.g., `@UserB`) to actual user IDs or profiles for direct messaging or proper addressing.

### 5.5. Configuration

*   Potentially add configuration options for:
    *   Confirmation messages.
    *   Notification preferences (DM vs. public mention for User B).
    *   Timeout durations.

## 6. Testing Plan

*   **NLU Testing:**
    *   Test intent classification accuracy for `REFERRAL_SCHEDULE_TALK` against other intents.
    *   Test entity extraction accuracy for `TARGET_USER` and `TOPIC`.
    *   Include edge cases: messages with multiple user mentions, ambiguous phrasing.
*   **Unit Tests:**
    *   Test the `handleReferralScheduleTalk` action handler with various inputs (with/without topic, valid/invalid users).
    *   Test individual functions for message formatting, state management.
*   **Integration Tests:**
    *   Test the end-to-end flow:
        1.  User A refers User B (with and without topic).
        2.  User A confirms/denies the referral.
        3.  Bot contacts User B.
        4.  User B accepts/declines the talk.
        5.  Bot initiates scheduling flow for User B if accepted.
*   **User Acceptance Testing (UAT):**
    *   Have real users test the feature in a staging environment.
    *   Collect feedback on clarity, ease of use, and overall experience.

## 7. Error Handling and Edge Cases

*   **Invalid `TARGET_USER`:** If User A mentions a non-existent user.
    *   Bot to User A: "Sorry @UserA, I couldn't find a user named '@InvalidUser'. Please check the username."
*   **User A Timeout:** If User A doesn't respond to the confirmation.
    *   Bot: "It seems you're busy, @UserA. I'll cancel the referral request for now."
*   **User B Timeout:** If User B doesn't respond to the bot's contact.
    *   (Optional) Bot informs User A: "@UserA, I tried reaching out to @UserB, but haven't heard back yet."
*   **Bot Permissions:** Ensure the bot has necessary permissions to DM users or mention them as required.
*   **Self-Referral:** What if User A tries to refer themselves using this flow? (e.g., "@BotName, ask @UserA to talk about X"). The bot could either redirect to the standard scheduling flow or handle it as a normal referral.

## 8. Future Enhancements (Optional)

*   **Multiple Target Users:** Allow User A to suggest multiple people in one go.
*   **Reason for Referral:** Allow User A to provide a brief reason why User B would be a good speaker.
*   **Tracking/Dashboard:** A way for admins or User A to see the status of their referrals.
*   **Reminders:** If User B expresses tentative interest but doesn't schedule, the bot could send a reminder.
