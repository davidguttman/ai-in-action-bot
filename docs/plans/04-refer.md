# Plan for "Referral Scheduling" Intent

## 1. Introduction

This document outlines the plan to implement a new "Referral Scheduling" feature for the bot. This feature will allow one user (User A, the referrer) to suggest that another user (User B, the target user) be scheduled for a talk. The bot will facilitate this interaction by creating a thread under User A's message and attempting to schedule User B within that thread.

**Example Phrases:**

*   "Hey @BotName, can you schedule @UserB to talk about Advanced JavaScript?" (Bot will ask @UserB for their desired topic.)
*   "@BotName, @UserB would be great to give a talk on Microservices Architecture." (Bot will ask @UserB for their desired topic.)
*   "Could you ask @UserB if they want to present their latest project on AI, @BotName?" (Bot will ask @UserB for their desired topic.)
*   "@BotName, I think @SomeUser should give a talk."

## 2. Intent Definition

*   **Intent Name:** `REFERRAL_SCHEDULE_TALK`
*   **Description:** This intent is triggered when a user (User A) mentions the bot and suggests scheduling another user (User B) for a talk.
*   **Key Elements to Identify:**
    *   **Bot Mention:** The message must mention the bot to activate it.
    *   **Target User (Person B):** The user who is being suggested for a talk. This will typically be a user mention (e.g., `@UserB`).
    *   **Referring User (Person A):** The user making the suggestion (i.e., the author of the message).

## 3. Entity Extraction

The NLU (Natural Language Understanding) component will need to extract the following entities:

*   **`TARGET_USER`**:
    *   Description: The user to be scheduled for the talk.
    *   Example: `@UserB`, `UserB`
    *   Extraction: Primarily from user mentions.
*   **`REFERRING_USER`**:
    *   Description: The user initiating the referral.
    *   Extraction: This will be the author of the message.

## 4. Action Flow and Dialogue Management

The interaction will proceed as follows:

1.  **Trigger:** User A sends a message in a public channel that the NLU identifies as the `REFERRAL_SCHEDULE_TALK` intent, with `TARGET_USER` and `REFERRING_USER` extracted.
    *   Example: User A: "@BotName, please ask @UserB to give a talk."

2.  **Bot Creates Thread and Contacts Target User (User B) to Initiate Scheduling:**
    *   The bot creates a new thread under User A's original message.
    *   The bot's first message in the thread is directed at User B, mentioning that User A made the suggestion, and asks User B for their desired topic.
    *   Bot (in new thread, to @UserB): "Hi @UserB! @UserA suggested you might be interested in giving a talk. If you'd like to proceed, what topic would you like to discuss?"

3.  **User B Responds and Engages in Scheduling Flow (in the created thread):**
    *   **If User B expresses interest and provides a topic** (e.g., "Sure, I can talk about Python"):
        *   The bot transitions to the standard talk scheduling flow (asking for date/time), using the topic provided by User B. This interaction continues within the thread, maintaining consistency with the single-user scheduling experience.
        *   Example: Bot (in thread): "Great! Let's get you scheduled for the talk on 'Python'. What date and time works for you?" (or continues the existing scheduling dialogue).
    *   **If User B declines** (e.g., "no", "not right now", "I can't"):
        *   Bot (in thread, to @UserB): "Okay, @UserB. Thanks for letting me know! Maybe another time."
        *   The thread remains as a record.
    *   **If User B does not respond in the thread:**
        *   The bot will follow the same timeout and follow-up logic as the standard single-user talk scheduling flow. This includes any reminder prompts and the final message upon timeout, adapted for the referral context (e.g., "No response from @UserB regarding the talk suggestion by @UserA. The scheduling attempt has been cancelled."). The interaction will remain within the thread.

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
*   **Entity Training:** Ensure the NLU model is trained to accurately extract `TARGET_USER`. The bot will collect the topic directly from User B.
*   **Model Retraining:** Retrain and evaluate the NLU model.

### 5.2. Bot Logic / Action Handler

