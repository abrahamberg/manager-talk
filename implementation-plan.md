# Implementation Plan: Communication Coach Application

This plan turns `defenetion.md` into an end-to-end implementation guide for a TypeScript application. It is written so a lower-capability model can follow it step by step without needing to infer architecture or behavior.

## 1. Goal

Build a TypeScript-based communication coach application that:

1. Reads stable coaching instructions and course material.
2. Reads the user's current state from `state.md`.
3. Reads the current level input file, for example `inputs-level1.md`.
4. Asks the user one question at a time.
5. Shows the answer format the user should follow before they answer.
6. Receives the user's answer.
7. Gives concise feedback.
8. Updates `state.md` after every evaluated answer.
9. Tracks how many good answers the user gave in a row.
10. Moves the user to the next level after 5 good answers in a row.
11. Never asks the same question again unless the user gave a bad answer and the coach intentionally repeats it.
12. Supports user follow-up questions after feedback until the user types `next`.
13. Uses answer evaluation as the main LLM call: evaluate feedback, rewrite compact state, and choose the next question in one response.
14. Orders prompt messages to maximize OpenAI input caching: static content first, current level content second last, current state last.

## 2. Existing Files

The implementation must use these existing files in `/Users/daniel.abrahamberg/Abrahamberg/Training`:

1. `defenetion.md`: Original product definition.
2. `cource-echema.md`: Full communication skill ladder and pass criteria.
3. `inputs-level1.md` through `inputs-level11.md`: Question banks and level-specific coach instructions.
4. `state.md`: Persistent user progress.
5. `architecture.md`: Currently minimal; can be expanded later if desired.

Important note: `cource-echema.md` includes Level 12, but the current project only has `inputs-level1.md` through `inputs-level11.md`. Implement levels 1-11 unless an `inputs-level12.md` file is added later.

## 3. Recommended Tech Stack

Use a small backend-heavy TypeScript app.

Recommended stack:

1. Node.js 20 or newer.
2. TypeScript.
3. Express or Fastify for backend API.
4. OpenAI official Node SDK.
5. `zod` for runtime validation of model outputs and API payloads.
6. Existing chat interface for frontend if one exists in the target repo.
7. If no frontend exists, build a minimal chat page with plain React/Vite or simple server-rendered HTML.

Avoid overengineering. This app needs strong state handling and prompt construction more than complex UI.

## 4. Core Product Flow

The app runs a repeated training cycle.

### 4.1 Start Or Resume Session

When the user opens the app:

1. Backend reads `state.md`.
2. Backend extracts current level from `state.md`.
3. Backend reads the matching level file, for example `inputs-level3.md`.
4. Backend builds a `QuestionSelection` LLM prompt.
5. Backend asks the LLM to choose the next question.
6. Backend returns the question plus the answer format summary to the frontend.
7. Frontend shows only the current question and required answer format.
8. Frontend clears any previous question/answer UI when a new question is asked.

### 4.2 User Answers

When the user submits an answer:

1. Frontend sends `questionId`, `questionText`, `level`, and `answerText` to the backend.
2. Backend reads `state.md` again to avoid stale state.
3. Backend reads `cource-echema.md` and the matching `inputs-levelX.md`.
4. Backend builds a `FeedbackEvaluation` LLM prompt.
5. Backend asks the LLM to evaluate the answer.
6. LLM returns structured JSON with pass/fail, concise feedback, corrected answer if needed, and state update suggestions.
7. Backend validates the JSON with `zod`.
8. Backend updates `state.md`.
9. Backend returns feedback and updated progress to frontend.
10. Frontend displays feedback concisely.
11. Frontend allows follow-up questions.
12. Frontend also shows a `Next` button or lets user type `next`.

### 4.3 Follow-Up Question Mode

After feedback, the user may ask questions such as:

1. `Why was my answer not good?`
2. `Can you give me an example?`
3. `How can I say it better?`

During this mode:

