import { Tokenizer } from '@huggingface/tokenizers';
import definition from '../tokenizer.json';
import config from '../tokenizer_config.json';

let tokenizer;
export function encode(text) {
  tokenizer ??= new Tokenizer(JSON.parse(definition), JSON.parse(config));
  return tokenizer.encode(text, { add_special_tokens: false }).ids;
}
