// Smoke test for a chat-completions endpoint (the model you bring).
// Run: node --env-file=.env scripts/smoke.mjs
// Prints the shape of the response, never the key.

const base = (process.env.PORTAL_LLM_BASE_URL || '').replace(/\/+$/, '');
const model = process.env.PORTAL_LLM_MODEL || 'auto';
const key = process.env.PORTAL_LLM_API_KEY || '';
const effort = process.env.PORTAL_LLM_REASONING_EFFORT || '';

if (!base || base.includes('your-llm-host') || !key) {
  console.error('Missing config. Copy .env.example to .env and set PORTAL_LLM_BASE_URL and PORTAL_LLM_API_KEY.');
  process.exit(1);
}

const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
const messages = [
  { role: 'system', content: 'You are a terse colleague in a team chat.' },
  { role: 'user', content: 'Reply with one short sentence: what is ambrosia?' },
];
const extra = effort ? { reasoning_effort: effort } : {};

async function call(body) {
  const started = Date.now();
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, ...extra, ...body }),
    signal: AbortSignal.timeout(60_000),
  });
  return { res, ms: () => Date.now() - started };
}

async function plain() {
  const { res, ms } = await call({ stream: false });
  console.log(`\n# non-stream: HTTP ${res.status} in ${ms()} ms`);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    console.log(text.slice(0, 500));
    return;
  }
  if (!res.ok) return console.log(JSON.stringify(json).slice(0, 500));
  const msg = json.choices?.[0]?.message ?? {};
  console.log('model        :', json.model);
  console.log('message keys :', Object.keys(msg).join(', '));
  console.log('content      :', (msg.content ?? '').slice(0, 300));
  if (json.usage) console.log('usage        :', JSON.stringify(json.usage));
}

async function streamed() {
  const { res, ms } = await call({ stream: true });
  console.log(`\n# stream: HTTP ${res.status}, headers in ${ms()} ms`);
  if (!res.ok || !res.body) return console.log((await res.text()).slice(0, 500));
  const deltaKeys = new Set();
  let chunks = 0;
  let first = null;
  let out = '';
  const decoder = new TextDecoder();
  let buf = '';
  for await (const part of res.body) {
    buf += decoder.decode(part, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const delta = JSON.parse(data).choices?.[0]?.delta ?? {};
        chunks += 1;
        for (const k of Object.keys(delta)) deltaKeys.add(k);
        if (delta.content) {
          first ??= ms();
          out += delta.content;
        }
      } catch {
        /* ignore keep-alives */
      }
    }
  }
  console.log('chunks       :', chunks);
  console.log('delta keys   :', [...deltaKeys].join(', '));
  console.log('first token  :', first === null ? 'n/a' : `${first} ms`);
  console.log('content      :', out.slice(0, 300));
}

try {
  await plain();
  await streamed();
} catch (err) {
  console.error('Request failed:', err instanceof Error ? err.message : err);
  process.exit(1);
}