1. Send the whole current round context to the LLM: selected question, required format, user answer, feedback, current level content, course schema, and state.
2. Answer the user's follow-up questions concisely.
3. Do not update `state.md` during follow-up mode unless the user submits a new evaluated answer.
4. Continue follow-up mode until the user types exactly `next` or clicks `Next`.
5. When user types `next`, clear the round context on the frontend and start a fresh question-selection flow.

## 5. State Model

Keep `state.md` human-readable, structured, and compact. Rewrite it after each evaluated answer instead of appending long transcripts.

Use this exact format:

```md
User Current Level: 1
# Communication Coach State

Current State Summary:
The user is starting Level 1. No evaluated answers yet.

Consecutive Good Answers: 0

Current Question:
- ID: none
- Text: none
- Asked At: none
- Repeat Intentional: false

Questions Asked Already:
- none

Recent Evaluations:
- none
```

Current implementation note: prefer compact asked-question rows and omit `Recent Evaluations` from newly written state. Store only useful progress context, current focus, improvement strategy, next-question reason, current question, and short asked-question summaries.

Each question record should use this format:

```md
- ID: level1-daily-work-001
  Level: 1
  Question: How do you handle many tasks?
  Evaluation: good
  Summary: Clear action and clear result.
  Asked At: 2026-06-17T10:30:00.000Z
```

Use these evaluation values only:

1. `good`
2. `needs_improvement`
3. `repeated_for_practice`

### 5.1 State Update Rules

When answer is good:

1. Increase `Consecutive Good Answers` by 1.
2. Add the question to `Questions Asked Already` if not already present.
3. Add a concise evaluation summary.
4. If `Consecutive Good Answers` becomes 5, move to next level.
5. When moving to next level, reset `Consecutive Good Answers` to 0.
6. When moving to next level, set `Current Question` to `none` until a new question is selected.

When answer needs improvement:

1. Reset `Consecutive Good Answers` to 0.
2. Add the question to `Questions Asked Already` with `needs_improvement`.
3. Decide whether to repeat the same question or ask a similar easier question.
4. If repeating, set `Repeat Intentional: true` in `Current Question`.
5. Update `Current State Summary` with one short note about what the user needs to improve.

When user reaches Level 11 and gets 5 good answers:

1. Mark the course as completed in `Current State Summary`.
2. Keep `User Current Level: 11` unless Level 12 input file exists.
3. Return a completion message.

## 6. Prompt Caching Order

OpenAI prompt/input caching works best when unchanged content is at the beginning of the prompt and changing content is at the end.

For every LLM request, order messages/content like this:

1. Static system instruction.
2. Static product rules from `defenetion.md`.
3. Optimized course schema from `cource-echema-optimized.md`.
4. Current level file, for example `inputs-level4.md`.
5. Current dynamic state from `state.md`.
6. Current user-specific data for this request, such as answer text or follow-up question.

The user specifically asked that state comes last and the current level input comes second last. To satisfy both that request and the need for request-specific input, use this structure:

1. Put stable files in the main prompt in cache-friendly order.
2. Put `inputs-levelX.md` immediately before the state block.
3. Put compact `state.md` as the last file-content block.
4. Put the user's immediate answer or follow-up question after the state as a short final user message.

Do not inject full `defenetion.md` or full `cource-echema.md` into normal LLM calls. Their stable product rules should be summarized in the system prompt and the compact ladder should come from `cource-echema-optimized.md`.

Do not place `state.md` before stable files.

Do not place current answer text before `cource-echema.md` or `inputs-levelX.md`.

## 7. LLM Call 1: Choose Next Question

Purpose: Decide what question to ask next.

Input:

1. Static system instruction.
2. `defenetion.md`.
3. `cource-echema.md`.
4. `inputs-levelX.md` for current level.
5. `state.md`.

Output must be strict JSON:

