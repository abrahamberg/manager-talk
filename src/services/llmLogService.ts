import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { llmLogDir } from '../config.js';
import type { ChatMessage } from '../types/coach.js';

interface LlmLogUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
}

interface LlmLogEntry {
  task: string;
  model: string;
  serviceTier: string;
  responseFormat: 'json' | 'text';
  messages: ChatMessage[];
  output: string | null;
  usage: LlmLogUsage | null;
  error: string | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

export async function writeLlmLog(entry: LlmLogEntry): Promise<void> {
  await mkdir(llmLogDir, { recursive: true });
  await writeFile(getLogPath(entry), formatLog(entry), 'utf8');
}

export function extractChatUsage(response: unknown): LlmLogUsage | null {
  const usage = getObjectValue(response, 'usage');

  if (!usage) {
    return null;
  }

  const promptTokensDetails = getObjectValue(usage, 'prompt_tokens_details');

  return {
    inputTokens: getNumberValue(usage, 'prompt_tokens'),
    outputTokens: getNumberValue(usage, 'completion_tokens'),
    totalTokens: getNumberValue(usage, 'total_tokens'),
    cachedInputTokens: promptTokensDetails ? getNumberValue(promptTokensDetails, 'cached_tokens') : null
  };
}

function getLogPath(entry: LlmLogEntry): string {
  return path.join(llmLogDir, `${toFileTimestamp(entry.startedAt)}-${slugify(entry.task)}.md`);
}

function formatLog(entry: LlmLogEntry): string {
  return [
    `# LLM Call: ${entry.task}`,
    '',
    `Started At: ${entry.startedAt}`,
    `Completed At: ${entry.completedAt}`,
    `Duration Ms: ${entry.durationMs}`,
    `Model: ${entry.model}`,
    `Service Tier: ${entry.serviceTier}`,
    `Response Format: ${entry.responseFormat}`,
    '',
    '## Token Usage',
    '',
    `Input Tokens: ${entry.usage?.inputTokens ?? 'not reported'}`,
    `Output Tokens: ${entry.usage?.outputTokens ?? 'not reported'}`,
    `Total Tokens: ${entry.usage?.totalTokens ?? 'not reported'}`,
    `Cached Input Tokens: ${entry.usage?.cachedInputTokens ?? 'not reported'}`,
    '',
    '## Task Summary',
    '',
    ...formatTaskSummary(entry.messages),
    '',
    '## Thinking',
    '',
    'Hidden model reasoning is not exposed by the OpenAI API, so this log cannot include private chain-of-thought. Review the input, output, and token usage instead.',
    '',
    '## Input Messages',
    '',
    ...formatMessages(entry.messages),
    '',
    '## Output',
    '',
    '```text',
    entry.output ?? '',
    '```',
    '',
    '## Error',
    '',
    '```text',
    entry.error ?? '',
    '```',
    ''
  ].join('\n');
}

function formatTaskSummary(messages: ChatMessage[]): string[] {
  const taskMessage = messages.at(-1)?.content ?? '';
  const fields = [
    ['Task', extractLine(taskMessage, 'TASK')],
    ['Level', extractLine(taskMessage, 'Level')],
    ['Required Structure', extractLine(taskMessage, 'Required structure')],
    ['Question', extractLine(taskMessage, 'Question')],
    ['User Answer', extractBlockValue(taskMessage, 'User answer')],
    ['Follow-up Question', extractLine(taskMessage, 'Follow-up question')]
  ].filter(([, value]) => value);

  if (fields.length === 0) {
    return ['No task summary extracted.'];
  }

  return fields.map(([label, value]) => `- ${label}: ${value}`);
}

function formatMessages(messages: ChatMessage[]): string[] {
  return messages.flatMap((message, index) => [
    `### Message ${index + 1}: ${message.role}`,
    '',
    '```text',
    message.content,
    '```',
    ''
  ]);
}

function extractLine(content: string, label: string): string {
  const match = content.match(new RegExp(`^${escapeRegExp(label)}:\\s*(.+)$`, 'im'));

  return match?.[1]?.trim() ?? '';
}

function extractBlockValue(content: string, label: string): string {
  const escapedLabel = escapeRegExp(label);
  const match = content.match(new RegExp(`^${escapedLabel}:\\s*([\\s\\S]*?)(?:\\n\\n|$)`, 'im'));

  return match?.[1]?.trim().replace(/\s+/g, ' ') ?? '';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getObjectValue(value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const child = record[key];

  return child && typeof child === 'object' ? (child as Record<string, unknown>) : null;
}

function getNumberValue(value: Record<string, unknown>, key: string): number | null {
  const child = value[key];

  return typeof child === 'number' ? child : null;
}

function toFileTimestamp(value: string): string {
  return value.replace(/[:.]/g, '-');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
