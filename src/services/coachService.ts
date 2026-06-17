import { readStaticCoachFiles, levelInputsExist, readLevelInputs } from './courseFileService.js';
import { evaluateAnswer, selectQuestion, answerFollowUp } from './llmService.js';
import { buildFeedbackMessages, buildFollowUpMessages, buildQuestionSelectionMessages } from './promptBuilder.js';
import {
  chooseFallbackQuestion,
  extractAnswerFormatSummary,
  extractExpectedPattern,
  isDuplicateQuestion,
  normalizeSelectionFromLevelFile
} from './questionBankService.js';
import { readState, readStateMarkdown, writeState } from './stateService.js';
import type { AnswerRequest, FollowUpRequest } from '../schemas/apiSchemas.js';
import type { AskedQuestion, CoachState, FeedbackEvaluation, QuestionSelection } from '../types/coach.js';

export async function getSession() {
  const state = await readState();

  return {
    currentLevel: state.currentLevel,
    consecutiveGoodAnswers: state.consecutiveGoodAnswers,
    currentStateSummary: state.currentStateSummary,
    currentQuestion: state.currentQuestion
  };
}

export async function getNextQuestion(forceNew: boolean) {
  const state = await readState();

  if (state.currentQuestion && !forceNew) {
    return questionFromCurrentState(state, await readLevelInputs(state.currentLevel));
  }

  const stateMarkdown = await readStateMarkdown();
  const files = await readStaticCoachFiles(state.currentLevel, stateMarkdown);
  const selection = await chooseNonDuplicateQuestion(files, state);
  const nextState = rememberCurrentQuestion(state, selection);

  await writeState(nextState);

  return selection;
}

export async function submitAnswer(input: AnswerRequest) {
  const state = await readState();

  ensureAnswerMatchesState(input, state);

  const stateMarkdown = await readStateMarkdown();
  const files = await readStaticCoachFiles(state.currentLevel, stateMarkdown);
  const question = buildQuestionFromState(state);
  const messages = buildFeedbackMessages({ files, question, answerText: input.answerText });
  const evaluation = await evaluateAnswer(messages);
  const updatedState = await applyEvaluation(state, evaluation);

  await writeState(updatedState.state);

  return {
    isGoodAnswer: evaluation.isGoodAnswer,
    score: evaluation.score,
    feedbackToUser: evaluation.feedbackToUser,
    improvedAnswer: evaluation.improvedAnswer,
    currentLevel: updatedState.state.currentLevel,
    consecutiveGoodAnswers: updatedState.state.consecutiveGoodAnswers,
    movedToNextLevel: updatedState.movedToNextLevel
  };
}

export async function submitFollowUp(input: FollowUpRequest) {
  if (input.message.trim().toLowerCase() === 'next') {
    return { next: true };
  }

  const stateMarkdown = await readStateMarkdown();
  const files = await readStaticCoachFiles(input.roundContext.level, stateMarkdown);
  const messages = buildFollowUpMessages({
    files,
    roundContext: input.roundContext,
    message: input.message
  });

  return { answer: await answerFollowUp(messages) };
}

async function chooseNonDuplicateQuestion(files: Awaited<ReturnType<typeof readStaticCoachFiles>>, state: CoachState): Promise<QuestionSelection> {
  const firstSelection = await selectQuestion(buildQuestionSelectionMessages(files));
  const firstValidSelection = normalizeSelectionFromLevelFile(firstSelection, files.levelInputs, state);

  if (firstValidSelection && !isDuplicateQuestion(firstValidSelection, state)) {
    return firstValidSelection;
  }

  const duplicateWarning = buildSelectionRetryWarning(firstSelection, firstValidSelection, state);
  const secondSelection = await selectQuestion(buildQuestionSelectionMessages(files, duplicateWarning));
  const secondValidSelection = normalizeSelectionFromLevelFile(secondSelection, files.levelInputs, state);

  if (secondValidSelection && !isDuplicateQuestion(secondValidSelection, state)) {
    return secondValidSelection;
  }

  return chooseFallbackQuestion(files.levelInputs, state);
}

function buildSelectionRetryWarning(selection: QuestionSelection, validSelection: QuestionSelection | null, state: CoachState): string {
  if (!validSelection) {
    return `The selected question is not an exact question from inputs-level${state.currentLevel}.md. Select an unused question from that file only.`;
  }

  if (isDuplicateQuestion(validSelection, state)) {
    return 'The selected question was already asked. Select a different unused question from the current level file.';
  }

  return `The selected question was invalid: ${selection.questionText}`;
}

function questionFromCurrentState(state: CoachState, levelInputs: string): QuestionSelection {
  const question = state.currentQuestion;

  if (!question) {
    throw new Error('No current question exists.');
  }

  return {
    level: state.currentLevel,
    questionId: question.id,
    questionText: question.text,
    answerFormatSummary: question.answerFormatSummary ?? extractAnswerFormatSummary(levelInputs),
    expectedPattern: question.expectedPattern ?? extractExpectedPattern(levelInputs),
    reasonForSelection: 'Returning the current unanswered question.',
    isIntentionalRepeat: question.repeatIntentional
  };
}

