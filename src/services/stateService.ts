import { copyFile, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { trainingDir } from '../config.js';
import type { AskedQuestion, CoachState, CurrentQuestion, EvaluationValue } from '../types/coach.js';

const statePath = path.join(trainingDir, 'state.md');

export async function readStateMarkdown(): Promise<string> {
  return readFile(statePath, 'utf8');
}

export async function readState(): Promise<CoachState> {
  const markdown = await readStateMarkdown();

  return parseState(markdown);
}

export async function writeState(state: CoachState): Promise<void> {
  const tempPath = `${statePath}.tmp`;

  // Atomic rename avoids leaving partially-written progress data in state.md.
  await writeFile(tempPath, serializeState(state), 'utf8');
  await rename(tempPath, statePath);
}

export async function ensureStateFile(): Promise<void> {
  try {
    parseState(await readStateMarkdown());
  } catch {
    await backupStateFile();
    await writeState(createDefaultState());
  }
}

export function parseState(markdown: string): CoachState {
  return {
    currentLevel: parseCurrentLevel(markdown),
    currentStateSummary: parseStateSummary(markdown),
    coachingFocus: parseNamedSection(markdown, 'Coaching Focus') || 'Establish the current level structure clearly.',
    improvementStrategy: parseNamedSection(markdown, 'Improvement Strategy') || 'Ask focused questions that test the current level pass criteria.',
    nextQuestionReason: parseNamedSection(markdown, 'Next Question Reason') || 'Start with a useful current-level practice question.',
    consecutiveGoodAnswers: parseConsecutiveGoodAnswers(markdown),
    currentQuestion: parseCurrentQuestion(markdown),
    questionsAskedAlready: parseAskedQuestions(markdown),
    recentEvaluations: parseRecentEvaluations(markdown)
  };
}

export function serializeState(state: CoachState): string {
  return [
    '# Communication Coach State',
    '',
    `User Current Level: ${state.currentLevel}`,
    '',
    'Current State Summary:',
    state.currentStateSummary,
    '',
    'Coaching Focus:',
    state.coachingFocus,
    '',
    'Improvement Strategy:',
    state.improvementStrategy,
    '',
    'Next Question Reason:',
    state.nextQuestionReason,
    '',
    `Consecutive Good Answers: ${state.consecutiveGoodAnswers}`,
    '',
    'Current Question:',
    ...serializeCurrentQuestion(state.currentQuestion),
    '',
    'Questions Asked Already:',
    ...serializeAskedQuestions(state.questionsAskedAlready),
    ''
  ].join('\n');
}

export function createDefaultState(): CoachState {
  return {
    currentLevel: 1,
    currentStateSummary: 'The user is starting Level 1. No evaluated answers yet.',
    coachingFocus: 'Practice clear action plus result answers.',
    improvementStrategy: 'Use simple Level 1 questions until the user consistently answers in two short sentences.',
    nextQuestionReason: 'Start with an easy daily-work question to establish the baseline.',
    consecutiveGoodAnswers: 0,
    currentQuestion: null,
    questionsAskedAlready: [],
    recentEvaluations: []
  };
}

function parseCurrentLevel(markdown: string): number {
  return parseNumberAfterLabel(markdown, 'User Current Level') ?? 1;
}

function parseConsecutiveGoodAnswers(markdown: string): number {
  return parseNumberAfterLabel(markdown, 'Consecutive Good Answers') ?? parseNumberAfterLabel(markdown, 'Signals To mobe on') ?? 0;
}

function parseStateSummary(markdown: string): string {
  const structured = parseSectionTextBeforeAny(markdown, 'Current State Summary:', [
    'Coaching Focus:',
    'Consecutive Good Answers:'
  ]);

  if (structured) {
    return structured;
  }

  return parseLooseSectionText(markdown, 'User current State', 'Signals To mobe on') || 'The user is starting Level 1. No evaluated answers yet.';
}

function parseCurrentQuestion(markdown: string): CurrentQuestion | null {
  const id = parseCurrentQuestionField(markdown, 'ID');
  const text = parseCurrentQuestionField(markdown, 'Text');
  const answerFormatSummary = parseCurrentQuestionField(markdown, 'Answer Format Summary');
  const expectedPattern = parseCurrentQuestionField(markdown, 'Expected Pattern');
  const askedAt = parseCurrentQuestionField(markdown, 'Asked At');
  const repeatIntentional = parseCurrentQuestionField(markdown, 'Repeat Intentional') === 'true';

  if (!id || id === 'none' || !text || text === 'none') {
    return null;
  }

  return {
    id,
    text,
    answerFormatSummary: answerFormatSummary && answerFormatSummary !== 'none' ? answerFormatSummary : null,
    expectedPattern: expectedPattern && expectedPattern !== 'none' ? expectedPattern : null,
    askedAt: askedAt && askedAt !== 'none' ? askedAt : new Date().toISOString(),
    repeatIntentional
  };
}

function parseAskedQuestions(markdown: string): AskedQuestion[] {
  const section = parseSectionText(markdown, 'Questions Asked Already:', 'Recent Evaluations:');

  if (!section || section.includes('- none')) {
    return [];
  }

  if (section.includes('|')) {
    return section
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- ') && !line.includes('- none'))
      .flatMap(parseCompactAskedQuestionRecord);
  }

  const records = section.split(/\n(?=- ID: )/g).filter((record) => record.trim().startsWith('- ID:'));

  return records.flatMap(parseAskedQuestionRecord);
}

function parseCompactAskedQuestionRecord(line: string): AskedQuestion[] {
  const [id, level, evaluation, question, summary] = line.replace(/^- /, '').split('|').map((part) => part.trim());

  if (!id || !question) {
    return [];
  }

  return [
    {
      id,
      level: Number(level ?? 1),
      question,
      evaluation: parseEvaluationValue(evaluation ?? null),
      summary: summary || 'No summary.',
      askedAt: 'not-tracked'
    }
  ];
}

function parseAskedQuestionRecord(record: string): AskedQuestion[] {
  const id = parseRecordField(record, 'ID');
  const question = parseRecordField(record, 'Question');

  if (!id || !question) {
    return [];
  }

  return [
    {
      id,
      level: Number(parseRecordField(record, 'Level') ?? 1),
      question,
      evaluation: parseEvaluationValue(parseRecordField(record, 'Evaluation')),
      summary: parseRecordField(record, 'Summary') ?? 'No summary.',
      askedAt: parseRecordField(record, 'Asked At') ?? new Date().toISOString()
    }
  ];
}

function parseRecentEvaluations(markdown: string): string[] {
  const section = parseSectionText(markdown, 'Recent Evaluations:', undefined);

  if (!section || section.includes('- none')) {
    return [];
  }

  return section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.replace(/^- /, ''));
}

