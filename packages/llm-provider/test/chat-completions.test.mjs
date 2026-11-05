import assert from 'node:assert/strict';
import { createChatCompletionsProvider, LlmError } from '../dist/index.js';

const enc = new TextEncoder();

// A fake fetch: records the request and answers with the given pieces of bytes, however they were cut.
function fakeFetch(pieces, { status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const stream = new ReadableStream({
      start(controller) {
        for (const piece of pieces) controller.enqueue(enc.encode(piece));
        controller.close();
      },
    });
    return new Response(stream, { status });
  };
  return { fetchImpl, calls };
}

const sse = (obj) => `data: ${typeof obj === 'string' ? obj : JSON.stringify(obj)}\n\n`;
const delta = (d, finish = null) => ({ model: 'm-1', choices: [{ delta: d, finish_reason: finish }] });

const thinkingStream = [
  sse(delta({ role: 'assistant' })),
  sse(delta({ reasoning_content: 'Let me ' })),
  sse(delta({ reasoning_content: 'think.' })),
  sse(delta({ content: '\n\nAmbrosia is ' })),
  sse(delta({ content: 'a food.\n' }, 'stop')),
  sse({
    choices: [],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 40,
      prompt_tokens_details: { cached_tokens: 90 },
      completion_tokens_details: { reasoning_tokens: 30 },
    },
  }),
  sse('[DONE]'),
];

// Reasoning and answer arrive as separate events; the result is trimmed and carries usage.
{
  const { fetchImpl, calls } = fakeFetch(thinkingStream);
  const llm = createChatCompletionsProvider({
    baseUrl: 'https://host/v1/',
    model: 'auto',
    apiKey: 'k-secret',
    maxTokens: 4000,
    reasoningEffort: 'low',
    headers: { 'X-Team': 'olympus' },
    body: { chat_template_kwargs: { enable_thinking: false } },
    fetch: fetchImpl,
  });
  const events = [];
  for await (const event of llm.stream({ system: 'Be terse.', messages: [{ role: 'user', content: 'Ambrosia?' }] })) events.push(event);

  assert.deepEqual(
    events.map((e) => e.type),
    ['reasoning', 'reasoning', 'content', 'content', 'done'],
  );
  assert.equal(events[0].text, 'Let me ');
  assert.equal(events[2].text, '\n\nAmbrosia is '); // chunks stay raw

  const { result } = events.at(-1);
  assert.equal(result.content, 'Ambrosia is a food.');
  assert.equal(result.reasoning, 'Let me think.');
  assert.equal(result.finishReason, 'stop');
  assert.equal(result.model, 'm-1');
  assert.deepEqual(result.usage, { promptTokens: 100, cachedTokens: 90, completionTokens: 40, reasoningTokens: 30 });

  const [{ url, init, body }] = calls;
  assert.equal(url, 'https://host/v1/chat/completions');
  assert.equal(init.headers.Authorization, 'Bearer k-secret');
  assert.equal(init.headers['X-Team'], 'olympus');
  assert.equal(body.model, 'auto');
  assert.equal(body.stream, true);
  assert.deepEqual(body.stream_options, { include_usage: true });
  assert.equal(body.max_tokens, 4000);
  assert.equal(body.reasoning_effort, 'low');
  assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
  assert.deepEqual(body.messages, [
    { role: 'system', content: 'Be terse.' },
    { role: 'user', content: 'Ambrosia?' },
  ]);
}

// generate() is stream() run to the end; a request can override maxTokens.
{
  const { fetchImpl, calls } = fakeFetch(thinkingStream);
  const llm = createChatCompletionsProvider({ baseUrl: 'https://host/v1', model: 'auto', maxTokens: 10, fetch: fetchImpl });
  const result = await llm.generate({ messages: [{ role: 'user', content: 'Ambrosia?' }], maxTokens: 50 });
  assert.equal(result.content, 'Ambrosia is a food.');
  assert.equal(calls[0].body.max_tokens, 50);
}

