// Decode the DeepSeek web client's SSE snapshot and subsequent patches.
export function streamParser(onText, onSearch) {
  let buffer = '';
  let data = [];
  let event = '';
  let path = '';
  let fragments = [];
  let receivedAt;

  function searchChanged() {
    onSearch(fragments.some(f => f.type === 'TOOL_SEARCH' && f.status === 'WIP'), receivedAt);
  }

  function add(items) {
    for (const item of items) {
      const fragment = { type: item?.type, status: item?.status, content: '' };
      fragments.push(fragment);
      if (fragment.type === 'TOOL_SEARCH') searchChanged();
      change(fragment, item?.content, 'SET');
    }
  }

  function change(fragment, text, op) {
    if (!fragment || typeof text !== 'string') return;
    const next = op === 'SET' ? text : fragment.content + text;
    if (next === fragment.content) return;
    fragment.content = next;
    if (fragment.type === 'RESPONSE' || fragment.type === 'THINK') onText(fragments, receivedAt);
  }

  function patch(target, op, value) {
    if (op === 'BATCH' && Array.isArray(value)) {
      for (const entry of value) patch([target, entry.p].filter(Boolean).join('/'), entry.o, entry.v);
    } else if (target === 'response/fragments' && Array.isArray(value)) {
      if (op === 'SET') {
        fragments = [];
        searchChanged();
      }
      add(value);
    } else {
      const match = /^response\/fragments\/(-?\d+)\/(content|status)$/.exec(target);
      if (!match) return;
      const fragment = fragments.at(Number(match[1]));
      if (match[2] === 'status' && fragment?.type === 'TOOL_SEARCH' && typeof value === 'string') {
        fragment.status = value;
        searchChanged();
      } else if (match[2] === 'content' && (!op || op === 'APPEND' || op === 'SET')) {
        change(fragment, value, op);
      }
    }
  }

  function frame() {
    const payload = data.join('\n');
    const type = event;
    data = [];
    event = '';
    if (payload === '[DONE]' || type === 'close') return true;
    if (!payload) return false;
    let message;
    try { message = JSON.parse(payload); } catch { return false; }
    const snapshot = message?.v?.response?.fragments;
    if (Array.isArray(snapshot)) {
      fragments = [];
      searchChanged();
      add(snapshot);
      path = 'response/fragments/-1/content';
    } else if (message && Object.hasOwn(message, 'v')) {
      if (typeof message.p === 'string') path = message.p.replace(/^\//, '');
      patch(path, message.o, message.v);
    }
    return false;
  }

  function line(value) {
    if (!value) return frame();
    if (value.startsWith('data:')) data.push(value.slice(5).replace(/^ /, ''));
    if (value.startsWith('event:')) event = value.slice(6).trim();
    return false;
  }

  return function write(text, time, done = false) {
    receivedAt = time;
    buffer += text;
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const next = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      if (line(next)) return true;
    }
    if (done) {
      if (buffer) line(buffer.replace(/\r$/, ''));
      frame();
    }
    return done;
  };
}

export async function observe(body, onText, onSearch) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const write = streamParser(onText, onSearch);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (write(decoder.decode(value, { stream: !done }), performance.now(), done)) return;
    }
  } finally {
    // The page owns the other branch of the cloned response.
    void reader.cancel().catch(() => {});
  }
}
