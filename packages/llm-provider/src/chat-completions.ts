import { LlmError } from './types.js';
import type { FinishReason, GenerateRequest, GenerateResult, LlmProvider, StreamEvent, Usage } from './types.js';

export type ChatCompletionsConfig = {
  /** Up to and including the version, e.g. `https://host/v1` or `http://localhost:11434/v1`. */
  baseUrl: string;
  model: string;
  apiKey?: string;
  /** Set it: some servers cap the answer at a small default (a cut answer reports `finishReason: 'length'`). */
  maxTokens?: number;
  /** Sent as `reasoning_effort`. Not every server listens to it. */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /** Whole request, thinking included. Defaults to 300 000 ms. */
  timeoutMs?: number;
  /** Extra headers, e.g. for a company gateway. */
  headers?: Record<string, string>;
  /** Extra body fields, merged last, e.g. `{ chat_template_kwargs: { enable_thinking: false } }`. */
  body?: Record<string, unknown>;
  /** Ask the server to report token usage at the end of the stream. Turn off for servers that reject it. Defaults to true. */
  includeUsage?: boolean;
  fetch?: typeof fetch;
};

type RawUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
};

type RawChunk = {
  model?: string;
  usage?: RawUsage | null;
  error?: { message?: string };
  choices?: {
    finish_reason?: string | null;
    delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null };
  }[];
};

const DEFAULT_TIMEOUT_MS = 300_000;

function mapUsage(raw: RawUsage): Usage {
  return {
    promptTokens: raw.prompt_tokens,
    cachedTokens: raw.prompt_tokens_details?.cached_tokens,
    completionTokens: raw.completion_tokens,
    reasoningTokens: raw.completion_tokens_details?.reasoning_tokens,
  };
}

function mapFinish(raw: string): FinishReason {
  return raw === 'stop' ? 'stop' : raw === 'length' ? 'length' : 'other';
}

/** The `data:` payloads of a server-sent-events body, whatever way the bytes were cut. */
async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const dataOf = (line: string) => (line.startsWith('data:') ? line.slice(5).trim() : null);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let end = buffer.indexOf('\n');
      while (end >= 0) {
        const data = dataOf(buffer.slice(0, end).replace(/\r$/, ''));
        buffer = buffer.slice(end + 1);
        if (data !== null) yield data;
        end = buffer.indexOf('\n');
      }
    }
    const tail = dataOf((buffer + decoder.decode()).replace(/\r$/, ''));
    if (tail !== null) yield tail;
  } finally {
    void reader.cancel().catch(() => undefined);
  }
}

export function createChatCompletionsProvider(config: ChatCompletionsConfig): LlmProvider {
  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = config.fetch ?? fetch;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    ...config.headers,
  };

  async function* stream(request: GenerateRequest): AsyncGenerator<StreamEvent, void, undefined> {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
    const maxTokens = request.maxTokens ?? config.maxTokens;

    const messages = request.system
      ? [{ role: 'system' as const, content: request.system }, ...request.messages]
      : request.messages;

    const body = {
      model: config.model,
      messages,
      stream: true,
      ...(config.includeUsage === false ? {} : { stream_options: { include_usage: true } }),
      ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
      ...(config.reasoningEffort ? { reasoning_effort: config.reasoningEffort } : {}),
      ...config.body,
    };

    // A timeout is ours to report; an abort from the caller goes back to the caller as it came.
    const fail = (err: unknown): unknown =>
      timeout.aborted && !request.signal?.aborted ? new LlmError(`model request timed out after ${timeoutMs} ms`) : err;

    let content = '';
    let reasoning = '';
    let usage: Usage = {};
    let finishReason: FinishReason = 'other';
    let model: string | undefined;

    try {
      const res = await doFetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new LlmError(`model request failed: HTTP ${res.status}`, { status: res.status, body: detail.slice(0, 500) });
      }
      if (!res.body) throw new LlmError('model response has no body');

      for await (const data of sseData(res.body)) {
        if (data === '[DONE]') break;
        let chunk: RawChunk;
        try {
          chunk = JSON.parse(data) as RawChunk;
        } catch {
          continue; // keep-alives and anything that is not JSON
        }
        if (chunk.error) throw new LlmError(`model stream error: ${chunk.error.message ?? 'unknown'}`);

        model ??= chunk.model;
        if (chunk.usage) usage = mapUsage(chunk.usage);
        const choice = chunk.choices?.[0];
        if (choice?.finish_reason) finishReason = mapFinish(choice.finish_reason);

        const thought = choice?.delta?.reasoning_content ?? choice?.delta?.reasoning;
        if (thought) {
          reasoning += thought;
          yield { type: 'reasoning', text: thought };
        }
        const text = choice?.delta?.content;
        if (text) {
          content += text;
          yield { type: 'content', text };
        }
      }
    } catch (err) {
      throw fail(err);
    }

    const result: GenerateResult = { content: content.trim(), reasoning: reasoning.trim(), usage, finishReason, model };
    yield { type: 'done', result };
  }

  async function generate(request: GenerateRequest): Promise<GenerateResult> {
    let result: GenerateResult | undefined;
    for await (const event of stream(request)) {
      if (event.type === 'done') result = event.result;
    }
    if (!result) throw new LlmError('model stream ended without a result');
    return result;
  }

  return { stream, generate };
}
