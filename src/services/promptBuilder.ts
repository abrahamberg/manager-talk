import type { ChatMessage, FeedbackEvaluation, QuestionSelection, RoundContext, StaticCoachFiles } from '../types/coach.js';

const jsonSystemInstruction = [
  'You are a communication coach.',
  'Help the user improve communication skills level by level.',
  'Be concise, direct, and practical.',
  'Follow the current level criteria exactly.',
  'Return only valid JSON. Do not include markdown.'
].join(' ');

const followUpSystemInstruction = [
  'You are answering follow-up questions as a communication coach.',
  'Be concise, direct, and practical.',
  'Do not evaluate a new answer or update state in follow-up mode.'
].join(' ');

export function buildQuestionSelectionMessages(files: StaticCoachFiles, duplicateWarning?: string): ChatMessage[] {
  return [
    { role: 'system', content: jsonSystemInstruction },
    { role: 'user', content: wrapFileContent('defenetion.md', files.definition) },
    { role: 'user', content: wrapFileContent('cource-echema.md', files.courseSchema) },
    { role: 'user', content: wrapFileContent('inputs-levelX.md', files.levelInputs) },
    { role: 'user', content: wrapFileContent('state.md', files.stateMarkdown) },
    { role: 'user', content: buildQuestionSelectionTask(duplicateWarning) }
  ];
}

export function buildFeedbackMessages(args: {
  files: StaticCoachFiles;
  question: QuestionSelection;
  answerText: string;
}): ChatMessage[] {
  return [
    { role: 'system', content: jsonSystemInstruction },
    { role: 'user', content: wrapFileContent('defenetion.md', args.files.definition) },
    { role: 'user', content: wrapFileContent('cource-echema.md', args.files.courseSchema) },
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
    { role: 'user', content: wrapFileContent('defenetion.md', args.files.definition) },
    { role: 'user', content: wrapFileContent('cource-echema.md', args.files.courseSchema) },
    { role: 'user', content: wrapFileContent('inputs-levelX.md', args.files.levelInputs) },
    { role: 'user', content: wrapFileContent('state.md', args.files.stateMarkdown) },
    { role: 'user', content: buildFollowUpTask(args.roundContext, args.message) }
  ];
}

function buildQuestionSelectionTask(duplicateWarning?: string): string {
  return [
    duplicateWarning ? `Duplicate warning: ${duplicateWarning}` : '',
    'Choose the next training question for the current level.',
    'Use a question from the current level input file unless intentionally repeating a failed question.',
    'Return this JSON shape exactly:',
    '{"level":1,"questionId":"level1-category-001","questionText":"Question?","answerFormatSummary":"Short format instruction.","expectedPattern":"Expected answer pattern.","reasonForSelection":"Why this question now.","isIntentionalRepeat":false}'
  ]
    .filter(Boolean)
    .join('\n');
}

function buildFeedbackTask(question: QuestionSelection, answerText: string): string {
  return [
    'Evaluate this answer for the current level only.',
    'Feedback must be concise and adapted to the answer.',
    'Scores 4 and 5 are good. Scores 1, 2, and 3 need improvement.',
    `Question ID: ${question.questionId}`,
    `Question: ${question.questionText}`,
    `Expected pattern: ${question.expectedPattern}`,
    `User answer: ${answerText}`,
    'Return this JSON shape exactly:',
    '{"level":1,"questionId":"level1-category-001","questionText":"Question?","isGoodAnswer":true,"score":4,"feedbackToUser":"Concise feedback.","missingElements":[],"improvedAnswer":"Improved answer.","stateSummaryUpdate":"Short state note.","shouldRepeatQuestion":false,"nextLevelRecommended":false}'
  ].join('\n');
}

function buildFollowUpTask(roundContext: RoundContext, message: string): string {
  return [
    'Current round context:',
    `Level: ${roundContext.level}`,
    `Question: ${roundContext.questionText}`,
    `User answer: ${roundContext.answerText}`,
    `Previous feedback: ${roundContext.feedbackToUser}`,
    `Follow-up question: ${message}`,
    'Answer briefly. Do not update state.'
  ].join('\n');
}

function wrapFileContent(fileName: string, content: string): string {
  // Keep stable file blocks in a fixed order so provider-side prompt caching can work.
  return `<file name="${fileName}">\n${content}\n</file>`;
}
