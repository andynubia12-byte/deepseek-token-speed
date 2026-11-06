import { Tokenizer } from '@huggingface/tokenizers';

const hub = 'https://huggingface.co';
const baselineModel = 'deepseek-ai/DeepSeek-V4.1-Flash-1017';
const baselineRevision = '1bae0e1088993b9b82de08f59de5be5a34e42170';
const baselineDate = Date.parse('2026-10-17T02:40:38Z');
const cacheName = 'deepseek-tokenizer-v1';
const cacheKey = hub + '/tokenizer-update';
const attemptKey = hub + '/tokenizer-update-check';
let pending;

async function getJSON(path) {
  const response = await fetch(hub + path, {
    credentials: 'omit',
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok || new URL(response.url).origin !== hub) throw new Error('Hugging Face request failed');
  return response.json();
}

async function refresh(cache, previous) {
  const checked = await cache.match(attemptKey);
  if (checked && Date.now() - Number(await checked.text()) < 24 * 60 * 60 * 1000) return previous;
  await cache.put(attemptKey, new Response(String(Date.now())));

  const models = await getJSON('/api/models?author=deepseek-ai&search=DeepSeek-V4.1-Flash&sort=createdAt&direction=-1&limit=50');
  const latest = models.find(({ id, createdAt }) =>
    /^deepseek-ai\/DeepSeek-V4\.1-Flash(?:-\d{4})?$/.test(id) &&
    Date.parse(createdAt) >= Math.max(baselineDate, previous?.createdAt ?? 0));
  if (!latest) return previous;

  const { sha: revision } = await getJSON(`/api/models/${latest.id}`);
  if (!/^[a-f0-9]{40}$/.test(revision)) return previous;
  if (latest.id === baselineModel && revision === baselineRevision) return previous;
  if (latest.id === previous?.model && revision === previous.revision) return previous;

  const base = `/${latest.id}/resolve/${revision}`;
  const [definition, config] = await Promise.all([
    getJSON(`${base}/tokenizer.json`),
    getJSON(`${base}/tokenizer_config.json`),
  ]);
  const { vocab, merges, ...modelOptions } = definition.model;
  const pipeline = [definition.normalizer, definition.pre_tokenizer, definition.post_processor,
    definition.decoder, modelOptions];
  if (JSON.stringify(pipeline) !== TOKENIZER_PIPELINE || !Array.isArray(merges) ||
      !vocab || typeof vocab !== 'object' || config.tokenizer_class !== 'PreTrainedTokenizerFast') {
    return previous;
  }

  const tokenizer = new Tokenizer(definition, config);
  for (const text of ['Hello, world!', '中文和 English 123', '🐱\n']) {
    const { ids } = tokenizer.encode(text, { add_special_tokens: false });
    if (!ids.length || tokenizer.decode(ids, { clean_up_tokenization_spaces: false }) !== text) return previous;
  }

  const update = { model: latest.id, revision, createdAt: Date.parse(latest.createdAt), definition, config };
  await cache.put(cacheKey, Response.json(update));
  return update;
}

async function getUpdate() {
  const cache = await caches.open(cacheName);
  const stored = await cache.match(cacheKey);
  const previous = stored ? await stored.json() : null;
  try {
    return await refresh(cache, previous);
  } catch {
    return previous;
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'tokenizer-update' || sender.origin !== 'https://chat.deepseek.com') return;
  pending ??= getUpdate().finally(() => { pending = undefined; });
  pending.then(update => {
    respond(update?.revision === message.revision && update?.model === message.model ? null : update);
  }, () => respond(null));
  return true;
});
