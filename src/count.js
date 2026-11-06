import { Tokenizer } from '@huggingface/tokenizers';
import definition from '../tokenizer.json';
import config from '../tokenizer_config.json';

let tokenizer;
export function encode(text) {
  tokenizer ??= new Tokenizer(JSON.parse(definition), JSON.parse(config));
  return tokenizer.encode(text, { add_special_tokens: false }).ids;
}

let update;
let checkedAt;

export function checkTokenizerUpdate() {
  if (!globalThis.chrome?.runtime?.sendMessage) return;
  const now = Date.now();
  if (checkedAt !== undefined && now - checkedAt < 60 * 60 * 1000) return;
  checkedAt = now;
  void chrome.runtime.sendMessage({
    type: 'tokenizer-update',
    model: update?.model,
    revision: update?.revision,
  }).then(candidate => {
    if (!candidate) return;
    update = {
      model: candidate.model,
      revision: candidate.revision,
      tokenizer: new Tokenizer(candidate.definition, candidate.config),
    };
  }).catch(() => {});
}

export function replyEncoder() {
  const current = update?.tokenizer;
  return current ? text => current.encode(text, { add_special_tokens: false }).ids : encode;
}
