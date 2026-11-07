import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { streamParser } from '../src/stream.js';

const frame = data => `data: ${JSON.stringify(data)}\n\n`;
const think = content => ({ type: 'THINK', content });
const search = status => ({ type: 'TOOL_SEARCH', status });
const browse = status => ({ type: 'TOOL_OPEN', status });

// The site's search transitions replace the whole list; nested entries omit SET.
const flow = [
  [1000, { v: { response: { fragments: [think('A')] } } }],
  [2000, { p: 'response', o: 'BATCH', v: [{ p: 'fragments', v: [think('A'), search('WIP')] }] }],
  [5000, { p: 'response/fragments/-1', o: 'BATCH', v: [{ p: 'status', v: 'FINISHED' }] }],
  [6000, { p: 'response', o: 'BATCH', v: [{ p: 'fragments', v: [think('A'), search('FINISHED'), think('B')] }] }],
  [6500, { p: 'response', o: 'BATCH', v: [{ p: 'fragments', v: [think('A'), search('FINISHED'), think('B'), browse('WIP')] }] }],
  [7500, { p: 'response/fragments/-1/status', o: 'SET', v: 'FINISHED' }],
  [8000, { p: 'response/fragments', v: [think('A'), search('FINISHED'), think('B'), browse('FINISHED'), { type: 'RESPONSE', content: 'C' }] }],
  [9000, { p: 'response/fragments', v: [think('A'), search('FINISHED'), think('B'), browse('FINISHED'), { type: 'RESPONSE', content: 'C' }] }],
];

test('full-list replacements do not duplicate tokens or preserve stale tool states', () => {
  const text = [];
  const tools = [];
  const write = streamParser((fragments, time) => text.push({
    time,
    think: fragments.filter(f => f.type === 'THINK').map(f => f.content).join(''),
    answer: fragments.filter(f => f.type === 'RESPONSE').map(f => f.content).join(''),
  }), (active, time) => tools.push([time, active]));
  for (const [time, data] of flow) write(frame(data), time);
  assert.deepEqual(text, [
    { time: 1000, think: 'A', answer: '' },
    { time: 6000, think: 'AB', answer: '' },
    { time: 8000, think: 'AB', answer: 'C' },
  ]);
  assert.deepEqual(tools, [[1000, false], [2000, true], [5000, false], [6000, false],
    [6500, true], [7500, false], [8000, false], [9000, false]]);
});

test('abbreviated patches inherit APPEND and SET; split network chunks are supported', () => {
  let output;
  const write = streamParser(f => { output = f.map(x => x.content).join(''); }, () => {});
  const data = [
    { v: { response: { fragments: [think('A')] } } },
    { p: 'response/fragments/-1/content', o: 'APPEND', v: 'B' },
    { v: 'C' },
    { p: 'response/fragments/-1/content', o: 'SET', v: 'D' },
    { v: 'E' },
  ].map(frame).join('');
  for (let i = 0; i < data.length; i += 7) write(data.slice(i, i + 7), i);
  assert.equal(output, 'E');
});

test('first-token wait and only active tool intervals are excluded from output time', () => {
  let now = 0;
  const messages = [];
  class XHR {
    listeners = {};
    responseText = '';
    responseType = '';
    status = 200;
    open() {}
    send() {}
    addEventListener(event, fn) { this.listeners[event] = fn; }
    removeEventListener(event) { delete this.listeners[event]; }
  }
  const context = {
    XMLHttpRequest: XHR, URL, Request, location: { href: 'https://chat.deepseek.com/', origin: 'https://chat.deepseek.com' },
    performance: { now: () => now }, setTimeout: () => 1, clearTimeout: () => {},
    window: { fetch() {}, postMessage: message => messages.push(message) },
  };
  vm.runInNewContext(readFileSync(new URL('../dist/hook.js', import.meta.url), 'utf8'), context);
  const xhr = new XHR();
  xhr.open('POST', '/api/v0/chat/completion');
  xhr.send();
  for (const [time, data] of flow) {
    now = time;
    xhr.responseText += frame(data);
    xhr.listeners.progress();
  }
  now = 10000;
  xhr.listeners.loadend({});
  const sample = messages.findLast(m => m.kind === 'sample');
  assert.equal(sample.first, 1000);
  assert.equal(sample.search, 4000);
  assert.equal(sample.span, 3000);
  assert.equal(sample.think, 'AB');
  assert.equal(sample.answer, 'C');
});
