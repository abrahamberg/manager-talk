import { z } from 'zod';

export const QuestionSelectionSchema = z.object({
  level: z.number().int().min(1),
  questionId: z.string().min(1),
  questionText: z.string().min(1),
  answerFormatSummary: z.string().min(1),
  expectedPattern: z.string().min(1),
  reasonForSelection: z.string().min(1),
  isIntentionalRepeat: z.boolean()
});

export const FeedbackEvaluationSchema = z.object({
  level: z.number().int().min(1),
  questionId: z.string().min(1),
  questionText: z.string().min(1),
  isGoodAnswer: z.boolean(),
  score: z.number().int().min(1).max(5),
  feedbackToUser: z.string().min(1),
  missingElements: z.array(z.string()),
  improvedAnswer: z.string().min(1),
  compactStateSummary: z.string().min(1),
  coachingFocus: z.string().min(1),
  improvementStrategy: z.string().min(1),
  shouldRepeatQuestion: z.boolean(),
  nextLevelRecommended: z.boolean(),
  nextQuestion: QuestionSelectionSchema.nullable()
});

export type FeedbackEvaluationOutput = z.infer<typeof FeedbackEvaluationSchema>;