```json
{
  "level": 1,
  "questionId": "level1-daily-work-001",
  "questionText": "How do you handle many tasks?",
  "answerFormatSummary": "Answer in two sentences only. First sentence: what you did. Second sentence: what happened as a result.",
  "expectedPattern": "I [action]. As a result, [result].",
  "reasonForSelection": "This is an easy Level 1 daily work question and has not been asked before.",
  "isIntentionalRepeat": false
}
```

Validation rules:

1. `level` must match current state level.
2. `questionText` must come from the current `inputs-levelX.md` file unless intentionally repeating a failed question from state.
3. `questionId` must be deterministic.
4. `answerFormatSummary` must be concise.
5. `isIntentionalRepeat` must be true only if the question was previously answered poorly and the model explains why repeating is useful.

Question ID convention:

1. Lowercase.
2. Prefix with level: `level1`, `level2`, etc.
3. Include category slug if available: `daily-work`, `team-communication`, etc.
4. End with three-digit index.
5. Example: `level1-daily-work-001`.

If the model chooses a question without an ID, generate the ID in backend code from level, category, and index.

## 8. LLM Call 2: Evaluate Answer And Give Feedback

Purpose: Evaluate the answer, give concise feedback, and update progress.

Input:

1. Static system instruction.
2. `defenetion.md`.
3. `cource-echema.md`.
4. `inputs-levelX.md` for current level.
5. `state.md`.
6. Current question.
7. User answer.

Output must be strict JSON:

```json
{
  "level": 1,
  "questionId": "level1-daily-work-001",
  "questionText": "How do you handle many tasks?",
  "isGoodAnswer": true,
  "score": 4,
  "feedbackToUser": "Good answer. You gave one clear action and one clear result. Keep it this short.",
  "missingElements": [],
  "improvedAnswer": "I prioritize the most important tasks first. As a result, I stay focused and finish the most valuable work.",
  "stateSummaryUpdate": "The user answered clearly with action plus result.",
  "shouldRepeatQuestion": false,
  "nextLevelRecommended": false
}
```

Rules for feedback:

1. Feedback must be concise and to the point.
2. Do not give long lectures.
3. Mention only the most important improvement.
4. If answer is good, say why in one short sentence.
5. If answer is bad, explain the issue and provide a corrected version.
6. Always adapt the feedback to the actual user answer.
7. Do not praise vague or rambling answers as good.
8. Do not move levels based on one answer. Movement depends on 5 good answers in a row.

Score rules:

1. `1`: Does not follow level format at all.
2. `2`: Has some useful content but missing major required element.
3. `3`: Almost follows format but needs cleanup.
4. `4`: Good answer for current level.
5. `5`: Excellent answer for current level.

Treat score `4` or `5` as `isGoodAnswer: true`.

Treat score `1`, `2`, or `3` as `isGoodAnswer: false`.

## 9. API Design

Implement these backend endpoints.

### 9.1 `GET /api/session`

Purpose: Load state and return current progress.

Response:

```json
{
  "currentLevel": 1,
  "consecutiveGoodAnswers": 0,
  "currentStateSummary": "The user is starting Level 1. No evaluated answers yet.",
  "currentQuestion": null
}
```

### 9.2 `POST /api/question/next`

Purpose: Select next question.

Request:

```json
{
  "forceNew": false
}
```

Response:

```json
{
  "level": 1,
  "questionId": "level1-daily-work-001",
  "questionText": "How do you handle many tasks?",
  "answerFormatSummary": "Answer in two sentences only. First sentence: what you did. Second sentence: what happened as a result.",
  "expectedPattern": "I [action]. As a result, [result]."
}
```

Behavior:

1. If there is already a current unanswered question in `state.md` and `forceNew` is false, return it.
2. If `forceNew` is true, select a new eligible question unless the current question is intentionally repeated.
3. After selecting a question, update `Current Question` in `state.md`.

### 9.3 `POST /api/answer`

Purpose: Evaluate user's answer.

Request:

```json
{
  "level": 1,
  "questionId": "level1-daily-work-001",
  "questionText": "How do you handle many tasks?",
  "answerText": "I prioritize the most important tasks first. As a result, I finish the important work."
}
```