function parseNumberAfterLabel(markdown: string, label: string): number | null {
  const escapedLabel = escapeRegExp(label);
  const match = markdown.match(new RegExp(`${escapedLabel}\\s*:\\s*(\\d+)`, 'i'));

  return match?.[1] ? Number(match[1]) : null;
}

function parseLooseSectionText(markdown: string, startLabel: string, endLabel: string): string {
  const escapedStart = escapeRegExp(startLabel);
  const escapedEnd = escapeRegExp(endLabel);
  const match = markdown.match(new RegExp(`${escapedStart}\\s*:\\s*([\\s\\S]*?)(?=${escapedEnd}\\s*:)`, 'i'));

  return match?.[1]?.trim() ?? '';
}

function parseSectionText(markdown: string, startLabel: string, endLabel: string | undefined): string {
  const startIndex = markdown.indexOf(startLabel);

  if (startIndex === -1) {
    return '';
  }

  const contentStart = startIndex + startLabel.length;
  const contentEnd = endLabel ? markdown.indexOf(endLabel, contentStart) : markdown.length;
  const rawContent = markdown.slice(contentStart, contentEnd === -1 ? markdown.length : contentEnd);

  return rawContent.trim();
}

function parseNamedSection(markdown: string, label: string): string {
  return parseSectionTextBeforeAny(markdown, `${label}:`, [
    'Current State Summary:',
    'Coaching Focus:',
    'Improvement Strategy:',
    'Next Question Reason:',
    'Consecutive Good Answers:',
    'Current Question:',
    'Questions Asked Already:',
    'Recent Evaluations:'
  ]);
}

function parseSectionTextBeforeAny(markdown: string, startLabel: string, endLabels: string[]): string {
  const startIndex = markdown.indexOf(startLabel);

  if (startIndex === -1) {
    return '';
  }

  const contentStart = startIndex + startLabel.length;
  const contentEnd = endLabels
    .map((label) => markdown.indexOf(label, contentStart))
    .filter((index) => index !== -1)
    .sort((left, right) => left - right)[0];

  return markdown.slice(contentStart, contentEnd ?? markdown.length).trim();
}

function parseCurrentQuestionField(markdown: string, fieldName: string): string | null {
  const section = parseSectionText(markdown, 'Current Question:', 'Questions Asked Already:');

  return parseRecordField(section, fieldName);
}

function parseRecordField(record: string, fieldName: string): string | null {
  const escapedField = escapeRegExp(fieldName);
  const match = record.match(new RegExp(`(?:-|\\s+)${escapedField}:\\s*(.+)`));

  return match?.[1]?.trim() ?? null;
}

function parseEvaluationValue(value: string | null): EvaluationValue {
  if (value === 'good' || value === 'needs_improvement' || value === 'repeated_for_practice') {
    return value;
  }

  return 'needs_improvement';
}

function serializeCurrentQuestion(question: CurrentQuestion | null): string[] {
  if (!question) {
    return [
      '- ID: none',
      '- Text: none',
      '- Answer Format Summary: none',
      '- Expected Pattern: none',
      '- Asked At: none',
      '- Repeat Intentional: false'
    ];
  }

  return [
    `- ID: ${question.id}`,
    `- Text: ${question.text}`,
    `- Answer Format Summary: ${question.answerFormatSummary ?? 'none'}`,
    `- Expected Pattern: ${question.expectedPattern ?? 'none'}`,
    `- Asked At: ${question.askedAt}`,
    `- Repeat Intentional: ${question.repeatIntentional}`
  ];
}

function serializeAskedQuestions(questions: AskedQuestion[]): string[] {
  if (questions.length === 0) {
    return ['- none'];
  }

  return questions.map((question) =>
    `- ${question.id} | ${question.level} | ${question.evaluation} | ${question.question} | ${trimForState(question.summary)}`
  );
}

async function backupStateFile(): Promise<void> {
  try {
    await copyFile(statePath, `${statePath}.bak.${Date.now()}`);
  } catch {
    return;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function trimForState(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 160);
}
