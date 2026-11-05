import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSseParser } from './sse.ts';

test('events come out whole, however the text was cut', () => {
  const text = 'retry: 3000\n\nevent: hello\ndata: {"a":1}\n\n: ping\n\nevent: message\nid: 7\ndata: {"text":"salut"}\n\n';
  for (const size of [1, 2, 3, 5, 8, 13, text.length]) {
    const parse = createSseParser();
    const frames = [];
    for (let i = 0; i < text.length; i += size) frames.push(...parse(text.slice(i, i + size)));
    assert.deepEqual(frames, [
      { event: 'hello', data: { a: 1 } },
      { event: 'message', id: '7', data: { text: 'salut' } },
    ]);
  }
});

test('CRLF line ends, a missing space after the colon, and an event that is not finished yet', () => {
  const parse = createSseParser();
  assert.deepEqual(parse('event: presence\r\ndata:{"x":true}\r\n\r\nevent: mess'), [{ event: 'presence', data: { x: true } }]);
  assert.deepEqual(parse('age\ndata: 1\n\n'), [{ event: 'message', data: 1 }]);
});

test('what is not an event of ours is left out: no data, data that is not JSON', () => {
  const parse = createSseParser();
  assert.deepEqual(parse('event: x\n\n: only a comment\n\ndata: not json\n\nretry: 5\n\n'), []);
  assert.deepEqual(parse('data: {"ok":1}\n\n'), [{ event: 'message', data: { ok: 1 } }]); // and it keeps going afterwards
});

test('data on several lines is one JSON text', () => {
  assert.deepEqual(createSseParser()('event: x\ndata: {"a":\ndata: 2}\n\n'), [{ event: 'x', data: { a: 2 } }]);
});
