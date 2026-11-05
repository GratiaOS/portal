/**
 * @gratiaos/llm-provider
 * Whisper: "bring your own mind; the room only listens."
 *
 * A tiny streaming client for any OpenAI-compatible chat-completions endpoint
 * (company gateway, LM Studio, vLLM, OpenRouter, Ollama's /v1 ...). No
 * dependencies, just `fetch`. Thinking models are first-class: reasoning and
 * answer arrive as separate events, so a UI can show "thinking…" without ever
 * mixing the thoughts into the answer.
 */

export * from './types.js';
export * from './chat-completions.js';
