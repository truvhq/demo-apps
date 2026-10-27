/**
 * FILE SUMMARY: Shows a JSON value the way a developer wants to read a response: numbered lines, objects and arrays
 * that fold when you click their first line, a search box that finds and highlights text (opening any folds in the
 * way), and a way to download the whole thing. It only reads: nothing here changes the value.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { CopyButton, announce, scrollBehavior } from './ui.jsx';

const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+\.?\d*(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;
const MATCH_LIMIT = 2000;

// A line cut into pieces that get a colour: keys, strings, numbers, true/false/null, and the rest.
export function tokens(line) {
  const out = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    if (m.index > last) out.push({ text: line.slice(last, m.index), cls: '' });
    if (m[1] !== undefined) {
      out.push({ text: m[1], cls: m[2] ? 'k' : 's' });
      if (m[2]) out.push({ text: m[2], cls: '' });
    } else out.push({ text: m[0], cls: m[3] !== undefined ? 'n' : 'b' });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last), cls: '' });
  return out;
}

// For each line that opens an object or list, the line that closes it. The text is pretty-printed, so an
// opener ends in { or [ and its closer is the next line that begins with } or ] at the same depth.
export function foldRanges(lines) {
  const ranges = new Map();
  const stack = [];
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.endsWith('{') || t.endsWith('[')) stack.push(i);
    else if (t.startsWith('}') || t.startsWith(']')) { const open = stack.pop(); if (open !== undefined) ranges.set(open, i); }
  });
  return ranges;
}

// Pieces of a line, split again wherever a search match starts or ends.
export function pieces(line, marks) {
  const base = tokens(line);
  if (!marks.length) return base.map(t => ({ ...t, mark: '' }));
  const out = [];
  let pos = 0;
  for (const t of base) {
    let at = 0;
    while (at < t.text.length) {
      const abs = pos + at;
      const hit = marks.find(m => abs >= m.start && abs < m.end);
      const edge = hit ? hit.end : Math.min(...marks.filter(m => m.start > abs).map(m => m.start), Infinity);
      const stop = Math.min(t.text.length, (edge === Infinity ? Infinity : edge - pos));
      out.push({ text: t.text.slice(at, stop), cls: t.cls, mark: hit ? (hit.current ? 'cur' : 'm') : '' });
      at = stop;
    }
    pos += t.text.length;
  }
  return out;
}

// The path to the value on each line, like employers[0].employments[1].company: what you would copy to find it in code.
export function linePaths(lines) {
  const stack = [{ path: '', array: false, count: 0 }];
  const join = (base, seg) => (typeof seg === 'number' ? `${base}[${seg}]` : (base ? `${base}.${seg}` : seg));
  return lines.map((line) => {
    const t = line.trim();
    if (t.startsWith('}') || t.startsWith(']')) { const done = stack.pop(); return done?.path || ''; }
    const top = stack[stack.length - 1];
    let seg = null;
    if (top.array) seg = top.count++;
    else { const m = /^"((?:\\.|[^"\\])*)"\s*:/.exec(t); if (m) { try { seg = JSON.parse(`"${m[1]}"`); } catch { seg = m[1]; } } }
    const path = seg === null ? top.path : join(top.path, seg);
    if (t.endsWith('{') || t.endsWith('[')) stack.push({ path, array: t.endsWith('['), count: 0 });
    return path;
  });
}

const BIG = 300;       // a response longer than this starts folded below its top three levels
const depthOf = (line) => (line.length - line.trimStart().length) / 2;

export function JsonViewer({ value, filename = 'response.json', label = 'JSON', copy = true, maxHeight = 420 }) {
  const text = useMemo(() => JSON.stringify(value, null, 2) ?? '', [value]);
  const lines = useMemo(() => text.split('\n'), [text]);
  const ranges = useMemo(() => foldRanges(lines), [lines]);
  const paths = useMemo(() => linePaths(lines), [lines]);
  const pathRef = useRef(null);        // the path shown under the toolbar, written straight to the page so moving the pointer does not redraw every line
  const pathText = useRef('');
  const showPath = (i) => { const p = paths[i] || ''; pathText.current = p; if (pathRef.current) pathRef.current.textContent = p || (i === 0 ? '(the whole value)' : 'Hover a line to see its path'); };
  const [folded, setFolded] = useState(() => (lines.length > BIG ? new Set([...ranges.keys()].filter(i => depthOf(lines[i]) >= 3)) : new Set()));
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState(0);
  const [stop, setStop] = useState(null);     // the one fold button that is a Tab stop; arrows move between the rest
  const box = useRef(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const found = [];
    for (let i = 0; i < lines.length && found.length < MATCH_LIMIT; i++) {
      const hay = lines[i].toLowerCase();
      for (let at = hay.indexOf(q); at !== -1 && found.length < MATCH_LIMIT; at = hay.indexOf(q, at + q.length)) found.push({ line: i, start: at, end: at + q.length });
    }
    return found;
  }, [query, lines]);

  // Matches grouped by line, so drawing a row does not search all of them.
  const byLine = useMemo(() => { const m = new Map(); matches.forEach((x, i) => { if (!m.has(x.line)) m.set(x.line, []); m.get(x.line).push({ ...x, index: i }); }); return m; }, [matches]);

  // Open every fold that hides a line, so a match inside one can be seen.
  const reveal = (line) => setFolded(prev => {
    const hidden = [...prev].filter(s => s < line && ranges.get(s) >= line);
    if (!hidden.length) return prev;
    const next = new Set(prev);
    hidden.forEach(s => next.delete(s));
    return next;
  });
  useEffect(() => { setCurrent(0); if (matches[0]) reveal(matches[0].line); }, [query]);
  useEffect(() => { if (matches[current]) reveal(matches[current].line); }, [current]);
  useEffect(() => { box.current?.querySelector('[data-current]')?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() }); }, [current, query, folded]);
  useEffect(() => { if (query.trim()) announce(matches.length ? `${current + 1} of ${matches.length} matches` : 'No matches'); }, [current, matches.length, query]);

  const rows = [];
  for (let i = 0; i < lines.length;) {
    rows.push(i);
    i = folded.has(i) && ranges.has(i) ? ranges.get(i) + 1 : i + 1;
  }
  const foldable = [...ranges.keys()];
  const firstFold = rows.find(r => ranges.has(r));
  const toggle = (i) => setFolded(prev => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next; });
  const step = (by) => { if (matches.length) setCurrent(c => (c + by + matches.length) % matches.length); };

  // Folds everything below the top, except the way to the match being looked at, and goes back to the top.
  function collapseAll() {
    const keep = matches[current]?.line;
    setFolded(new Set(foldable.filter(i => i !== 0 && !(keep !== undefined && i < keep && ranges.get(i) >= keep))));
    if (box.current) box.current.scrollTop = 0;
  }

  function download() {
    const blob = new Blob([`${text}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div class="sbx-jv">
      <div class="sbx-jv-bar">
        <div class="sbx-jv-search">
          <label class="sbx-sr" for={`sbx-jv-q-${label}`}>Search the {label.toLowerCase()}</label>
          <input
            id={`sbx-jv-q-${label}`} type="search" placeholder="Search" value={query} autocomplete="off" spellcheck={false}
            onInput={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); } }}
          />
          {query.trim() && <span class="sbx-jv-count" aria-hidden="true">{matches.length ? `${current + 1} of ${matches.length}${matches.length >= MATCH_LIMIT ? '+' : ''}` : 'No matches'}</span>}
          <button type="button" class="sbx-btn ghost small" onClick={() => step(-1)} disabled={!matches.length} aria-label="Previous match">&uarr;</button>
          <button type="button" class="sbx-btn ghost small" onClick={() => step(1)} disabled={!matches.length} aria-label="Next match">&darr;</button>
        </div>
        <div class="sbx-jv-tools">
          <button type="button" class="sbx-btn ghost small" onClick={collapseAll} disabled={foldable.length < 2}>Collapse all</button>
          <button type="button" class="sbx-btn ghost small" onClick={() => setFolded(new Set())} disabled={!folded.size}>Expand all</button>
          {copy && <CopyButton text={text} label="Copy" what={label} class="sbx-jv-copy" />}
          <button type="button" class="sbx-btn ghost small" onClick={download}>Download</button>
        </div>
      </div>
      <div class="sbx-jv-path">
        <span class="sbx-small">Path</span> <code ref={pathRef} aria-live="off">Hover a line to see its path</code>
        <button type="button" class="sbx-btn ghost small" onClick={() => { if (pathText.current) { navigator.clipboard?.writeText(pathText.current).then(() => announce('Path copied'), () => announce('Could not copy')); } }}>Copy path</button>
      </div>
      <div
        class="sbx-jv-body" ref={box} tabIndex={0} role="region" aria-label={`${label}, ${lines.length} lines`} style={{ maxHeight }}
        onMouseOver={(e) => { const row = e.target.closest?.('.sbx-jv-row'); if (row?.dataset.line) showPath(Number(row.dataset.line)); }}
        onFocusCapture={(e) => { const row = e.target.closest?.('.sbx-jv-row'); if (row?.dataset.line) showPath(Number(row.dataset.line)); }}
        onKeyDown={(e) => {
          // Up and down move between the fold buttons, so there is one Tab stop for the lot, not hundreds.
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
          const buttons = [...box.current.querySelectorAll('.sbx-jv-fold button')];
          const at = buttons.indexOf(document.activeElement);
          if (at === -1) return;
          e.preventDefault();
          buttons[Math.max(0, Math.min(buttons.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
        }}
      >
        {rows.map((i) => {
          const end = ranges.get(i);
          const isFolded = folded.has(i) && end !== undefined;
          const marks = (byLine.get(i) || []).map(m => ({ ...m, current: m.index === current }));
          const closer = isFolded ? lines[end].trim() : '';
          return (
            <div
              key={i} data-line={i} class={`sbx-jv-row${end !== undefined ? ' is-foldable' : ''}${isFolded ? ' is-folded' : ''}`}
              data-current={marks.some(m => m.current) ? '' : undefined}
              onClick={end !== undefined ? (e) => { if (e.detail > 1) { toggle(i); return; } if (!window.getSelection?.().toString()) toggle(i); } : undefined}
            >
              <span class="sbx-jv-no" aria-hidden="true">{i + 1}</span>
              <span class="sbx-jv-fold">
                {end !== undefined && (
                  <button
                    type="button" aria-expanded={!isFolded} tabIndex={(stop ?? firstFold) === i ? 0 : -1}
                    onFocus={() => setStop(i)}
                    aria-label={`${isFolded ? 'Expand' : 'Collapse'} lines ${i + 1} to ${end + 1}`}
                    onClick={(e) => { e.stopPropagation(); toggle(i); }}
                  >{isFolded ? '\u25B8' : '\u25BE'}</button>
                )}
              </span>
              <code class="sbx-jv-code">
                {pieces(lines[i], marks).map((p, k) => <span key={k} class={`${p.cls ? `jv-${p.cls}` : ''}${p.mark ? ` jv-${p.mark}` : ''}`}>{p.text}</span>)}
                {isFolded && <span class="jv-fold-note"> {'\u2026'} {end - i - 1 > 0 ? `${end - i - 1} ${end - i - 1 === 1 ? 'line' : 'lines'} ` : ''}{closer}</span>}
              </code>
            </div>
          );
        })}
      </div>
    </div>
  );
}
