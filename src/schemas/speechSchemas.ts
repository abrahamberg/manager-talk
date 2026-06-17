import { z } from 'zod';

export const SpeechRequestSchema = z.object({
  text: z.string().min(1).max(4096)
});

export type SpeechRequest = z.infer<typeof SpeechRequestSchema>;