// No key, no Authorization header; no optional fields are sent when they are not set.
{
  const { fetchImpl, calls } = fakeFetch([sse(delta({ content: 'hi' }, 'stop')), sse('[DONE]')]);
  const llm = createChatCompletionsProvider({ baseUrl: 'http://localhost:11434/v1', model: 'llama', includeUsage: false, fetch: fetchImpl });
  await llm.generate({ messages: [{ role: 'user', content: 'hi' }] });
  const [{ init, body }] = calls;
  assert.equal('Authorization' in init.headers, false);
  for (const key of ['max_tokens', 'reasoning_effort', 'stream_options']) assert.equal(key in body, false, key);
}

// The `reasoning` field name (gpt-oss, OpenRouter) is understood too.
{
  const { fetchImpl } = fakeFetch([sse(delta({ reasoning: 'hm' })), sse(delta({ content: 'ok' }, 'stop')), sse('[DONE]')]);
  const llm = createChatCompletionsProvider({ baseUrl: 'https://host/v1', model: 'm', fetch: fetchImpl });
  const result = await llm.generate({ messages: [{ role: 'user', content: 'x' }] });
  assert.equal(result.reasoning, 'hm');
  assert.equal(result.content, 'ok');
}

// Bytes may be cut anywhere, even inside a character, and lines may end in CRLF.
{
  const whole = enc.encode(
    [sse(delta({ content: 'ă' })), sse(delta({ content: 'b' }, 'stop')), sse('[DONE]')].join('').replaceAll('\n', '\r\n'),
  );
  const pieces = [];
  for (let i = 0; i < whole.length; i += 7) pieces.push(whole.slice(i, i + 7));
  const cut = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          for (const piece of pieces) controller.enqueue(piece);
          controller.close();
        },
      }),
    );
  const llm = createChatCompletionsProvider({ baseUrl: 'https://host/v1', model: 'm', fetch: cut });
  assert.equal((await llm.generate({ messages: [{ role: 'user', content: 'x' }] })).content, 'ăb');
}

// A server that closes without [DONE] and without a final newline still delivers what it sent.
{
  const { fetchImpl } = fakeFetch([sse(delta({ content: 'a' })), `data: ${JSON.stringify(delta({ content: 'b' }, 'length'))}`]);
  const llm = createChatCompletionsProvider({ baseUrl: 'https://host/v1', model: 'm', fetch: fetchImpl });
  const result = await llm.generate({ messages: [{ role: 'user', content: 'x' }] });
  assert.equal(result.content, 'ab');
  assert.equal(result.finishReason, 'length'); // the answer was cut by the token limit
}

// An HTTP error becomes an LlmError with the status and the start of the body, never the key.
{
  const fetchImpl = async () => new Response('{"error":"bad key"}', { status: 401 });
  const llm = createChatCompletionsProvider({ baseUrl: 'https://host/v1', model: 'm', apiKey: 'k-secret', fetch: fetchImpl });
  await assert.rejects(llm.generate({ messages: [] }), (err) => {
    assert.ok(err instanceof LlmError);
    assert.equal(err.status, 401);
    assert.equal(err.body, '{"error":"bad key"}');
    assert.equal(err.message.includes('k-secret'), false);
    return true;
  });
}

// An error object inside the stream is an LlmError too.
{
  const { fetchImpl } = fakeFetch([sse({ error: { message: 'model not loaded' } })]);
  const llm = createChatCompletionsProvider({ baseUrl: 'https://host/v1', model: 'm', fetch: fetchImpl });
  await assert.rejects(llm.generate({ messages: [] }), /model not loaded/);
}

// A request that never answers ends as an LlmError timeout.
// (A real fetch holds a socket open; the fake one needs something to keep the process alive.)
const keepAlive = setInterval(() => undefined, 1000);
const hangs = (_url, init) =>
  new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
{
  const llm = createChatCompletionsProvider({ baseUrl: 'https://host/v1', model: 'm', timeoutMs: 20, fetch: hangs });
  await assert.rejects(llm.generate({ messages: [] }), (err) => err instanceof LlmError && /timed out after 20 ms/.test(err.message));
}

// An abort from the caller is not dressed up: it reaches the caller as an abort.
{
  const llm = createChatCompletionsProvider({ baseUrl: 'https://host/v1', model: 'm', fetch: hangs });
  const controller = new AbortController();
  const pending = llm.generate({ messages: [], signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (err) => !(err instanceof LlmError) && err.name === 'AbortError');
}

clearInterval(keepAlive);
console.log('llm-provider: ok');
