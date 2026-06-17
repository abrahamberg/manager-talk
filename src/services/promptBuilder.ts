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
    'TASK: Evaluate answer, update compact state, choose next question.',
    '',
    'CURRENT LEVEL EVALUATION LENS:',
    `Level: ${question.level}`,
    `Required structure: ${question.expectedPattern}`,
    `User-facing answer instruction: ${question.answerFormatSummary}`,
    'Pass if the answer satisfies this level semantically. Do not require higher-level skills.',
    'Speech-to-text grammar, spelling, punctuation, and missing sentence breaks are cleanup issues, not failures, when meaning is clear.',
    'For each Level : pass when  minim reqirement for that level is satified.',
    '',
    'EVALUATED ITEM:',
    `Question ID: ${question.questionId}`,
    `Question: ${question.questionText}`,
    `User answer: ${answerText}`,
    '',
    'OUTPUT RULES:',
    '- Scores 4-5 are good; scores 1-3 need improvement. isGoodAnswer must match score.',
    '- feedbackToUser: maximum two short sentences. If good, say what worked; if weak, name one missing element.',
    '- improvedAnswer: clean version using the current level structure.',
    '- compactStateSummary/coachingFocus/improvementStrategy: short and useful for next run.',
    '- nextQuestion: choose by coaching reason from the most useful same-level category, not by file order.',
    '- nextQuestion.questionText must exactly match inputs-levelX.md unless intentionally repeating a weak answer.',
    '- nextQuestion.reasonForSelection must explain the category choice and coaching reason in one sentence.',
    '',
    'Return this JSON object exactly:',
    '{"level":1,"questionId":"level1-category-001","questionText":"Question?","isGoodAnswer":true,"score":4,"feedbackToUser":"Concise feedback.","missingElements":[],"improvedAnswer":"Improved answer.","compactStateSummary":"Short state note.","coachingFocus":"Current skill focus.","improvementStrategy":"Why this next practice helps.","shouldRepeatQuestion":false,"nextLevelRecommended":false,"nextQuestion":{"level":1,"questionId":"level1-category-002","questionText":"Next exact question?","answerFormatSummary":"Short format instruction.","expectedPattern":"Expected answer pattern.","reasonForSelection":"Category and coaching reason.","isIntentionalRepeat":false}}'
  ].join('\n');
}

function buildFollowUpTask(roundContext: RoundContext, message: string): string {
  return [
    'TASK: Answer a follow-up question after feedback.',
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
