import OpenAI from 'openai';
import { getOpenAiApiKey, openAiTtsModel, openAiTtsVoice } from '../config.js';

const coachVoiceInstructions = [
  'Speak like a calm communication coach.',
  'Sound natural, warm, and concise.',
  'Use clear pacing for a learner practicing interview answers.'
].join(' ');

export async function createCoachSpeech(text: string): Promise<Buffer> {
  const client = new OpenAI({ apiKey: getOpenAiApiKey() });
  const speech = await client.audio.speech.create({
    model: openAiTtsModel,
    voice: openAiTtsVoice,
    input: text,
    instructions: coachVoiceInstructions,
    response_format: 'mp3',
    speed: 0.95
  });

  return Buffer.from(await speech.arrayBuffer());
}