Response:

```json
{
  "isGoodAnswer": true,
  "score": 4,
  "feedbackToUser": "Good answer. You gave one clear action and one clear result.",
  "improvedAnswer": "I prioritize the most important tasks first. As a result, I finish the most important work.",
  "currentLevel": 1,
  "consecutiveGoodAnswers": 1,
  "movedToNextLevel": false
}
```

Behavior:

1. Validate the submitted question matches `Current Question` in state.
2. If it does not match, return HTTP 409 with a message to refresh the question.
3. Run LLM evaluation.
4. Update state.
5. Return concise feedback.

### 9.4 `POST /api/follow-up`

Purpose: Answer user's follow-up questions after feedback.

Request:

```json
{
  "roundContext": {
    "level": 1,
    "questionText": "How do you handle many tasks?",
    "answerText": "I prioritize tasks.",
    "feedbackToUser": "You need to add the result."
  },
  "message": "Why is the result important?"
}
```

Response:

```json
{
  "answer": "The result shows what changed because of your action. Without it, the listener only hears what you did, not why it mattered."
}
```

Behavior:

1. If message is exactly `next`, do not call the LLM.
2. Return `{ "next": true }` so frontend starts a new question.
3. Otherwise call the LLM with full current round context.
4. Do not update `state.md`.

## 10. Backend File Structure

Use this structure if starting from an empty TypeScript backend:

```text
src/
  server.ts
  config.ts
  routes/
    sessionRoutes.ts
    questionRoutes.ts
    answerRoutes.ts
    followUpRoutes.ts
  services/
    coachService.ts
    llmService.ts
    promptBuilder.ts
    stateService.ts
    courseFileService.ts
  schemas/
    llmSchemas.ts
    apiSchemas.ts
  types/
    coach.ts
```

Responsibilities:

1. `server.ts`: Create app, add JSON middleware, register routes, start server.
2. `config.ts`: Read `OPENAI_API_KEY`, model name, port, and training directory path.
3. `stateService.ts`: Read, parse, validate, and write `state.md`.
4. `courseFileService.ts`: Read `defenetion.md`, `cource-echema.md`, and `inputs-levelX.md`.
5. `promptBuilder.ts`: Build messages in cache-friendly order.
6. `llmService.ts`: Call OpenAI and validate JSON responses.
7. `coachService.ts`: Orchestrate question selection, answer evaluation, state updates, and follow-up handling.
8. `llmSchemas.ts`: Zod schemas for LLM JSON outputs.
9. `apiSchemas.ts`: Zod schemas for request bodies.
10. `coach.ts`: Shared TypeScript types.

Code structure guardrails:

1. Keep route handlers thin. They should validate input, call a service, and return JSON.
2. Keep business decisions in `coachService.ts`, not in routes or UI code.
3. Keep all state parsing and writing inside `stateService.ts`.
4. Keep all prompt ordering inside `promptBuilder.ts`.
5. Search existing services/helpers before adding new code. Reuse current code whenever it fits.
6. Prefer short, self-describing functions over long functions with comments.
7. Make orchestration read like intent, for example `if (isDuplicateQuestion(selection, state)) { selection = await chooseFallbackQuestion(); }`.
8. Split functions by decision or side effect: read state, build prompt, call LLM, validate output, update state.
9. Avoid generic names like `handleData`, `processStuff`, or `doLogic`.
10. Add comments only where the reason is not obvious, such as prompt caching order or atomic file writes.

## 11. Environment Variables

Required:

```text
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=gpt-4.1-mini
OPENAI_SERVICE_TIER=flex
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=marin
PORT=3000
TRAINING_DIR=/Users/daniel.abrahamberg/Abrahamberg/Training
```

Do not hardcode API keys.

If `TRAINING_DIR` is missing, default to `/Users/daniel.abrahamberg/Abrahamberg/Training` for local development.

## 12. Detailed Implementation Steps

