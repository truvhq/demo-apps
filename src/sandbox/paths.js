/**
 * FILE SUMMARY: Read and change a value inside a nested object by a path like
 * `payload.employments[0].profile.ssn`. The forms use it so one input can edit any field of a
 * scenario without a setter per field. Changes never touch the object they start from.
 */

const parse = (path) => String(path).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean).map(k => (/^\d+$/.test(k) ? Number(k) : k));

export function getIn(obj, path, fallback) {
  let cur = obj;
  for (const k of parse(path)) {
    if (cur === null || cur === undefined) return fallback;
    cur = cur[k];
  }
  return cur === undefined ? fallback : cur;
}

export function setIn(obj, path, value) {
  const keys = parse(path);
  if (!keys.length) return value;
  const root = Array.isArray(obj) ? obj.slice() : { ...obj };
  let cur = root;
  keys.forEach((k, i) => {
    if (i === keys.length - 1) { cur[k] = value; return; }
    const next = cur[k];
    cur[k] = Array.isArray(next) ? next.slice() : (next && typeof next === 'object' ? { ...next } : (typeof keys[i + 1] === 'number' ? [] : {}));
    cur = cur[k];
  });
  return root;
}

// Remove the item at an array path, e.g. removeAt(s, 'payload.employments', 1).
export function removeAt(obj, arrayPath, index) {
  const list = (getIn(obj, arrayPath, []) || []).filter((_, i) => i !== index);
  return setIn(obj, arrayPath, list);
}

// Does an issue path sit at or below this path? ('payload.employments[0].income' is under 'payload.employments[0]')
export const isUnder = (issuePath, base) => issuePath === base || issuePath.startsWith(`${base}.`) || issuePath.startsWith(`${base}[`);
