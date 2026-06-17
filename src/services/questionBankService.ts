import type { AskedQuestion, CoachState, QuestionSelection } from '../types/coach.js';

export interface ParsedQuestion {
  id: string;
  category: string;
  text: string;
}

export function isDuplicateQuestion(selection: QuestionSelection, state: CoachState): boolean {
  const askedQuestion = findAskedQuestion(selection, state.questionsAskedAlready);

  if (!askedQuestion) {
    return false;
  }

  return !(selection.isIntentionalRepeat && askedQuestion.evaluation === 'needs_improvement');
}

export function chooseFallbackQuestion(levelInputs: string, state: CoachState): QuestionSelection {
  const question = chooseQuestionByStrategy(levelInputs, state);

  if (!question) {
    throw new Error(`No unused questions remain for level ${state.currentLevel}.`);
  }

  return {
    level: state.currentLevel,
    questionId: question.id,
    questionText: question.text,
    answerFormatSummary: extractAnswerFormatSummary(levelInputs),
    expectedPattern: extractExpectedPattern(levelInputs),
    reasonForSelection: `Fallback selected an unused ${question.category} question based on current coaching focus.`,
    isIntentionalRepeat: false
  };
}

export function getRecentAskedQuestions(questions: AskedQuestion[], limit: number): AskedQuestion[] {
  return questions.slice(-limit);
}

export function normalizeSelectionFromLevelFile(selection: QuestionSelection, levelInputs: string, state: CoachState): QuestionSelection | null {
  if (isValidIntentionalRepeat(selection, state)) {
    return selection;
  }

  const matchingQuestion = findMatchingLevelQuestion(selection, levelInputs, state.currentLevel);

  if (!matchingQuestion) {
    return null;
  }

  return {
    ...selection,
    level: state.currentLevel,
    questionId: matchingQuestion.id,
    questionText: matchingQuestion.text
  };
}

export function findQuestionById(levelInputs: string, level: number, questionId: string): ParsedQuestion | null {
  return parseLevelQuestions(levelInputs, level).find((question) => question.id === questionId) ?? null;
}

export function extractAnswerFormatSummary(levelInputs: string): string {
  const quotedInstruction = levelInputs.match(/coach should say:\s*\n\s*>\s+(.+)/i);

  if (quotedInstruction?.[1]) {
    return quotedInstruction[1].replace(/[“”]/g, '').trim();
  }

  const structure = levelInputs.match(/```text\n([\s\S]*?)```/);

  if (structure?.[1]) {
    return `Use this structure: ${structure[1].trim().replace(/\n+/g, ' ')}`;
  }

  return 'Answer using the expected structure for the current level.';
}

export function extractExpectedPattern(levelInputs: string): string {
  const structure = levelInputs.match(/```text\n([\s\S]*?)```/);

  return structure?.[1]?.trim().replace(/\n+/g, ' ') ?? 'Use the current level structure.';
}

export function normalizeQuestionText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function findMatchingLevelQuestion(selection: QuestionSelection, levelInputs: string, level: number): ParsedQuestion | null {
  const questions = parseLevelQuestions(levelInputs, level);
  const normalizedSelectionText = normalizeQuestionText(selection.questionText);

  return (
    questions.find((question) => question.id === selection.questionId) ??
    questions.find((question) => normalizeQuestionText(question.text) === normalizedSelectionText) ??
    null
  );
}

function isValidIntentionalRepeat(selection: QuestionSelection, state: CoachState): boolean {
  if (!selection.isIntentionalRepeat) {
    return false;
  }

  const askedQuestion = findAskedQuestion(selection, state.questionsAskedAlready);

  return askedQuestion?.evaluation === 'needs_improvement';
}

function findAskedQuestion(selection: QuestionSelection, askedQuestions: AskedQuestion[]): AskedQuestion | null {
  const normalizedText = normalizeQuestionText(selection.questionText);

  return (
    askedQuestions.find((question) => question.id === selection.questionId) ??
    askedQuestions.find((question) => normalizeQuestionText(question.question) === normalizedText) ??
    null
  );
}

function wasAsked(question: ParsedQuestion, state: CoachState): boolean {
  const normalizedText = normalizeQuestionText(question.text);

  return state.questionsAskedAlready.some(
    (askedQuestion) => askedQuestion.id === question.id || normalizeQuestionText(askedQuestion.question) === normalizedText
  );
}

export function parseLevelQuestions(levelInputs: string, level: number): ParsedQuestion[] {
  const lines = levelInputs.split('\n');
  const questions: ParsedQuestion[] = [];
  let category = 'general';

  for (const line of lines) {
    const categoryMatch = line.match(/^##\s+Category\s+\d+\s+[—-]\s+(.+)$/);

    if (categoryMatch?.[1]) {
      category = slugify(categoryMatch[1]);
      continue;
    }

    const questionMatch = line.match(/^\s*(\d+)\.\s+(.+)\s*$/);

    if (!questionMatch?.[1] || !questionMatch[2]) {
      continue;
    }

    questions.push({
      id: `level${level}-${category}-${questionMatch[1].padStart(3, '0')}`,
      category,
      text: questionMatch[2].trim()
    });
  }

  return questions;
}

function chooseQuestionByStrategy(levelInputs: string, state: CoachState): ParsedQuestion | null {
  const unusedQuestions = parseLevelQuestions(levelInputs, state.currentLevel).filter((candidate) => !wasAsked(candidate, state));

  if (unusedQuestions.length === 0) {
    return null;
  }

  const strategyText = `${state.coachingFocus} ${state.improvementStrategy}`.toLowerCase();
  const matchingQuestion = unusedQuestions.find((question) => strategyText.includes(question.category.replace(/-/g, ' ')));

  if (matchingQuestion) {
    return matchingQuestion;
  }

  return chooseLeastRecentlyUsedCategory(unusedQuestions, state.questionsAskedAlready);
}

function chooseLeastRecentlyUsedCategory(unusedQuestions: ParsedQuestion[], askedQuestions: AskedQuestion[]): ParsedQuestion {
  const recentAskedText = getRecentAskedQuestions(askedQuestions, 3)
    .map((question) => question.id)
    .join(' ');

  const fallbackQuestion = unusedQuestions[0];

  if (!fallbackQuestion) {
    throw new Error('No unused questions were provided for fallback selection.');
  }

  return unusedQuestions.find((question) => !recentAskedText.includes(question.category)) ?? fallbackQuestion;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
