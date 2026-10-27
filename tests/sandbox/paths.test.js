import { describe, expect, it } from 'vitest';
import { getIn, setIn, removeAt, isUnder } from '../../src/sandbox/paths.js';

describe('reading by path', () => {
  const o = { a: { b: [{ c: 1 }, { c: 2 }] }, z: null };
  it('follows keys and bracket or dot indexes', () => {
    expect(getIn(o, 'a.b[1].c')).toBe(2);
    expect(getIn(o, 'a.b.0.c')).toBe(1);
  });
  it('gives the fallback for anything missing, including through null', () => {
    expect(getIn(o, 'a.x.y', 'none')).toBe('none');
    expect(getIn(o, 'z.y', 'none')).toBe('none');
    expect(getIn(o, 'a.b[5].c', 7)).toBe(7);
  });
});

describe('changing by path', () => {
  it('never touches the object it started from, at any depth', () => {
    const o = { a: { b: [{ c: 1 }] }, keep: { x: 1 } };
    const n = setIn(o, 'a.b[0].c', 9);
    expect(n.a.b[0].c).toBe(9);
    expect(o.a.b[0].c).toBe(1);
    expect(n.a).not.toBe(o.a);
    expect(n.a.b).not.toBe(o.a.b);
    expect(n.keep).toBe(o.keep);          // what was not on the path is shared, not copied
  });
  it('builds what is missing: objects for names, lists for numbers', () => {
    expect(setIn({}, 'a.b', 1)).toEqual({ a: { b: 1 } });
    expect(setIn({}, 'a[1]', 'x')).toEqual({ a: [undefined, 'x'] });
    expect(setIn({}, 'a[0].b', 1)).toEqual({ a: [{ b: 1 }] });
  });
  it('replaces the whole value for an empty path', () => {
    expect(setIn({ a: 1 }, '', { b: 2 })).toEqual({ b: 2 });
  });
  it('refuses a path that names a prototype, and pollutes nothing', () => {
    const o = { a: 1 };
    expect(setIn(o, '__proto__.polluted', 'x')).toBe(o);
    expect(setIn(o, 'a.constructor.prototype.polluted', 'x')).toBe(o);
    expect(setIn(o, 'prototype', 'x')).toBe(o);
    expect({}.polluted).toBeUndefined();
    expect(Object.prototype.polluted).toBeUndefined();
  });
  it('keeps keys that merely look odd', () => {
    expect(setIn({}, 'a.b c', 1)).toEqual({ a: { 'b c': 1 } });
  });
});

describe('removing from a list', () => {
  it('drops one item and leaves the original alone', () => {
    const o = { l: [1, 2, 3] };
    expect(removeAt(o, 'l', 1).l).toEqual([1, 3]);
    expect(o.l).toEqual([1, 2, 3]);
  });
  it('copes with a missing list', () => {
    expect(removeAt({}, 'l', 0)).toEqual({ l: [] });
  });
});

describe('is a path under another', () => {
  it('matches the path itself and anything below it, not a neighbour', () => {
    expect(isUnder('payload.employments[0]', 'payload.employments[0]')).toBe(true);
    expect(isUnder('payload.employments[0].income', 'payload.employments[0]')).toBe(true);
    expect(isUnder('payload.employments[0][1]', 'payload.employments[0]')).toBe(true);
    expect(isUnder('payload.employments[10].income', 'payload.employments[1]')).toBe(false);
    expect(isUnder('payload.employments[1]x', 'payload.employments[1]')).toBe(false);
  });
});
