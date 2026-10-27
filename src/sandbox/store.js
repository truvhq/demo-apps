/**
 * FILE SUMMARY: What the tool remembers in this browser: which scenarios it made, a short history of
 * deleted ones (the undo path), and the name prefix last used. Test data only; no keys.
 * Storage can be blocked or full, so every read falls back to empty and every write is allowed to fail.
 */

const KEY = { made: 'sbx-made-ids', trash: 'sbx-trash', prefix: 'sbx-prefix' };
export const TRASH_LIMIT = 50;

function read(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

// Anything in storage may be old, edited by hand or damaged, so each read checks what it got and drops what is not usable.
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export const loadMade = () => {
  const v = read(KEY.made, []);
  return new Set(Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
};
export function rememberMade(ids) {
  const all = loadMade();
  [].concat(ids).forEach(i => all.add(i));
  write(KEY.made, [...all].slice(-500));
}
export function forgetMade(ids) {
  const all = loadMade();
  [].concat(ids).forEach(i => all.delete(i));
  write(KEY.made, [...all]);
}

// Deleted scenarios, newest first. Each keeps the whole body so it can be created again.
// Every entry has its own id: deleting several at once shares a timestamp, so `at` alone cannot tell them apart.
let sequence = 0;
const newId = () => `${Date.now().toString(36)}-${(sequence++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
export const loadTrash = () => {
  const v = read(KEY.trash, []);
  if (!Array.isArray(v)) return [];
  return v.filter(t => isObj(t) && isObj(t.scenario)).map((t, i) => ({ ...t, at: Number.isFinite(t.at) ? t.at : 0, id: typeof t.id === 'string' && t.id ? t.id : `legacy-${t.at}-${i}` }));
};
export function pushTrash(items) {
  const added = [].concat(items).map(s => ({ id: newId(), at: Date.now(), scenario: s }));
  const next = [...added, ...loadTrash()].slice(0, TRASH_LIMIT);
  write(KEY.trash, next);
  return next;
}
export function dropTrash(id) {
  const next = loadTrash().filter(t => t.id !== id);
  write(KEY.trash, next);
  return next;
}

export const loadPrefix = () => { const v = read(KEY.prefix, 'qa'); return typeof v === 'string' && v.length <= 16 ? v : 'qa'; };
export const savePrefix = (p) => write(KEY.prefix, p);