*   **Create New Action:** Develop a new action handler function (e.g., `handleReferralScheduleTalk`) corresponding to the `REFERRAL_SCHEDULE_TALK` intent.
*   **Input:** This handler will receive the extracted entities (`TARGET_USER`), the `REFERRING_USER` (message author), the original message object (to create a thread from), and the channel context.
*   **Functionality:**
    1.  Validate `TARGET_USER` (e.g., check if the user exists on the platform). If invalid, inform `REFERRING_USER` by replying to their original message in the main channel.
    2.  Create a new thread under `REFERRING_USER`'s original message.
    3.  Formulate and send the initial contact message to `TARGET_USER` within this new thread, mentioning `REFERRING_USER` and asking for the topic.
    4.  Transition the conversation with `TARGET_USER` into the standard talk scheduling flow (collect topic, then date/time) *within the thread*. This includes using the same dialogue, prompts, and error handling as the single-user flow.
    5.  Handle responses from `TARGET_USER` (acceptance leading to scheduling, declination, no response) within the thread, ensuring behavior (e.g., timeouts, confirmations) is consistent with the standard flow.
    6.  Implement logging for referral requests and outcomes.

### 5.3. Dialogue State Management

*   The bot needs to manage the state of the conversation, particularly:
    *   The context of the referral (who referred whom, in which channel, under which parent message/thread) when initiating the scheduling flow with User B in the thread.
    *   The standard states involved in the existing talk scheduling flow once User B engages in the thread, ensuring consistent behavior.

### 5.4. User Profile/Mention Resolution

*   Ensure the bot can correctly resolve user mentions (e.g., `@UserB`) to actual user IDs or profiles for proper addressing within the thread.

### 5.5. Configuration

*   Potentially add configuration options for:
    *   Messages used when contacting User B in the thread.
    *   Timeout durations for User B's response in the thread (these should default to or be consistent with the single-user flow's timeouts).

## 6. Testing Plan

*   **NLU Testing:**
    *   Test intent classification accuracy for `REFERRAL_SCHEDULE_TALK` against other intents.
    *   Test entity extraction accuracy for `TARGET_USER`.
    *   Include edge cases: messages with multiple user mentions, ambiguous phrasing.
*   **Unit Tests:**
    *   Test the `handleReferralScheduleTalk` action handler with various inputs (valid/invalid `TARGET_USER`).
    *   Test functions for creating threads and formatting messages to User B within the thread.
*   **Integration Tests:**
    *   Test the end-to-end flow in a simulated environment:
        1.  User A refers User B.
        2.  Bot creates a thread under User A's message.
        3.  Bot contacts User B in the thread, mentioning User A, and asks for the topic.
        4.  User B provides topic, accepts/declines the talk in the thread.
        5.  Bot initiates/continues scheduling flow for User B in the thread if accepted (collects date/time), ensuring this part of the interaction mirrors the single-user flow.
        6.  Test timeout behaviors for User B, ensuring they are consistent with the single-user flow.
*   **User Acceptance Testing (UAT):**
    *   Have real users test the feature in a staging environment.
    *   Collect feedback on clarity of interactions within threads, ease of use, consistency with existing scheduling features, and overall experience.

## 7. Error Handling and Edge Cases

*   **Invalid `TARGET_USER`:** If User A mentions a non-existent user.
    *   Bot to User A (as a reply to User A's original message in the main channel): "Sorry @UserA, I couldn't find a user named '@InvalidUser'. Please check the username." (No thread is created).
*   **User B Timeout in Thread:** If User B doesn't respond to the bot's contact or subsequent prompts in the thread within the defined timeout periods (consistent with the single-user scheduling flow).
    *   The bot will post a final message in the thread indicating the timeout and cancellation of the scheduling attempt. This message and behavior should be consistent with how timeouts are handled in the single-user flow (e.g., "It seems @UserB isn't available to give a talk at this time, or the scheduling request has timed out. The suggestion from @UserA has been closed.").
*   **Bot Permissions:** Ensure the bot has necessary permissions to create threads, send messages, and mention users in threads.
*   **Self-Referral:** If User A tries to refer themselves (e.g., "@BotName, ask @UserA to talk about X").
    *   The `TARGET_USER` would be User A. The bot should recognize this.
    *   Bot creates a thread under User A's message.
    *   Bot (in thread, to @UserA): "Hi @UserA! Looks like you want to schedule a talk. What topic would you like to present?" (This then follows the standard self-scheduling flow within the thread, ensuring all behaviors like timeouts, prompts, etc., are consistent).

## 8. Future Enhancements (Optional)

*   **Multiple Target Users:** Allow User A to suggest multiple people in one go.
*   **Reason for Referral:** Allow User A to provide a brief reason why User B would be a good speaker (this could be passed to User B).
*   **Tracking/Dashboard:** A way for admins or User A to see the status of their referrals.
*   **Reminders:** If User B expresses tentative interest but doesn't complete scheduling in the thread, the bot could send a reminder in the thread (consistent with reminder logic in the single-user flow).