Follow these steps in order.

### Step 1: Initialize TypeScript Project

If no app exists yet:

1. Create `package.json`.
2. Install dependencies: `typescript`, `tsx`, `express`, `openai`, `zod`, `dotenv`, and TypeScript types.
3. Create `tsconfig.json`.
4. Add scripts:

```json
{
  "scripts": {
    "dev": "tsx src/server.ts",
    "build": "tsc --noEmit",
    "start": "node dist/server.js"
  }
}
```

If an app already exists, adapt the plan to the existing structure and do not duplicate app setup.

### Step 2: Implement Config

Create `src/config.ts`:

1. Load `.env` using `dotenv/config`.
2. Export `openAiApiKey`.
3. Export `openAiModel`, default `gpt-4.1-mini`.
4. Export `port`, default `3000`.
5. Export `trainingDir`, default `/Users/daniel.abrahamberg/Abrahamberg/Training`.
6. Throw a clear error if `OPENAI_API_KEY` is missing when an LLM call is attempted.

### Step 3: Define Types

Create `src/types/coach.ts` with these types:

```ts
export type EvaluationValue = 'good' | 'needs_improvement' | 'repeated_for_practice';

export interface CurrentQuestion {
  id: string;
  text: string;
  askedAt: string;
  repeatIntentional: boolean;
}

export interface AskedQuestion {
  id: string;
  level: number;
  question: string;
  evaluation: EvaluationValue;
  summary: string;
  askedAt: string;
}

export interface CoachState {
  currentLevel: number;
  currentStateSummary: string;
  consecutiveGoodAnswers: number;
  currentQuestion: CurrentQuestion | null;
  questionsAskedAlready: AskedQuestion[];
  recentEvaluations: string[];
}
```

### Step 4: Implement Course File Service

Create `src/services/courseFileService.ts`:

Functions:

1. `readDefinition(): Promise<string>` reads `defenetion.md`.
2. `readCourseSchema(): Promise<string>` reads `cource-echema.md`.
3. `readLevelInputs(level: number): Promise<string>` reads `inputs-level${level}.md`.
4. `readStaticCoachFiles(level: number)` returns all three contents.

Validation:

1. If level file does not exist, throw `No input file found for level X`.
2. If level is below 1 or above 11, throw `Unsupported level X` unless a matching input file exists.

### Step 5: Implement State Service

Create `src/services/stateService.ts`.

Functions:

1. `readStateMarkdown(): Promise<string>`.
2. `parseState(markdown: string): CoachState`.
3. `serializeState(state: CoachState): string`.
4. `readState(): Promise<CoachState>`.
5. `writeState(state: CoachState): Promise<void>`.
6. `ensureStateFile(): Promise<void>` creates structured state if file is missing or unusable.

Parsing requirements:

1. Support the existing old `state.md` format temporarily.
2. Extract `User Current Level`.
3. Extract `Signals To mobe on` as `consecutiveGoodAnswers` if structured `Consecutive Good Answers` is not present.
4. If fields are missing, use safe defaults.
5. After the first write, always write the new structured format.

Important:

1. Do not corrupt `state.md` if parsing fails.
2. If parsing fails, save a backup as `state.md.bak.TIMESTAMP` before rewriting.
3. Writes should be atomic: write to `state.md.tmp`, then rename to `state.md`.

### Step 6: Define Zod Schemas

Create `src/schemas/llmSchemas.ts`.

Question selection schema:

```ts
export const QuestionSelectionSchema = z.object({
  level: z.number().int().min(1),
  questionId: z.string().min(1),
  questionText: z.string().min(1),
  answerFormatSummary: z.string().min(1),
  expectedPattern: z.string().min(1),
  reasonForSelection: z.string().min(1),
  isIntentionalRepeat: z.boolean()
});
```

Feedback schema:

