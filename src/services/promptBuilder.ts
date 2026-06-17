import type { ChatMessage, QuestionSelection, RoundContext, StaticCoachFiles } from '../types/coach.js';

const jsonSystemInstruction = [
  'You are a communication coach for a level-based training app.',
  'Your main job is to assess the user answer against the current level criteria, give concise feedback, update the compact state, and plan the next move.',
  'For answer evaluation, return JSON that includes feedback, score, compact state summary, coaching focus, improvement strategy, and the next question selected by reasoning from the most useful category in the same level.',
  'Do not choose by file order. Choose by what the user needs next, using the current state and asked-question history.',
  'Use only the optimized course ladder, current level input file, compact state, and current user input provided below.',
  'Follow the current level only; do not require higher-level skills early.',
  'Keep user-facing feedback short and practical.',
  'Never reveal private reasoning.',
  'Return only valid JSON with the requested keys. No markdown, comments, or extra keys.'
].join(' ');

const followUpSystemInstruction = [
  'You are a communication coach answering a follow-up question after feedback.',
  'Answer the user question using the optimized course ladder, current level input file, compact state, and current round summary.',
  'Be concise, direct, and practical; if useful, provide one improved example using the current level structure.',
  'Do not evaluate a new answer, select a new question, or update state in follow-up mode.',
  'Do not reveal private reasoning.'
].join(' ');

export function buildFeedbackMessages(args: {
  files: StaticCoachFiles;
  question: QuestionSelection;
  answerText: string;
}): ChatMessage[] {
  return [
    { role: 'system', content: jsonSystemInstruction },
    { role: 'user', content: wrapFileContent('cource-echema-optimized.md', args.files.courseSchema) },
    { role: 'user', content: wrapFileContent('inputs-levelX.md', args.files.levelInputs) },
    { role: 'user', content: wrapFileContent('state.md', args.files.stateMarkdown) },
    { role: 'user', content: buildFeedbackTask(args.question, args.answerText) }
  ];
}

export function buildFollowUpMessages(args: {
  files: StaticCoachFiles;
  roundContext: RoundContext;
  message: string;
}): ChatMessage[] {
  return [
    { role: 'system', content: followUpSystemInstruction },
    { role: 'user', content: wrapFileContent('cource-echema-optimized.md', args.files.courseSchema) },
    { role: 'user', content: wrapFileContent('inputs-levelX.md', args.files.levelInputs) },
    { role: 'user', content: wrapFileContent('state.md', args.files.stateMarkdown) },
    { role: 'user', content: buildFollowUpTask(args.roundContext, args.message) }
  ];
}

function buildFeedbackTask(question: QuestionSelection, answerText: string): string {
  return [
    'TASK: Evaluate the user answer and produce concise coaching feedback.',
    '',
    'Context available above, in cache-friendly order:',
    '1. optimized course ladder: level goals, structures, pass criteria, vocabulary guidance.',
    '2. inputs-levelX.md: current level question bank and coach instructions.',
    '3. state.md: compact progress, focus, strategy, active question, asked questions.',
    '',
    'Current evaluated item:',
    `Question ID: ${question.questionId}`,
    `Question: ${question.questionText}`,
    `Answer format summary: ${question.answerFormatSummary}`,
    `Expected pattern: ${question.expectedPattern}`,
    `User answer: ${answerText}`,
    '',
    'Evaluation rules:',
    '- Evaluate only against the current level criteria, not higher levels.',
    '- Scores 4 and 5 are good. Scores 1, 2, and 3 need improvement.',
    '- isGoodAnswer must be true only for score 4 or 5.',
    '- feedbackToUser must be concise: maximum two short sentences.',
    '- If weak, name the single most important missing element.',
    '- improvedAnswer must follow the current level expected pattern.',
    '- compactStateSummary must replace the previous state summary with one short factual sentence.',
    '- coachingFocus must say what communication skill the user is currently working on.',
    '- improvementStrategy must say why the next question helps the user improve.',
    '- shouldRepeatQuestion should be true only when repeating this same question is useful practice.',
    '- nextLevelRecommended can be true only if this answer is good; backend decides actual progression.',
    '- Also choose the next question now, in this same response.',
    '- Select the next question by reasoning from the most useful category in the same level, not by file order.',
    '- nextQuestion.questionText must be copied exactly from inputs-levelX.md unless shouldRepeatQuestion is true.',
    '- Do not invent or reword next questions.',
    '- nextQuestion.reasonForSelection must explain the category choice and coaching reason in one sentence.',
    '- Set nextQuestion to null only if the course is complete or no current-level question remains.',
    '',
    'Return this JSON object exactly:',
    '{"level":1,"questionId":"level1-category-001","questionText":"Question?","isGoodAnswer":true,"score":4,"feedbackToUser":"Concise feedback.","missingElements":[],"improvedAnswer":"Improved answer.","compactStateSummary":"Short state note.","coachingFocus":"Current skill focus.","improvementStrategy":"Why this next practice helps.","shouldRepeatQuestion":false,"nextLevelRecommended":false,"nextQuestion":{"level":1,"questionId":"level1-category-002","questionText":"Next exact question?","answerFormatSummary":"Short format instruction.","expectedPattern":"Expected answer pattern.","reasonForSelection":"Category and coaching reason.","isIntentionalRepeat":false}}'
  ].join('\n');
}

function buildFollowUpTask(roundContext: RoundContext, message: string): string {
  return [
    'TASK: Answer a follow-up question after feedback.',
    '',
    'Context available above, in cache-friendly order:',
    '1. optimized course ladder: level goals, structures, pass criteria, vocabulary guidance.',
    '2. inputs-levelX.md: current level coach instruction.',
    '3. state.md: compact current progress.',
    '',
    'Current round context:',
    `Level: ${roundContext.level}`,
    `Question: ${roundContext.questionText}`,
    `User answer: ${roundContext.answerText}`,
    `Previous feedback: ${roundContext.feedbackToUser}`,
    '',
    `Follow-up question: ${message}`,
    '',
    'Rules:',
    '- Answer briefly in plain text.',
    '- Do not evaluate this as a new answer.',
    '- Do not ask a new training question.',
    '- Do not mention or modify state.',
    '- If the user asks for an example, give one example using the current level structure.'
  ].join('\n');
}

function wrapFileContent(fileName: string, content: string): string {
  // Keep stable file blocks in a fixed order so provider-side prompt caching can work.
  return `<file name="${fileName}">\n${content}\n</file>`;
}
