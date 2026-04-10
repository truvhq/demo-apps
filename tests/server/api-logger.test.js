import { describe, it, expect } from 'vitest';
import { redactSensitive } from '../../server/api-logger.js';

describe('redactSensitive', () => {
  it('redacts ssn field, keeping last 4 characters', () => {
    const input = { ssn: '123-45-6789' };
    const result = redactSensitive(input);
    expect(result.ssn).toBe('***6789');
  });

  it('redacts social_security_number field', () => {
    const input = { social_security_number: '987-65-4321' };
    const result = redactSensitive(input);
    expect(result.social_security_number).toBe('***4321');
  });

  it('redacts email field, keeping last 4 characters', () => {
    const input = { email: 'john.doe@example.com' };
    const result = redactSensitive(input);
    expect(result.email).toBe('***.com');
  });

  it('redacts phone field, keeping last 4 characters', () => {
    const input = { phone: '555-123-4567' };
    const result = redactSensitive(input);
    expect(result.phone).toBe('***4567');
  });

  it('redacts date_of_birth field', () => {
    const input = { date_of_birth: '1990-01-15' };
    const result = redactSensitive(input);
    expect(result.date_of_birth).toBe('***1-15');
  });

  it('uses just "***" for short values (length <= 4)', () => {
    const input = { ssn: '1234' };
    const result = redactSensitive(input);
    expect(result.ssn).toBe('***');
  });

  it('uses just "***" for very short values', () => {
    const input = { email: 'ab' };
    const result = redactSensitive(input);
    expect(result.email).toBe('***');
  });

  it('passes non-sensitive fields through unchanged', () => {
    const input = { first_name: 'John', last_name: 'Doe', employer: 'Acme' };
    const result = redactSensitive(input);
    expect(result).toEqual({ first_name: 'John', last_name: 'Doe', employer: 'Acme' });
  });

  it('handles a mix of sensitive and non-sensitive fields', () => {
    const input = {
      first_name: 'Jane',
      ssn: '111-22-3333',
      email: 'jane@test.com',
      employer: 'WidgetCo',
    };
    const result = redactSensitive(input);
    expect(result.first_name).toBe('Jane');
    expect(result.ssn).toBe('***3333');
    expect(result.email).toBe('***.com');
    expect(result.employer).toBe('WidgetCo');
  });

  it('handles nested objects recursively', () => {
    const input = {
      user: {
        name: 'Bob',
        ssn: '999-88-7777',
        contact: {
          email: 'bob@mail.com',
          phone: '800-555-0199',
        },
      },
    };
    const result = redactSensitive(input);
    expect(result.user.name).toBe('Bob');
    expect(result.user.ssn).toBe('***7777');
    expect(result.user.contact.email).toBe('***.com');
    expect(result.user.contact.phone).toBe('***0199');
  });

  it('handles arrays by redacting each element', () => {
    const input = [
      { ssn: '111-11-1111', name: 'Alice' },
      { ssn: '222-22-2222', name: 'Bob' },
    ];
    const result = redactSensitive(input);
    expect(result).toEqual([
      { ssn: '***1111', name: 'Alice' },
      { ssn: '***2222', name: 'Bob' },
    ]);
  });

  it('handles arrays nested inside objects', () => {
    const input = {
      employees: [
        { email: 'a@b.com', role: 'admin' },
        { email: 'c@d.org', role: 'user' },
      ],
    };
    const result = redactSensitive(input);
    expect(result.employees[0].email).toBe('***.com');
    expect(result.employees[0].role).toBe('admin');
    expect(result.employees[1].email).toBe('***.org');
    expect(result.employees[1].role).toBe('user');
  });

  it('skips redaction if sensitive field value is not a string', () => {
    const input = { ssn: 123456789, email: null };
    const result = redactSensitive(input);
    // Non-string values for sensitive keys are not redacted
    expect(result.ssn).toBe(123456789);
    expect(result.email).toBeNull();
  });

  it('returns primitive values as-is', () => {
    expect(redactSensitive('hello')).toBe('hello');
    expect(redactSensitive(42)).toBe(42);
    expect(redactSensitive(null)).toBeNull();
    expect(redactSensitive(undefined)).toBeUndefined();
  });

  it('returns an empty object for an empty object', () => {
    expect(redactSensitive({})).toEqual({});
  });

  it('returns an empty array for an empty array', () => {
    expect(redactSensitive([])).toEqual([]);
  });
});