function rememberCurrentQuestion(state: CoachState, selection: QuestionSelection): CoachState {
  return {
    ...state,
    currentQuestion: {
      id: selection.questionId,
      text: selection.questionText,
      answerFormatSummary: selection.answerFormatSummary,
      expectedPattern: selection.expectedPattern,
      askedAt: new Date().toISOString(),
      repeatIntentional: selection.isIntentionalRepeat
    }
  };
}

function ensureAnswerMatchesState(input: AnswerRequest, state: CoachState): void {
  if (!state.currentQuestion) {
    throw new StaleQuestionError('No active question. Request the next question first.');
  }

  if (input.questionId !== state.currentQuestion.id || input.level !== state.currentLevel) {
    throw new StaleQuestionError('Submitted question does not match the active question. Refresh and try again.');
  }
}

function buildQuestionFromState(state: CoachState): QuestionSelection {
  const question = state.currentQuestion;

  if (!question) {
    throw new StaleQuestionError('No active question. Request the next question first.');
  }

  return {
    level: state.currentLevel,
    questionId: question.id,
    questionText: question.text,
    answerFormatSummary: question.answerFormatSummary ?? 'Use the expected structure for the current level.',
    expectedPattern: question.expectedPattern ?? 'Use the current level structure.',
    reasonForSelection: 'Question submitted for evaluation.',
    isIntentionalRepeat: question.repeatIntentional
  };
}

async function applyEvaluation(state: CoachState, evaluation: FeedbackEvaluation): Promise<{ state: CoachState; movedToNextLevel: boolean }> {
  const askedQuestion = createAskedQuestion(state, evaluation);
  const nextState = appendEvaluation(state, askedQuestion, evaluation);

  if (!evaluation.isGoodAnswer) {
    return { state: applyWeakAnswer(nextState, evaluation), movedToNextLevel: false };
  }

  return applyGoodAnswer(nextState, evaluation);
}

function createAskedQuestion(state: CoachState, evaluation: FeedbackEvaluation): AskedQuestion {
  return {
    id: evaluation.questionId,
    level: state.currentLevel,
    question: evaluation.questionText,
    evaluation: evaluation.isGoodAnswer ? 'good' : 'needs_improvement',
    summary: evaluation.stateSummaryUpdate,
    askedAt: new Date().toISOString()
  };
}

function appendEvaluation(state: CoachState, askedQuestion: AskedQuestion, evaluation: FeedbackEvaluation): CoachState {
  return {
    ...state,
    currentStateSummary: evaluation.stateSummaryUpdate,
    questionsAskedAlready: upsertAskedQuestion(state.questionsAskedAlready, askedQuestion),
    recentEvaluations: [...state.recentEvaluations, `${evaluation.questionText}: ${evaluation.feedbackToUser}`].slice(-10)
  };
}

function applyWeakAnswer(state: CoachState, evaluation: FeedbackEvaluation): CoachState {
  return {
    ...state,
    consecutiveGoodAnswers: 0,
    currentQuestion: evaluation.shouldRepeatQuestion && state.currentQuestion ? { ...state.currentQuestion, repeatIntentional: true } : null
  };
}

async function applyGoodAnswer(state: CoachState, evaluation: FeedbackEvaluation): Promise<{ state: CoachState; movedToNextLevel: boolean }> {
  const consecutiveGoodAnswers = state.consecutiveGoodAnswers + 1;

  if (consecutiveGoodAnswers < 5) {
    return {
      state: { ...state, consecutiveGoodAnswers, currentQuestion: null },
      movedToNextLevel: false
    };
  }

  return moveToNextLevelIfAvailable({ ...state, consecutiveGoodAnswers: 0, currentQuestion: null }, evaluation);
}

async function moveToNextLevelIfAvailable(state: CoachState, evaluation: FeedbackEvaluation): Promise<{ state: CoachState; movedToNextLevel: boolean }> {
  const nextLevel = state.currentLevel + 1;

  if (await levelInputsExist(nextLevel)) {
    return {
      state: {
        ...state,
        currentLevel: nextLevel,
        currentStateSummary: `Moved to Level ${nextLevel}. ${evaluation.stateSummaryUpdate}`
      },
      movedToNextLevel: true
    };
  }

  return {
    state: {
      ...state,
      currentStateSummary: 'Course completed for the available levels. No next input file exists.'
    },
    movedToNextLevel: false
  };
}

function upsertAskedQuestion(questions: AskedQuestion[], question: AskedQuestion): AskedQuestion[] {
  const existingIndex = questions.findIndex((candidate) => candidate.id === question.id);

  if (existingIndex === -1) {
    return [...questions, question];
  }

  return questions.map((candidate, index) => (index === existingIndex ? question : candidate));
}

export class StaleQuestionError extends Error {
  readonly statusCode = 409;
}