```ts
export const FeedbackEvaluationSchema = z.object({
  level: z.number().int().min(1),
  questionId: z.string().min(1),
  questionText: z.string().min(1),
  isGoodAnswer: z.boolean(),
  score: z.number().int().min(1).max(5),
  feedbackToUser: z.string().min(1),
  missingElements: z.array(z.string()),
  improvedAnswer: z.string().min(1),
  stateSummaryUpdate: z.string().min(1),
  shouldRepeatQuestion: z.boolean(),
  nextLevelRecommended: z.boolean()
});
```

Add API request schemas in `src/schemas/apiSchemas.ts` for all endpoint bodies.

### Step 7: Implement Prompt Builder

Create `src/services/promptBuilder.ts`.

Implement these functions:

1. `buildQuestionSelectionMessages(args)`.
2. `buildFeedbackMessages(args)`.
3. `buildFollowUpMessages(args)`.

Each function must preserve the caching order.

Question selection message order:

```text
system: You are a communication coach... Return strict JSON only.
user: Static product definition from defenetion.md
user: Static course schema from cource-echema.md
user: Current level input file inputs-levelX.md
user: Current state.md
```

Feedback message order:

```text
system: You are a communication coach... Return strict JSON only.
user: Static product definition from defenetion.md
user: Static course schema from cource-echema.md
user: Current level input file inputs-levelX.md
user: Current state.md
user: Current question and user answer
```

Follow-up message order:

```text
system: You are answering follow-up questions as a communication coach.
user: Static product definition from defenetion.md
user: Static course schema from cource-echema.md
user: Current level input file inputs-levelX.md
user: Current state.md
user: Current round context and user's follow-up question
```

System instruction for concise coaching:

```text
You are a communication coach. Help the user improve communication skills level by level. Be concise, direct, and practical. Do not give long feedback. Follow the current level criteria exactly. Return only valid JSON when JSON is requested.
```

### Step 8: Implement LLM Service

Create `src/services/llmService.ts`.

Functions:

1. `selectQuestion(messages): Promise<QuestionSelection>`.
2. `evaluateAnswer(messages): Promise<FeedbackEvaluation>`.
3. `answerFollowUp(messages): Promise<string>`.

Implementation rules:

1. Use OpenAI SDK.
2. Request JSON output for question selection and feedback.
3. Parse and validate JSON with Zod.
4. If JSON parsing fails once, retry one time with a repair instruction.
5. If it fails twice, return a safe error to frontend.
6. Do not expose raw stack traces to frontend.

Recommended OpenAI call pattern:

1. Use the Responses API if available in the app's OpenAI SDK version.
2. Otherwise use Chat Completions.
3. Set temperature low, for example `0.2`, for evaluation consistency.
4. Use a model from `OPENAI_MODEL`.
5. Use `OPENAI_SERVICE_TIER`, defaulting to `flex` when supported by the SDK/model.

### Step 9: Implement Coach Service

Create `src/services/coachService.ts`.

Functions:

1. `getSession()`.
2. `getNextQuestion(forceNew: boolean)`.
3. `submitAnswer(input)`.
4. `submitFollowUp(input)`.

`getNextQuestion` algorithm:

1. Read state.
2. If `state.currentQuestion` exists and `forceNew` is false, return it with answer format for current level.
3. Read `defenetion.md`, `cource-echema.md`, and current `inputs-levelX.md`.
4. Build question selection prompt.
5. Call LLM.
6. Validate selected question is not in `questionsAskedAlready` unless `isIntentionalRepeat` is true.
7. If invalid duplicate, call LLM one more time with explicit duplicate warning.
8. Update `state.currentQuestion`.
9. Write state.
10. Return question response.

`submitAnswer` algorithm:

