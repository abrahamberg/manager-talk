import OpenAI from 'openai';
import { getOpenAiApiKey, openAiModel, openAiServiceTier } from '../config.js';
import { FeedbackEvaluationSchema, QuestionSelectionSchema } from '../schemas/llmSchemas.js';
import { extractChatUsage, writeLlmLog } from './llmLogService.js';
import type { ChatMessage, FeedbackEvaluation, QuestionSelection } from '../types/coach.js';

export async function selectQuestion(messages: ChatMessage[]): Promise<QuestionSelection> {
  const json = await requestJson('select-question', messages);

  return QuestionSelectionSchema.parse(json);
}

export async function evaluateAnswer(messages: ChatMessage[]): Promise<FeedbackEvaluation> {
  const json = await requestJson('evaluate-answer', messages);
  const evaluation = FeedbackEvaluationSchema.parse(json);

  return normalizeEvaluationScore(evaluation);
}

export async function answerFollowUp(messages: ChatMessage[]): Promise<string> {
  return requestText('follow-up', messages);
}

async function requestJson(task: string, messages: ChatMessage[]): Promise<unknown> {
  const firstResponse = await requestText(task, messages, { json: true });

  try {
    return JSON.parse(firstResponse);
  } catch {
    const repairedResponse = await requestText(`${task}-json-repair`, [...messages, buildJsonRepairMessage(firstResponse)], { json: true });

    return JSON.parse(repairedResponse);
  }
}

async function requestText(task: string, messages: ChatMessage[], options: { json?: boolean } = {}): Promise<string> {
  const client = new OpenAI({ apiKey: getOpenAiApiKey() });
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();

  try {
    const response = await client.chat.completions.create({
      model: openAiModel,
      temperature: 0.2,
      messages,
      service_tier: openAiServiceTier,
      response_format: options.json ? { type: 'json_object' } : undefined
    });

    const content = response.choices[0]?.message.content;

    await writeLlmLog({
      task,
      model: openAiModel,
      serviceTier: openAiServiceTier,
      responseFormat: options.json ? 'json' : 'text',
      messages,
      output: content ?? null,
      usage: extractChatUsage(response),
      error: null,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs
    });

    if (!content) {
      throw new Error('LLM returned an empty response.');
    }

    return content;
  } catch (error) {
    await writeLlmLog({
      task,
      model: openAiModel,
      serviceTier: openAiServiceTier,
      responseFormat: options.json ? 'json' : 'text',
      messages,
      output: null,
      usage: null,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs
    });

    throw error;
  }
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
