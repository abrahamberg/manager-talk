import { z } from 'zod';

export const NextQuestionRequestSchema = z.object({
  forceNew: z.boolean().optional().default(false)
});

export const AnswerRequestSchema = z.object({
  level: z.number().int().min(1),
  questionId: z.string().min(1),
  questionText: z.string().min(1),
  answerText: z.string().min(1)
});

export const FollowUpRequestSchema = z.object({
  roundContext: z.object({
    level: z.number().int().min(1),
    questionText: z.string().min(1),
    answerText: z.string().min(1),
    feedbackToUser: z.string().min(1)
  }),
  message: z.string().min(1)
});

export type NextQuestionRequest = z.infer<typeof NextQuestionRequestSchema>;
export type AnswerRequest = z.infer<typeof AnswerRequestSchema>;
export type FollowUpRequest = z.infer<typeof FollowUpRequestSchema>;
