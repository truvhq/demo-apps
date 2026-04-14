import { describe, it, expect } from 'vitest';
import { $, freq, fmtDate } from '../../src/utils/formatters.js';

describe('formatters', () => {
  describe('$ (currency formatter)', () => {
    it('formats a typical salary amount', () => {
      const result = $(56269.25);
      // toLocaleString is locale-dependent; verify the numeric value is present
      expect(result).toContain('56');
      expect(result).toContain('269');
      expect(result).toContain('25');
      expect(result.startsWith('$')).toBe(true);
    });

    it('formats 56269.25 with dollar sign, comma grouping, and two decimals', () => {
      // In en-US locale this would be "$56,269.25"
      expect($(56269.25)).toBe('$56,269.25');
    });

    it('formats zero as $0.00', () => {
      expect($(0)).toBe('$0.00');
    });

    it('formats null as $0.00', () => {
      // Number(null) === 0
      expect($(null)).toBe('$0.00');
    });

    it('formats undefined as NaN (not a valid currency string)', () => {
      // Number(undefined) === NaN, toLocaleString on NaN returns "NaN"
      expect($(undefined)).toBe('$NaN');
    });

    it('formats negative values', () => {
      const result = $(-1234.5);
      expect(result).toContain('1,234.50');
    });

    it('formats integer values with two decimal places', () => {
      expect($(100)).toBe('$100.00');
    });
  });

  describe('freq (pay frequency mapper)', () => {
    it('maps BW to Biweekly', () => {
      expect(freq('BW')).toBe('Biweekly');
    });

    it('maps W to Weekly', () => {
      expect(freq('W')).toBe('Weekly');
    });

    it('maps M to Monthly', () => {
      expect(freq('M')).toBe('Monthly');
    });

    it('maps SM to Semi-Monthly', () => {
      expect(freq('SM')).toBe('Semi-Monthly');
    });

    it('maps A to Annual', () => {
      expect(freq('A')).toBe('Annual');
    });

    it('returns the input for an unknown key (fallback via ||)', () => {
      expect(freq('X')).toBe('X');
    });

    it('returns undefined for undefined input (undefined || undefined)', () => {
      expect(freq(undefined)).toBeUndefined();
    });

    it('returns null for null input (null || null via short-circuit)', () => {
      expect(freq(null)).toBeNull();
    });
  });

  describe('fmtDate (date formatter)', () => {
    it('formats a valid ISO date string', () => {
      const result = fmtDate('2024-03-15');
      // toLocaleDateString output is locale-dependent, but should contain the date components
      expect(result).toBeTruthy();
      expect(result).not.toBe('-');
    });

    it('formats an ISO datetime string', () => {
      const result = fmtDate('2024-03-15T10:30:00Z');
      expect(result).toBeTruthy();
      expect(result).not.toBe('-');
    });

    it('returns "-" for null', () => {
      expect(fmtDate(null)).toBe('-');
    });

    it('returns "-" for undefined', () => {
      expect(fmtDate(undefined)).toBe('-');
    });

    it('returns "-" for empty string (falsy)', () => {
      expect(fmtDate('')).toBe('-');
    });

    it('returns "-" for zero (falsy)', () => {
      expect(fmtDate(0)).toBe('-');
    });
  });
});
