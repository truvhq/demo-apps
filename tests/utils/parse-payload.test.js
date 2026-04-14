import { describe, it, expect } from 'vitest';
import { parsePayload } from '../../src/components/WebhookFeed.jsx';

describe('parsePayload', () => {
  it('parses a valid JSON string into an object', () => {
    const input = '{"event_type":"task-status-updated","status":"completed"}';
    const result = parsePayload(input);
    expect(result).toEqual({ event_type: 'task-status-updated', status: 'completed' });
  });

  it('parses a JSON array string', () => {
    const input = '[1, 2, 3]';
    const result = parsePayload(input);
    expect(result).toEqual([1, 2, 3]);
  });

  it('returns {} for null', () => {
    expect(parsePayload(null)).toEqual({});
  });

  it('returns {} for undefined', () => {
    expect(parsePayload(undefined)).toEqual({});
  });

  it('returns {} for empty string (falsy)', () => {
    expect(parsePayload('')).toEqual({});
  });

  it('returns {} for malformed JSON', () => {
    expect(parsePayload('{not valid json}')).toEqual({});
  });

  it('returns {} for a truncated JSON string', () => {
    expect(parsePayload('{"key": "val')).toEqual({});
  });

  it('returns the object directly if input is already an object', () => {
    const obj = { event_type: 'order-status-updated', status: 'done' };
    expect(parsePayload(obj)).toBe(obj); // same reference
  });

  it('returns the array directly if input is already an array', () => {
    const arr = [1, 2, 3];
    expect(parsePayload(arr)).toBe(arr);
  });

  it('returns a number directly if input is a non-zero number', () => {
    // typeof 42 !== 'string', so it falls through to `return raw`
    expect(parsePayload(42)).toBe(42);
  });
});
