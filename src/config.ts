import 'dotenv/config';

export const port = Number(process.env.PORT ?? 3000);
export const openAiModel = process.env.OPENAI_MODEL ?? 'gpt-5.4-mini';
export const openAiServiceTier = parseOpenAiServiceTier(process.env.OPENAI_SERVICE_TIER);
export const openAiTtsModel = process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts';
export const openAiTtsVoice = process.env.OPENAI_TTS_VOICE ?? 'marin';
export const trainingDir = process.env.TRAINING_DIR ?? '/workspaces/manager-talk';
export const llmLogDir = `${trainingDir}/LLM_log`;

type OpenAiServiceTier = 'auto' | 'default' | 'flex' | 'scale' | 'priority';

export function getOpenAiApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for LLM calls.');
  }

  return apiKey;
}

function parseOpenAiServiceTier(value: string | undefined): OpenAiServiceTier {
  if (value === 'auto' || value === 'default' || value === 'flex' || value === 'scale' || value === 'priority') {
    return value;
  }

  return 'flex';
}
