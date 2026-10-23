/**
 * FILE SUMMARY: Interactive extras added to the guide after it renders.
 *
 * The guide's text is rendered as-is from guide-source.html. This adds things a
 * reader can use without changing a word of it:
 *   - the video: one player at the top of the rules, and a "Watch rule N" clip
 *     on each rule card
 *   - a Copy button on every code block
 *   - real checkboxes on the pre-launch QA list, remembered in this browser
 *   - click a screenshot to see it at full size (they shrink to about 3px type on a phone)
 *   - keyboard access to tables, code and diagrams that scroll sideways
 * Returns a cleanup function. `announce` says something to screen-reader users.
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

function addCopyButtons(root, announce) {
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
      try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; announce('Code copied'); }
      catch { btn.textContent = 'Copy failed'; announce('Copy failed. Select the code and copy it yourself.'); }
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
  reset.textContent = 'Clear all ticks';
  reset.setAttribute('aria-label', 'Clear all ticks on the pre-launch QA list');
  const saved = document.createElement('span');
  saved.className = 'eog-qa-saved';
  saved.textContent = 'Saved in this browser only.';
  bar.append(count, saved, reset);
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

// Click a screenshot to read it at full size in a dialog the reader can pan and close.
function addLightbox(root, cleanups) {
  const dialog = document.createElement('dialog');
  dialog.className = 'eog-lightbox';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'eog-lightbox-close';
  close.textContent = 'Close';
  const big = document.createElement('img');
  dialog.append(close, big);
  root.append(dialog);
  const hide = () => dialog.close();
  close.addEventListener('click', hide);
  dialog.addEventListener('click', e => { if (e.target === dialog) hide(); });

  root.querySelectorAll('.shot img').forEach(img => {
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'eog-zoom';
    open.setAttribute('aria-label', `View full size: ${img.alt}`);
    img.replaceWith(open);
    open.append(img);
    open.addEventListener('click', () => {
      big.src = img.currentSrc || img.src;
      big.alt = img.alt;
      dialog.showModal();
    });
  });
  cleanups.push(() => { dialog.close?.(); dialog.remove(); });
}

// A box that scrolls sideways needs a tab stop, or a keyboard user cannot read it.
// Only boxes that actually overflow get one, so wide screens gain no extra stops.
function markScrollers(root, cleanups) {
  const kinds = [['Table', '.tbl-scroll'], ['Code', 'pre'], ['Diagram', 'figure']];
  const mark = () => {
    for (const [kind, selector] of kinds) {
      const all = [...root.querySelectorAll(selector)];
      all.forEach((el, i) => {
        if (el.scrollWidth > el.clientWidth + 1) {
          el.tabIndex = 0;
          // Each name is different, so a screen reader's region list is not nine copies of one line.
          el.setAttribute('aria-label', `${kind} ${i + 1} of ${all.length}, scrolls sideways`);
          // A figure already has a role; the others read as a labelled region.
          if (kind !== 'Diagram') el.setAttribute('role', 'region');
        } else if (el.hasAttribute('aria-label') && /scrolls sideways$/.test(el.getAttribute('aria-label'))) {
          el.removeAttribute('tabindex');
          el.removeAttribute('role');
          el.removeAttribute('aria-label');
        }
      });
    }
  };
  let timer = 0;
  const later = () => { clearTimeout(timer); timer = setTimeout(mark, 150); };
  window.addEventListener('resize', later);
  root.querySelectorAll('img').forEach(i => i.addEventListener('load', later));
  mark();
  cleanups.push(() => { clearTimeout(timer); window.removeEventListener('resize', later); });
}

export function enhanceGuide(root, announce = () => {}) {
  const cleanups = [];
  if (!root) return () => {};
  mountVideo(root, cleanups);
  addCopyButtons(root, announce);
  addChecklist(root);
  // One table header cell is empty in the source. Give it text a screen reader can read.
  root.querySelectorAll('th:empty').forEach(th => {
    const hidden = document.createElement('span');
    hidden.className = 'eog-sr';
    hidden.textContent = 'Comparison';
    th.append(hidden);
  });
  // Sections and rules can take focus, so a jump to one moves the keyboard with the page.
  root.querySelectorAll('section[id], article[id], figure[id]').forEach(el => { el.tabIndex = -1; });
  addLightbox(root, cleanups);
  markScrollers(root, cleanups);
  return () => cleanups.forEach(fn => fn());
}
