export type EvaluationValue = 'good' | 'needs_improvement' | 'repeated_for_practice';

export interface CurrentQuestion {
  id: string;
  text: string;
  answerFormatSummary: string | null;
  expectedPattern: string | null;
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

export interface StaticCoachFiles {
  definition: string;
  courseSchema: string;
  levelInputs: string;
  stateMarkdown: string;
}

export interface QuestionSelection {
  level: number;
  questionId: string;
  questionText: string;
  answerFormatSummary: string;
  expectedPattern: string;
  reasonForSelection: string;
  isIntentionalRepeat: boolean;
}

export interface FeedbackEvaluation {
  level: number;
  questionId: string;
  questionText: string;
  isGoodAnswer: boolean;
  score: number;
  feedbackToUser: string;
  missingElements: string[];
  improvedAnswer: string;
  stateSummaryUpdate: string;
  shouldRepeatQuestion: boolean;
  nextLevelRecommended: boolean;
}

export interface RoundContext {
  level: number;
  questionText: string;
  answerText: string;
  feedbackToUser: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
