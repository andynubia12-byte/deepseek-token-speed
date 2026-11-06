import { observe, streamParser } from './stream.js';

const channel = 'deepseek-token-speed/v1';
let nextId = 0;

function isCompletion(input) {
  try {
    const url = new URL(input instanceof Request ? input.url : input, location.href);
    return url.origin === location.origin &&
      /^\/api\/v0\/chat\/(completion|regenerate|continue)$/.test(url.pathname);
  } catch {
    return false;
  }
}

function measure() {
  const id = ++nextId;
  const start = performance.now();
  const send = (kind, detail = {}) => window.postMessage({ channel, kind, id, ...detail }, location.origin);
  let first;
  let last;
  let fragments;
  let timer;
  let searchStarted;
  let searchTotal = 0;
  let searchAtFirst;
  let searchWithinOutput = 0;

  function searchElapsed(time) {
    return searchTotal + (searchStarted === undefined ? 0 : time - searchStarted);
  }
  send('start');

  function flush() {
    clearTimeout(timer);
    timer = undefined;
    if (!fragments) return;
    send('sample', {
      first: first - start,
      span: Math.max(0, last - first - searchWithinOutput),
      search: searchWithinOutput,
      answer: fragments.filter(f => f.type === 'RESPONSE').map(f => f.content).join(''),
      think: fragments.filter(f => f.type === 'THINK').map(f => f.content).join(''),
    });
  }

  return {
    onSearch(active, time) {
      if (active) searchStarted ??= time;
      else if (searchStarted !== undefined) {
        searchTotal += time - searchStarted;
        searchStarted = undefined;
      }
    },
    onText(current, time) {
      if (!current.some(f => f.content && (f.type === 'RESPONSE' || f.type === 'THINK'))) return;
      first ??= time;
      searchAtFirst ??= searchElapsed(time);
      searchWithinOutput = searchElapsed(time) - searchAtFirst;
      last = time;
      fragments = current;
      timer ??= setTimeout(flush, 400);
    },
    end(failed = false) {
      flush();
      send('end', { failed: failed || first === undefined });
    },
  };
}

const originalFetch = window.fetch;
window.fetch = function (...args) {
  const request = originalFetch.apply(this, args);
  if (!isCompletion(args[0])) return request;
  const measurement = measure();
  void request.then(async response => {
    if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream') || !response.body) {
      measurement.end(true);
      return;
    }
    try {
      await observe(response.clone().body, measurement.onText, measurement.onSearch);
      measurement.end();
    } catch {
      measurement.end(true);
    }
  }, () => measurement.end(true)).catch(() => {});
  return request;
};

const xhrOpen = XMLHttpRequest.prototype.open;
const xhrSend = XMLHttpRequest.prototype.send;
const completions = new WeakSet();

XMLHttpRequest.prototype.open = function (method, url, ...rest) {
  const result = xhrOpen.call(this, method, url, ...rest);
  if (isCompletion(url)) completions.add(this);
  else completions.delete(this);
  return result;
};

XMLHttpRequest.prototype.send = function (...args) {
  if (!completions.has(this)) return xhrSend.apply(this, args);
  const measurement = measure();
  const write = streamParser(measurement.onText, measurement.onSearch);
  let offset = 0;
  let done = false;

  const read = (final = false) => {
    if (done || (this.responseType !== '' && this.responseType !== 'text')) return;
    const body = this.responseText;
    done = write(body.slice(offset), performance.now(), final);
    offset = body.length;
  };

  const progress = () => {
    try { read(); } catch { done = true; }
  };
  const finish = (event) => {
    this.removeEventListener('progress', progress);
    this.removeEventListener('loadend', finish);
    let failed = !event || this.status < 200 || this.status >= 300;
    try { if (!failed) read(true); } catch { failed = true; }
    measurement.end(failed);
  };

  this.addEventListener('progress', progress);
  this.addEventListener('loadend', finish);
  try {
    return xhrSend.apply(this, args);
  } catch (error) {
    finish();
    throw error;
  }
};