1. Read state.
2. Validate current question exists.
3. Validate submitted `questionId` equals `state.currentQuestion.id`.
4. Validate submitted level equals `state.currentLevel`.
5. Read required files.
6. Build feedback prompt.
7. Call LLM.
8. Force consistency: if score >= 4 then `isGoodAnswer = true`; if score <= 3 then `isGoodAnswer = false`.
9. Create asked question record.
10. If answer is good, increment consecutive good answers.
11. If answer is not good, reset consecutive good answers to 0.
12. If answer is good and new consecutive count is 5, move to next level if next input file exists.
13. If moving level, reset consecutive good answers to 0.
14. If not good and `shouldRepeatQuestion` is true, keep current question and set repeat intentional.
15. Otherwise clear current question.
16. Update state summary and recent evaluations.
17. Write state atomically.
18. Return feedback response.

Level movement algorithm:

1. Let `nextLevel = currentLevel + 1`.
2. Check whether `inputs-level${nextLevel}.md` exists.
3. If yes, set current level to `nextLevel` and return `movedToNextLevel: true`.
4. If no, keep current level and set summary to course completed.

### Step 10: Implement Routes

Create route files and keep route handlers thin.

Rules:

1. Parse request body with Zod.
2. Call `coachService`.
3. Return JSON.
4. Use HTTP 400 for invalid input.
5. Use HTTP 409 for stale question mismatch.
6. Use HTTP 500 for unexpected backend errors.
7. Log server errors privately.

### Step 11: Implement Frontend Behavior

If an existing chat interface exists, reuse it.

Required frontend behavior:

1. On load, call `GET /api/session`.
2. Then call `POST /api/question/next` if no current question is displayed.
3. Display current level and progress, for example `Level 1 | Good answers in a row: 2/5`.
4. Display answer format summary before the input field.
5. Display only the current active question.
6. Clear old chat messages when a new question is asked.
7. User enters answer and submits.
8. Disable submit while waiting.
9. Show concise feedback returned by backend.
10. Show improved answer if backend returns one.
11. After feedback, switch input placeholder to follow-up mode, for example `Ask a question, or type next`.
12. If user types `next`, clear UI and request next question.
13. If user asks a follow-up question, call `POST /api/follow-up` and append the coach answer.
14. Do not evaluate follow-up messages as training answers.

Stateful frontend variables:

1. `currentLevel`.
2. `consecutiveGoodAnswers`.
3. `currentQuestion`.
4. `answerFormatSummary`.
5. `roundContext`.
6. `mode`: `answering` or `follow_up`.
7. `messages` for current round only.

Important cleanup rule:

When requesting a new question:

1. Clear `messages`.
2. Clear previous answer text.
3. Clear previous feedback.
4. Clear `roundContext`.
5. Set mode to `answering`.

## 13. Duplicate Question Prevention

Backend must enforce this even if the LLM makes a mistake.

Rules:

1. Parse `Questions Asked Already` from state.
2. Build a set of asked question IDs and normalized question texts.
3. When LLM chooses a question, normalize its text by lowercasing and collapsing spaces.
4. Reject if ID or normalized text already exists.
5. Allow duplicate only if `isIntentionalRepeat` is true and previous evaluation was `needs_improvement`.
6. If rejected, retry question selection once.
7. If still duplicate, choose first unasked question from the level file by deterministic fallback.

Deterministic fallback:

1. Parse numbered questions from `inputs-levelX.md`.
2. Generate IDs using level, category slug, and index.
3. Return the first question not in state.
4. Use the level's coach instruction as answer format summary.

## 14. State Summary Quality

The state summary must stay short and useful.

Good examples:

1. `The user can state an action clearly but often forgets the result.`
2. `The user answered three Level 1 questions clearly in action-result format.`
3. `The user is ready for Level 2 and should practice starting with the main point.`

Bad examples:

1. Long paragraphs.
2. Full transcript of answers.
3. Generic praise like `User is doing great`.
4. Private reasoning from the LLM.

## 15. Feedback Style

All user-facing feedback must be short.

Recommended format for good answers:

```text
Good answer. You gave a clear action and result. Keep it this concise.
```

Recommended format for weak answers:

```text
Almost. Your action is clear, but the result is missing. Say what changed because of your action.

Try this: I prioritized the most important tasks first. As a result, I finished the highest-value work on time.
```

