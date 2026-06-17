import type { ChatMessage, QuestionSelection, RoundContext, StaticCoachFiles } from '../types/coach.js';

const jsonSystemInstruction = [
  'You are a communication coach.',
  'Use only the provided product definition, course schema, current level input file, and state file as context.',
  'Follow the current level criteria exactly; do not advance levels yourself.',
  'Be concise, direct, and practical in user-facing text.',
  'Never reveal private reasoning.',
  'Return only valid JSON with the requested keys. Do not include markdown, comments, or extra keys.'
].join(' ');

const followUpSystemInstruction = [
  'You are answering follow-up questions as a communication coach.',
  'Use only the provided product definition, course schema, current level input file, state file, and current round context.',
  'Be concise, direct, and practical.',
  'Do not evaluate a new answer, select a new question, or update state in follow-up mode.',
  'Do not reveal private reasoning.'
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
    'TASK: Choose the next training question.',
    '',
    'Context available above, in cache-friendly order:',
    '1. defenetion.md: product rules.',
    '2. cource-echema.md: level goals, structure, pass criteria, and vocabulary.',
    '3. inputs-levelX.md: the only valid question bank for the current level.',
    '4. state.md: current user progress, active question, and asked questions.',
    '',
    duplicateWarning ? `RETRY WARNING: ${duplicateWarning}` : '',
    '',
    'Rules:',
    '- Select exactly one question for the current User Current Level in state.md.',
    '- The questionText must be copied from inputs-levelX.md exactly unless this is a valid intentional repeat.',
    '- Do not invent or reword questions.',
    '- Do not select a question already listed in state.md unless isIntentionalRepeat is true and the previous evaluation needs improvement.',
    '- answerFormatSummary must tell the user exactly how to answer at this level in one short instruction.',
    '- expectedPattern must be the current level answer structure.',
    '- reasonForSelection is for state/debugging; keep it one sentence.',
    '',
    'Return this JSON object exactly:',
    '{"level":1,"questionId":"level1-category-001","questionText":"Question?","answerFormatSummary":"Short format instruction.","expectedPattern":"Expected answer pattern.","reasonForSelection":"Why this question now.","isIntentionalRepeat":false}'
  ]
    .filter(Boolean)
    .join('\n');
}

function buildFeedbackTask(question: QuestionSelection, answerText: string): string {
  return [
    'TASK: Evaluate the user answer and produce concise coaching feedback.',
    '',
    'Context available above, in cache-friendly order:',
    '1. defenetion.md: product rules.',
    '2. cource-echema.md: level goals, structure, pass criteria, examples, and vocabulary.',
    '3. inputs-levelX.md: current level question bank and coach instructions.',
    '4. state.md: current user progress and active question.',
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
    '- stateSummaryUpdate must be one short factual sentence about progress or the gap.',
    '- shouldRepeatQuestion should be true only when repeating this same question is useful practice.',
    '- nextLevelRecommended can be true only if this answer is good; backend decides actual progression.',
    '',
    'Return this JSON object exactly:',
    '{"level":1,"questionId":"level1-category-001","questionText":"Question?","isGoodAnswer":true,"score":4,"feedbackToUser":"Concise feedback.","missingElements":[],"improvedAnswer":"Improved answer.","stateSummaryUpdate":"Short state note.","shouldRepeatQuestion":false,"nextLevelRecommended":false}'
  ].join('\n');
}

function buildFollowUpTask(roundContext: RoundContext, message: string): string {
  return [
    'TASK: Answer a follow-up question after feedback.',
    '',
    'Context available above, in cache-friendly order:',
    '1. defenetion.md: product rules.',
    '2. cource-echema.md: level goals, structure, pass criteria, examples, and vocabulary.',
    '3. inputs-levelX.md: current level coach instruction.',
    '4. state.md: current user progress.',
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
