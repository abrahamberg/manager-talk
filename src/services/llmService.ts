import OpenAI from 'openai';
import { getOpenAiApiKey, openAiModel, openAiServiceTier } from '../config.js';
import { FeedbackEvaluationSchema } from '../schemas/llmSchemas.js';
import { extractChatUsage, writeLlmLog } from './llmLogService.js';
import type { ChatMessage, FeedbackEvaluation } from '../types/coach.js';

export async function evaluateAnswer(messages: ChatMessage[]): Promise<FeedbackEvaluation> {
  const json = await requestJson('evaluate-answer', messages);
  const evaluation = FeedbackEvaluationSchema.parse(json);

  return normalizeEvaluationScore(evaluation, messages);
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

function normalizeEvaluationScore(evaluation: FeedbackEvaluation, messages: ChatMessage[]): FeedbackEvaluation {
  if (isClearLevelOneActionResult(evaluation, messages)) {
    return {
      ...evaluation,
      score: Math.max(evaluation.score, 4),
      isGoodAnswer: true,
      feedbackToUser: evaluation.feedbackToUser.startsWith('Good')
        ? evaluation.feedbackToUser
        : 'Good answer. You gave a clear action and result; just clean up the wording.'
    };
  }

  return {
    ...evaluation,
    isGoodAnswer: evaluation.score >= 4
  };
}

function isClearLevelOneActionResult(evaluation: FeedbackEvaluation, messages: ChatMessage[]): boolean {
  const answer = extractUserAnswer(messages).toLowerCase();

  if (evaluation.level !== 1 || evaluation.score >= 4) {
    return false;
  }

  return hasActionPhrase(answer) && hasResultPhrase(answer);
}

function extractUserAnswer(messages: ChatMessage[]): string {
  const taskMessage = messages.at(-1)?.content ?? '';
  const match = taskMessage.match(/User answer:\s*([\s\S]*?)\n\nEvaluation rules:/);

  return match?.[1]?.trim() ?? '';
}

function hasActionPhrase(answer: string): boolean {
  return /\b(i\s+)?(prioritize|organize|prepare|follow|start|use|focus|handle|ask|share|write|check|plan|review)\b/.test(answer);
}

function hasResultPhrase(answer: string): boolean {
  return /\b(as\s+(a\s+)?re[sz]ults?|result|so\s+i|this\s+helps|then\s+i|because\s+of\s+that)\b/.test(answer);
}