Do not output long analysis unless the user asks a follow-up question.

## 16. Error Handling

Handle these errors clearly:

1. Missing `OPENAI_API_KEY`: return setup error.
2. Missing `inputs-levelX.md`: return unsupported level error.
3. Stale submitted question: return 409 and tell frontend to refresh.
4. LLM JSON invalid twice: return a friendly retry message.
5. `state.md` parse failure: backup old file and initialize structured state.
6. File write failure: return 500 and do not pretend state was updated.

## 17. Testing Plan

Add automated tests if the project has a test framework. If not, manually verify these cases.

### 17.1 Unit Tests

Test `stateService`:

1. Parses current old `state.md` format.
2. Serializes structured state.
3. Preserves current level.
4. Reads `Signals To mobe on` as consecutive good answers.
5. Writes atomic state output.

Test duplicate prevention:

1. Rejects same question ID.
2. Rejects same normalized question text.
3. Allows intentional repeat only after needs improvement.
4. Fallback picks first unasked question.

Test level progression:

1. Good answer increments consecutive count.
2. Bad answer resets count.
3. Fifth good answer moves to next level.
4. Level movement resets consecutive count.
5. Final level completion does not crash.

### 17.2 Integration Tests

Mock the LLM service and verify:

1. `POST /api/question/next` returns a question.
2. `POST /api/answer` updates state.
3. `POST /api/follow-up` does not update state.
4. Stale answer returns HTTP 409.
5. Duplicate LLM question triggers retry or fallback.

### 17.3 Manual End-To-End Test

Run the app and test:

1. Open frontend.
2. Confirm Level 1 question appears.
3. Confirm answer format appears before the input.
4. Submit a good Level 1 answer.
5. Confirm concise feedback appears.
6. Confirm `state.md` consecutive count increments.
7. Ask a follow-up question.
8. Confirm app answers without changing state.
9. Type `next`.
10. Confirm previous chat is cleared.
11. Confirm a new unasked question appears.
12. Submit 5 good answers.
13. Confirm level moves to Level 2.

## 18. Implementation Checklist

Complete in this order:

1. Create or identify TypeScript app structure.
2. Add config and environment loading.
3. Add type definitions.
4. Add course file reader.
5. Add state parser and serializer.
6. Add Zod schemas.
7. Add prompt builder with cache-friendly ordering.
8. Add LLM service.
9. Add coach service orchestration.
10. Add API routes.
11. Add frontend chat behavior or adapt existing chat interface.
12. Add duplicate question prevention.
13. Add level progression.
14. Add follow-up mode.
15. Test state update behavior.
16. Test LLM JSON output handling.
17. Run TypeScript build.
18. Run app manually and complete an end-to-end training round.

## 19. Acceptance Criteria

The work is complete when all these are true:

1. App starts without TypeScript errors.
2. App reads `state.md` and current level file.
3. App asks one question from the correct level.
4. App shows the expected answer format summary.
5. App evaluates user answer with concise feedback.
6. App updates `state.md` after evaluated answers.
7. App increments consecutive good answers only for good answers.
8. App resets consecutive count on weak answers.
9. App moves to next level after 5 good answers in a row.
10. App does not ask duplicate questions unless intentionally repeating after weak answer.
11. App supports follow-up questions after feedback.
12. App starts a fresh context when user types `next`.
13. Prompt construction places stable content first, current level content second last, and state last among file-content blocks.
14. Frontend clears previous question content when a new question is asked.

## 20. Notes For The Implementing Model

Do not skip state handling. The main behavior of this app depends on `state.md` being reliable.

Do not let the frontend decide whether the user passed. Only the backend should evaluate and update progress.

Do not trust the LLM to prevent duplicates. Backend must enforce duplicate prevention.

Do not produce long feedback by default. The product definition explicitly requires concise, to-the-point feedback.

Do not ask Level 12 questions unless `inputs-level12.md` exists.

Do not overwrite user progress without backing up old state if parsing fails.
