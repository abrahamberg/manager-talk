import 'dotenv/config';

export const port = Number(process.env.PORT ?? 3000);
export const openAiModel = process.env.OPENAI_MODEL ?? 'gpt-5.4-mini';
export const trainingDir = process.env.TRAINING_DIR ?? '/workspaces/manager-talk';

export function getOpenAiApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for LLM calls.');
  }

  return apiKey;
}
