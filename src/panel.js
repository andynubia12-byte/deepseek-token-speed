import { checkTokenizerUpdate, replyEncoder } from './count.js';

const channel = 'deepseek-token-speed/v1';
let active = 0;
const metrics = document.createElement('span');
metrics.id = 'deepseek-token-speed-panel';
metrics.style.cssText = [
  'display:block', 'position:relative', 'align-self:center', 'flex:0 1 auto', 'min-width:0',
  'margin-inline-start:4px', 'overflow:hidden', 'text-overflow:ellipsis',
  'white-space:pre', 'color:#8b8b91', 'font-variant-numeric:tabular-nums',
].join(';');

const headerLayout = new CSSStyleSheet();
headerLayout.replaceSync(`
  .the-header > ._9fcbeda:has(> #deepseek-token-speed-panel) {
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
  }
`);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, headerLayout];

function mount() {
  if (metrics.isConnected || !metrics.textContent) return;
  const title = document.querySelector('.the-header > ._9fcbeda > .afa34042');
  if (!title) return;
  const font = getComputedStyle(title);
  metrics.style.fontFamily = font.fontFamily;
  metrics.style.fontSize = font.fontSize;
  metrics.style.fontWeight = font.fontWeight;
  metrics.style.lineHeight = font.lineHeight;
  metrics.style.minHeight = font.lineHeight;
  metrics.style.top = font.top;
  title.after(metrics);
}

new MutationObserver(mount).observe(document, { childList: true, subtree: true });

let lastAnswer;
let lastThink;
let answerCount;
let thinkCount;
let countFailed;
let encode;

checkTokenizerUpdate();

window.addEventListener('message', ({ source, origin, data }) => {
  if (source !== window || origin !== location.origin || data?.channel !== channel) return;
  if (data.kind === 'start' && Number.isSafeInteger(data.id) && data.id > active) {
    active = data.id;
    encode = replyEncoder();
    checkTokenizerUpdate();
    metrics.remove();
    metrics.textContent = '';
    lastAnswer = lastThink = '';
    answerCount = thinkCount = 0;
    countFailed = false;
    return;
  }
  if (!active || data.id !== active || countFailed) return;
  if (data.kind === 'end') {
    lastAnswer = lastThink = '';
    return;
  }
  if (data.kind !== 'sample' || typeof data.answer !== 'string' || typeof data.think !== 'string' ||
      !Number.isFinite(data.span) || !Number.isFinite(data.first)) return;

  try {
    if (lastAnswer !== data.answer) answerCount = encode(data.answer).length;
    if (lastThink !== data.think) thinkCount = encode(data.think).length;
    lastAnswer = data.answer;
    lastThink = data.think;
    const total = answerCount + thinkCount;
    const speed = data.span > 0 ? (total * 1000 / data.span).toFixed(1) : '—';
    metrics.textContent = `${speed} token/s  ${total} tokens`;
    mount();
  } catch {
    countFailed = true;
  }
});

