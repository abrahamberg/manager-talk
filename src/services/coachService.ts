import { readStaticCoachFiles, levelInputsExist, readLevelInputs } from './courseFileService.js';
import { evaluateAnswer, answerFollowUp } from './llmService.js';
import { buildFeedbackMessages, buildFollowUpMessages } from './promptBuilder.js';
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
  const levelInputs = await readLevelInputs(state.currentLevel);

  if (state.currentQuestion && !forceNew) {
    return questionFromCurrentState(state, levelInputs);
  }

  const selection = chooseFallbackQuestion(levelInputs, state);
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
  const updatedState = await applyEvaluation(state, evaluation, files.levelInputs);
  const nextQuestion = await buildResponseNextQuestion(updatedState.state);

  await writeState(updatedState.state);

  return {
    isGoodAnswer: evaluation.isGoodAnswer,
    score: evaluation.score,
    feedbackToUser: evaluation.feedbackToUser,
    improvedAnswer: evaluation.improvedAnswer,
    currentLevel: updatedState.state.currentLevel,
    consecutiveGoodAnswers: updatedState.state.consecutiveGoodAnswers,
    movedToNextLevel: updatedState.movedToNextLevel,
    nextQuestion
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

async function applyEvaluation(
  state: CoachState,
  evaluation: FeedbackEvaluation,
  levelInputs: string
): Promise<{ state: CoachState; movedToNextLevel: boolean }> {
  const askedQuestion = createAskedQuestion(state, evaluation);
  const nextState = rewriteCompactState(state, askedQuestion, evaluation);

  if (!evaluation.isGoodAnswer) {
    return { state: applyWeakAnswer(nextState, evaluation, levelInputs), movedToNextLevel: false };
  }

  return applyGoodAnswer(nextState, evaluation, levelInputs);
}

function createAskedQuestion(state: CoachState, evaluation: FeedbackEvaluation): AskedQuestion {
  const currentQuestion = state.currentQuestion;

  if (!currentQuestion) {
    throw new StaleQuestionError('No active question. Request the next question first.');
  }

  return {
    id: currentQuestion.id,
    level: state.currentLevel,
    question: currentQuestion.text,
    evaluation: evaluation.isGoodAnswer ? 'good' : 'needs_improvement',
    summary: evaluation.compactStateSummary,
    askedAt: new Date().toISOString()
  };
}

function rewriteCompactState(state: CoachState, askedQuestion: AskedQuestion, evaluation: FeedbackEvaluation): CoachState {
  return {
    ...state,
    currentStateSummary: evaluation.compactStateSummary,
    coachingFocus: evaluation.coachingFocus,
    improvementStrategy: evaluation.improvementStrategy,
    questionsAskedAlready: upsertAskedQuestion(state.questionsAskedAlready, askedQuestion),
    recentEvaluations: []
  };
}

function applyWeakAnswer(state: CoachState, evaluation: FeedbackEvaluation, levelInputs: string): CoachState {
  const selection = chooseNextQuestionAfterEvaluation(state, evaluation, levelInputs);

  return {
    ...state,
    consecutiveGoodAnswers: 0,
    nextQuestionReason: selection?.reasonForSelection ?? evaluation.improvementStrategy,
    currentQuestion: selection ? currentQuestionFromSelection(selection) : null
  };
}

async function applyGoodAnswer(
  state: CoachState,
  evaluation: FeedbackEvaluation,
  levelInputs: string
): Promise<{ state: CoachState; movedToNextLevel: boolean }> {
  const consecutiveGoodAnswers = state.consecutiveGoodAnswers + 1;

  if (consecutiveGoodAnswers < 5) {
    const selection = chooseNextQuestionAfterEvaluation({ ...state, consecutiveGoodAnswers }, evaluation, levelInputs);

    return {
      state: {
        ...state,
        consecutiveGoodAnswers,
        nextQuestionReason: selection?.reasonForSelection ?? evaluation.improvementStrategy,
        currentQuestion: selection ? currentQuestionFromSelection(selection) : null
      },
      movedToNextLevel: false
    };
  }

  return moveToNextLevelIfAvailable({ ...state, consecutiveGoodAnswers: 0, currentQuestion: null }, evaluation);
}

async function moveToNextLevelIfAvailable(state: CoachState, evaluation: FeedbackEvaluation): Promise<{ state: CoachState; movedToNextLevel: boolean }> {
  const nextLevel = state.currentLevel + 1;

  if (await levelInputsExist(nextLevel)) {
    const nextLevelState = {
      ...state,
      currentLevel: nextLevel,
      currentStateSummary: `Moved to Level ${nextLevel}. ${evaluation.compactStateSummary}`,
      coachingFocus: 'Start practicing the next level structure.',
      improvementStrategy: 'Begin with a focused question from the new level to establish baseline performance.',
      nextQuestionReason: 'First available question for the new level after progression.'
    };
    const nextLevelInputs = await readLevelInputs(nextLevel);
    const selection = chooseFallbackQuestion(nextLevelInputs, nextLevelState);

    return {
      state: {
        ...nextLevelState,
        nextQuestionReason: selection.reasonForSelection,
        currentQuestion: currentQuestionFromSelection(selection)
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

function chooseNextQuestionAfterEvaluation(state: CoachState, evaluation: FeedbackEvaluation, levelInputs: string): QuestionSelection | null {
  if (evaluation.shouldRepeatQuestion && state.currentQuestion) {
    return questionFromCurrentState({ ...state, currentQuestion: { ...state.currentQuestion, repeatIntentional: true } }, levelInputs);
  }

  if (evaluation.nextQuestion) {
    const validSelection = normalizeSelectionFromLevelFile(evaluation.nextQuestion, levelInputs, state);

    if (validSelection && !isDuplicateQuestion(validSelection, state)) {
      return validSelection;
    }
  }

  try {
    return chooseFallbackQuestion(levelInputs, state);
  } catch {
    return null;
  }
}

function currentQuestionFromSelection(selection: QuestionSelection) {
  return {
    id: selection.questionId,
    text: selection.questionText,
    answerFormatSummary: selection.answerFormatSummary,
    expectedPattern: selection.expectedPattern,
    askedAt: new Date().toISOString(),
    repeatIntentional: selection.isIntentionalRepeat
  };
}

async function buildResponseNextQuestion(state: CoachState): Promise<QuestionSelection | null> {
  if (!state.currentQuestion) {
    return null;
  }

  return questionFromCurrentState(state, await readLevelInputs(state.currentLevel));
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
