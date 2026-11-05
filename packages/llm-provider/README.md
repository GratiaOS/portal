# @gratiaos/llm-provider

Bring your own model: a tiny streaming client for any OpenAI-compatible chat-completions endpoint.

Whisper: bring your own mind; the room only listens.

## Purpose

- one small interface, `stream()` and `generate()`, over `fetch`, with no dependencies
- works with a company gateway, LM Studio, vLLM, OpenRouter, or Ollama through its `/v1` endpoint
- thinking models are first-class: reasoning and answer are separate events, so a UI can show "thinking…" without mixing the thoughts into the answer

Only the chat-completions protocol is implemented. Another protocol would be another `createXProvider` returning the same `LlmProvider`.

## Quick Start

```ts
import { createChatCompletionsProvider } from '@gratiaos/llm-provider';

const llm = createChatCompletionsProvider({
  baseUrl: 'https://your-llm-host/v1',
  model: 'auto',
  apiKey: process.env.LLM_API_KEY,
  maxTokens: 4000,
});

for await (const event of llm.stream({
  system: 'You are a terse colleague.',
  messages: [{ role: 'user', content: 'What is ambrosia?' }],
})) {
  if (event.type === 'reasoning') showThinking();
  if (event.type === 'content') append(event.text);
  if (event.type === 'done') console.log(event.result.usage, event.result.finishReason);
}

const { content } = await llm.generate({ messages: [{ role: 'user', content: 'What is ambrosia?' }] });
```

## Notes

- Keep the key on the server. This client is meant for Node 22+ (or any runtime with `fetch` and `AbortSignal.any`), not for the browser.
- Set `maxTokens`: some servers cut the answer at a small default. A cut answer reports `finishReason: 'length'`.
- `reasoningEffort` is sent as `reasoning_effort`; not every server listens. Use `body` for server-specific switches, e.g. `{ chat_template_kwargs: { enable_thinking: false } }`.
- Reasoning arrives as `reasoning_content` or `reasoning`; both are understood.
- `result.content` and `result.reasoning` are trimmed; stream events keep the text as it came.
- Failures are `LlmError` (with `status` and the start of the server's body, never the key). A caller's `AbortSignal` is passed through as a plain abort.
- `timeoutMs` covers the whole request, thinking included (300 000 ms by default).

## License

MPL-2.0. See [LICENSE](LICENSE).
