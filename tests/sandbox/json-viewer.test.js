import { describe, expect, it } from 'vitest';
import { foldRanges, linePaths, pieces, tokens } from '../../src/sandbox/JsonViewer.jsx';

const lines = (v) => JSON.stringify(v, null, 2).split('\n');

describe('where objects and lists can be folded', () => {
  it('pairs each opening line with the line that closes it, at any depth', () => {
    const l = lines({ a: [1, { b: 2 }], c: {} });
    // 0 {   1 "a": [   2 1,   3 {   4 "b": 2   5 }   6 ]   7 "c": {}   8 }
    const r = foldRanges(l);
    expect(r.get(0)).toBe(8);
    expect(r.get(1)).toBe(6);
    expect(r.get(3)).toBe(5);
    expect(r.has(7)).toBe(false);        // an empty {} sits on one line: nothing to fold
  });
  it('copes with a value that is not an object, and with braces inside strings', () => {
    expect(foldRanges(lines(5)).size).toBe(0);
    const r = foldRanges(lines({ text: 'looks like { or [ but is text' }));
    expect([...r.entries()]).toEqual([[0, 2]]);
  });
  it('folds a list of lists', () => {
    const r = foldRanges(lines([[1, 2], [3]]));
    expect(r.get(0)).toBe(lines([[1, 2], [3]]).length - 1);
    expect(r.size).toBe(3);
  });
});

describe('colouring a line', () => {
  it('splits keys, strings, numbers and words, and loses nothing', () => {
    const line = '  "name": "Acme", "n": -1.5e3, "ok": true, "x": null';
    const parts = tokens(line);
    expect(parts.map(p => p.text).join('')).toBe(line);
    expect(parts.find(p => p.text === '"name"').cls).toBe('k');
    expect(parts.find(p => p.text === '"Acme"').cls).toBe('s');
    expect(parts.find(p => p.text === '-1.5e3').cls).toBe('n');
    expect(parts.find(p => p.text === 'true').cls).toBe('b');
    expect(parts.find(p => p.text === 'null').cls).toBe('b');
  });
  it('keeps an escaped quote inside its string', () => {
    const parts = tokens('"a \\"quoted\\" word"');
    expect(parts.filter(p => p.cls === 's' || p.cls === 'k')).toHaveLength(1);
  });
});

describe('marking search matches', () => {
  it('marks the matches and still adds up to the whole line', () => {
    const line = '  "company_name": "Acme Acme"';
    const marks = [{ start: 3, end: 7 }, { start: 19, end: 23, current: true }, { start: 24, end: 28 }];
    const out = pieces(line, marks);
    expect(out.map(p => p.text).join('')).toBe(line);
    expect(out.filter(p => p.mark === 'm').map(p => p.text)).toEqual(['comp', 'Acme']);
    expect(out.filter(p => p.mark === 'cur').map(p => p.text)).toEqual(['Acme']);
  });
  it('splits a match that spans two colours, and leaves an unmarked line alone', () => {
    const out = pieces('"a": 12', [{ start: 2, end: 6 }]);
    expect(out.map(p => p.text).join('')).toBe('"a": 12');
    expect(out.filter(p => p.mark).map(p => p.text).join('')).toBe('": 1');
    expect(pieces('"a": 1', []).every(p => p.mark === '')).toBe(true);
  });
});

describe('the path of each line', () => {
  it('names objects, lists and their items', () => {
    const ls = lines({ id: 'o1', employers: [{ name: 'A', employments: [{ title: 'x' }] }, { name: 'B' }], 'odd key': { n: null } });
    const paths = linePaths(ls);
    const at = (needle) => paths[ls.findIndex(l => l.includes(needle))];
    expect(at('"id"')).toBe('id');
    expect(at('"employers"')).toBe('employers');
    expect(at('"title"')).toBe('employers[0].employments[0].title');
    expect(at('"B"')).toBe('employers[1].name');
    expect(at('"n"')).toBe('odd key.n');
  });
  it('gives a closing line the path of what it closes, and the top line none', () => {
    const ls = lines({ a: [1, 2] });
    const paths = linePaths(ls);
    expect(paths[0]).toBe('');
    expect(paths[ls.indexOf('  "a": [')]).toBe('a');
    expect(paths[ls.indexOf('  ]')]).toBe('a');
    expect(paths[ls.findIndex(l => l.trim() === '2')]).toBe('a[1]');
  });
  it('survives keys with quotes and a plain list at the top', () => {
    const ls = lines([{ 'say "hi"': 1 }]);
    expect(linePaths(ls)[ls.findIndex(l => l.includes('say'))]).toBe('[0].say "hi"'.replace('[0].', '[0].'));
  });
});
