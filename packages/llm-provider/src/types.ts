export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type GenerateRequest = {
  /** Prepended as the system message. */
  system?: string;
  messages: ChatMessage[];
  /** Overrides the provider's `maxTokens` for this call. */
  maxTokens?: number;
  /** Abort from the caller; a timeout is reported separately as `LlmError`. */
  signal?: AbortSignal;
};

export type Usage = {
  promptTokens?: number;
  /** Prompt tokens served from the server's prefix cache. */
  cachedTokens?: number;
  completionTokens?: number;
  /** Part of `completionTokens` spent thinking. */
  reasoningTokens?: number;
};

/** `length` means the answer was cut by the token limit. */
export type FinishReason = 'stop' | 'length' | 'other';

export type GenerateResult = {
  /** The answer, trimmed. */
  content: string;
  /** What the model thought before answering, trimmed. Empty when the model does not think. */
  reasoning: string;
  usage: Usage;
  finishReason: FinishReason;
  model?: string;
};

export type StreamEvent =
  | { type: 'reasoning'; text: string }
  | { type: 'content'; text: string }
  | { type: 'done'; result: GenerateResult };

export interface LlmProvider {
  /** Streams reasoning and content as they arrive; the last event is always `done`. */
  stream(request: GenerateRequest): AsyncGenerator<StreamEvent, void, undefined>;
  /** Runs `stream` to the end and returns the final result. */
  generate(request: GenerateRequest): Promise<GenerateResult>;
}

export class LlmError extends Error {
  readonly status?: number;
  /** Start of the server's error body, when there was one. Never contains the API key. */
  readonly body?: string;

  constructor(message: string, details: { status?: number; body?: string } = {}) {
    super(message);
    this.name = 'LlmError';
    this.status = details.status;
    this.body = details.body;
  }
}
