/**
 * FILE SUMMARY: Interactive extras added to the guide after it renders.
 *
 * The guide's text is rendered as-is from guide-source.html. This adds things a
 * reader can use without changing a word of it:
 *   - the video: one player at the top of the rules, one "see it in motion" clip
 *     on each rule card
 *   - a Copy button on every code block
 *   - real checkboxes on the pre-launch QA list, remembered in this browser
 * Returns a cleanup function.
 */
import { render } from 'preact';
import { RulesReel, RuleClip } from './MotionPlayers.jsx';

const QA_KEY = 'eog-qa-v1';

// Short stable id for a checklist line, so ticks survive a reorder or reload.
export function lineKey(text) {
  const s = text.replace(/\s+/g, ' ').trim();
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function readTicks() {
  try { return new Set(JSON.parse(localStorage.getItem(QA_KEY) || '[]')); } catch { return new Set(); }
}
function writeTicks(set) {
  try { localStorage.setItem(QA_KEY, JSON.stringify([...set])); } catch { /* storage unavailable: ticks last for this visit */ }
}

function mountVideo(root, cleanups) {
  const reelSlot = root.querySelector('.eog-reel-slot');
  if (reelSlot) {
    render(<RulesReel />, reelSlot);
    cleanups.push(() => render(null, reelSlot));
  }
  root.querySelectorAll('article.rule-card').forEach(card => {
    const n = Number(card.id.replace('rule-', ''));
    const anchor = card.querySelector('.rule-gain') || card.querySelector('h3');
    if (!n || !anchor) return;
    const slot = document.createElement('div');
    slot.className = 'eog-clipslot';
    anchor.after(slot);
    render(<RuleClip n={n} />, slot);
    cleanups.push(() => { render(null, slot); slot.remove(); });
  });
}

function addCopyButtons(root) {
  root.querySelectorAll('pre').forEach(pre => {
    const text = pre.textContent;
    const wrap = document.createElement('div');
    wrap.className = 'eog-codewrap';
    pre.replaceWith(wrap);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'eog-copy';
    btn.textContent = 'Copy';
    btn.setAttribute('aria-label', 'Copy this code');
    btn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; }
      catch { btn.textContent = 'Press Ctrl+C'; }
      setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
    });
    wrap.append(pre, btn);
  });
}

function addChecklist(root) {
  const items = [...root.querySelectorAll('#qa .checkgroup li')];
  const checks = root.querySelector('#qa .checks');
  if (!items.length || !checks) return;
  const ticked = readTicks();

  const bar = document.createElement('div');
  bar.className = 'eog-qa-bar';
  const count = document.createElement('span');
  count.className = 'eog-qa-count';
  count.setAttribute('aria-live', 'polite');
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'eog-qa-reset';
  reset.textContent = 'Clear all';
  bar.append(count, reset);
  checks.before(bar);

  const inputs = [];
  const refresh = () => {
    const n = inputs.filter(i => i.checked).length;
    count.textContent = `${n} of ${inputs.length} checked`;
    bar.dataset.done = n === inputs.length ? 'true' : 'false';
  };

  items.forEach(li => {
    const key = lineKey(li.textContent);
    const label = document.createElement('label');
    label.className = 'eog-check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = ticked.has(key);
    const text = document.createElement('span');
    while (li.firstChild) text.append(li.firstChild);
    label.append(input, text);
    li.append(label);
    li.classList.add('eog-check-item');
    input.addEventListener('change', () => {
      if (input.checked) ticked.add(key); else ticked.delete(key);
      writeTicks(ticked);
      refresh();
    });
    inputs.push(input);
  });

  reset.addEventListener('click', () => {
    inputs.forEach(i => { i.checked = false; });
    ticked.clear();
    writeTicks(ticked);
    refresh();
  });
  refresh();
}

export function enhanceGuide(root) {
  const cleanups = [];
  if (!root) return () => {};
  mountVideo(root, cleanups);
  addCopyButtons(root);
  addChecklist(root);
  return () => cleanups.forEach(fn => fn());
}
