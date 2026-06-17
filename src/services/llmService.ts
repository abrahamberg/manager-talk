import OpenAI from 'openai';
import { getOpenAiApiKey, openAiModel, openAiServiceTier } from '../config.js';
import { FeedbackEvaluationSchema, QuestionSelectionSchema } from '../schemas/llmSchemas.js';
import type { ChatMessage, FeedbackEvaluation, QuestionSelection } from '../types/coach.js';

export async function selectQuestion(messages: ChatMessage[]): Promise<QuestionSelection> {
  const json = await requestJson(messages);

  return QuestionSelectionSchema.parse(json);
}

export async function evaluateAnswer(messages: ChatMessage[]): Promise<FeedbackEvaluation> {
  const json = await requestJson(messages);
  const evaluation = FeedbackEvaluationSchema.parse(json);

  return normalizeEvaluationScore(evaluation);
}

export async function answerFollowUp(messages: ChatMessage[]): Promise<string> {
  return requestText(messages);
}

async function requestJson(messages: ChatMessage[]): Promise<unknown> {
  const firstResponse = await requestText(messages, { json: true });

  try {
    return JSON.parse(firstResponse);
  } catch {
    const repairedResponse = await requestText([...messages, buildJsonRepairMessage(firstResponse)], { json: true });

    return JSON.parse(repairedResponse);
  }
}

async function requestText(messages: ChatMessage[], options: { json?: boolean } = {}): Promise<string> {
  const client = new OpenAI({ apiKey: getOpenAiApiKey() });
  const response = await client.chat.completions.create({
    model: openAiModel,
    temperature: 0.2,
    messages,
    service_tier: openAiServiceTier,
    response_format: options.json ? { type: 'json_object' } : undefined
  });

  const content = response.choices[0]?.message.content;

  if (!content) {
    throw new Error('LLM returned an empty response.');
  }

  return content;
}

function buildJsonRepairMessage(invalidJson: string): ChatMessage {
  return {
    role: 'user',
    content: `The previous response was not valid JSON. Return only valid JSON for the requested schema. Previous response: ${invalidJson}`
  };
}

function normalizeEvaluationScore(evaluation: FeedbackEvaluation): FeedbackEvaluation {
  return {
    ...evaluation,
    isGoodAnswer: evaluation.score >= 4
  };
}
