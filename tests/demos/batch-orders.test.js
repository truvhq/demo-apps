import { describe, it, expect } from 'vitest';
import {
  FIELDS,
  LOCKED_KEYS,
  DEFAULT_SELECTED,
  PRODUCT_OPTIONS,
  sampleApplicants,
  byFieldOrder,
  parseCsvToFields,
  csvCell,
  scriptText,
  buildScript,
  highlightCode,
} from '../../src/demos/scaffolding/batch-orders.jsx';

// ---------------------------------------------------------------------------
// Batch Orders demo — scaffolding + pure UI logic contracts.
// ---------------------------------------------------------------------------

describe('field schema', () => {
  // Only first and last name are required/locked; the rest can be unselected.
  it('locks exactly first_name and last_name', () => {
    expect(LOCKED_KEYS).toEqual(['first_name', 'last_name']);
  });

  it('checks the common intake columns on by default (incl. phone, email, external_user_id)', () => {
    expect(DEFAULT_SELECTED).toEqual(['first_name', 'last_name', 'phone', 'email', 'company_name', 'order_number', 'external_user_id']);
  });

  it('marks every locked field as locked and the rest as optional', () => {
    for (const f of FIELDS) {
      expect(f.locked).toBe(LOCKED_KEYS.includes(f.key));
    }
  });

  it('defaults to the Income & Assets product', () => {
    expect(PRODUCT_OPTIONS[0].value).toBe('income_assets');
    expect(PRODUCT_OPTIONS[0].products).toEqual(['income', 'assets']);
  });
});

describe('sampleApplicants', () => {
  it('only emits the selected fields', () => {
    const rows = sampleApplicants(['first_name', 'last_name'], '');
    expect(rows).toHaveLength(5);
    expect(Object.keys(rows[0]).sort()).toEqual(['first_name', 'last_name']);
  });

  it('leaves phone blank and aliases email off the test inbox', () => {
    const rows = sampleApplicants(['phone', 'email'], 'eric.white@truv.com');
    expect(rows[0].phone).toBe('');
    expect(rows[0].email).toBe('eric.white+bulktest1@truv.com');
    expect(rows[1].email).toBe('eric.white+bulktest2@truv.com');
  });
});

describe('byFieldOrder', () => {
  it('sorts keys into canonical FIELDS order', () => {
    const shuffled = ['notes', 'first_name', 'company_name', 'email'];
    expect([...shuffled].sort(byFieldOrder)).toEqual(['first_name', 'email', 'company_name', 'notes']);
  });
});

describe('parseCsvToFields', () => {
  it('maps headers + aliases and skips blank rows', () => {
    const csv = 'first_name,last_name,case_number\nMaria,Lopez,CASE-1\n\nJames,Nguyen,CASE-2\n';
    const { headerKeys, dataRows, unknown } = parseCsvToFields(csv);
    expect(headerKeys).toEqual(['first_name', 'last_name', 'order_number']); // case_number -> order_number
    expect(unknown).toEqual([]);
    expect(dataRows).toEqual([
      { first_name: 'Maria', last_name: 'Lopez', order_number: 'CASE-1' },
      { first_name: 'James', last_name: 'Nguyen', order_number: 'CASE-2' },
    ]);
  });

  it('reports unknown columns and drops them from rows', () => {
    const csv = 'first_name,last_name,favorite_color\nA,B,blue\n';
    const { headerKeys, dataRows, unknown } = parseCsvToFields(csv);
    expect(unknown).toEqual(['favorite_color']);
    expect(headerKeys).toEqual(['first_name', 'last_name', null]);
    expect(dataRows[0]).toEqual({ first_name: 'A', last_name: 'B' });
  });

  it('handles quoted fields with embedded commas', () => {
    const csv = 'first_name,last_name,notes\nMaria,Lopez,"Recert, priority"\n';
    const { dataRows } = parseCsvToFields(csv);
    expect(dataRows[0].notes).toBe('Recert, priority');
  });

  it('returns empty structures for an empty file', () => {
    expect(parseCsvToFields('')).toEqual({ headerKeys: [], dataRows: [], unknown: [] });
  });
});

describe('csvCell', () => {
  it('quotes cells with commas or quotes and passes plain values through', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('');
  });
});

describe('scriptText', () => {
  it('interpolates the batch size, concurrency, and products array', () => {
    const s = scriptText({ chunkSize: 50, concurrency: 3, delayMs: 0, products: ['income', 'assets'], templateId: '', total: 200, chunkCount: 4 });
    expect(s).toContain('const CHUNK_SIZE  = 50;');
    expect(s).toContain('const CONCURRENCY = 3;');
    expect(s).toContain('products: ["income","assets"]');
    expect(s).toContain('200 applicants → 4 batch request(s)');
  });

  it('adds a pacing sleep line only when delay > 0', () => {
    expect(scriptText({ chunkSize: 1, concurrency: 1, delayMs: 0, product: 'income', templateId: '', total: 1, chunkCount: 1 }))
      .not.toContain('between requests');
    expect(scriptText({ chunkSize: 1, concurrency: 1, delayMs: 250, product: 'income', templateId: '', total: 1, chunkCount: 1 }))
      .toContain('await sleep(250)');
  });

  it('includes template_id only when provided', () => {
    expect(scriptText({ chunkSize: 1, concurrency: 1, delayMs: 0, product: 'income', templateId: 'tmpl_9', total: 1, chunkCount: 1 }))
      .toContain('template_id: "tmpl_9"');
  });
});

describe('buildScript / multi-language', () => {
  const base = { chunkSize: 10, concurrency: 2, delayMs: 0, products: ['income', 'assets'], templateId: '', total: 20, chunkCount: 2, selected: ['first_name', 'last_name', 'company_name', 'ssn'] };

  it('emits Python with requests + the products array + selected fields', () => {
    const s = buildScript('python', base);
    expect(s).toContain('import requests');
    expect(s).toContain('"products": ["income","assets"]');
    expect(s).toContain('"employers": [{"company_name": a["company_name"]}]');
    expect(s).toContain('"ssn": a["ssn"]');
    expect(s).not.toContain('"notes"');
  });

  it('emits cURL with a POST to the batch endpoint and valid-looking JSON (no trailing comma)', () => {
    const s = buildScript('curl', base);
    expect(s).toContain('curl -X POST https://prod.truv.com/v1/orders/batch/');
    expect(s).toContain('"products": ["income","assets"]');
    expect(s).not.toMatch(/,\s*\n\s*}\s*\n\s*\]/); // no trailing comma before closing the order object
  });

  it('includes notification_settings per language when set', () => {
    expect(buildScript('python', { ...base, notify: { suppress: true, delayHours: 0 } })).toContain('"suppress_user_notifications": True');
    expect(buildScript('curl', { ...base, notify: { suppress: false, delayHours: 6 } })).toContain('"first_notification_delay_hours": 6');
  });

  it('falls back to Node for an unknown language', () => {
    expect(buildScript('node', base)).toContain('const CHUNK_SIZE');
    expect(buildScript('whatever', base)).toContain('const CHUNK_SIZE');
  });
});

describe('highlightCode', () => {
  it('escapes HTML and wraps strings/comments in colored spans', () => {
    const html = highlightCode('const x = "a<b>"; // note', 'node');
    expect(html).toContain('&lt;b&gt;');       // the < > inside the string are escaped
    expect(html).toContain('<span');            // something got highlighted
    expect(html).not.toContain('<b>');          // no raw tags leak through
  });

  it('emits only the selected optional fields (so the script matches the real send)', () => {
    const withSsn = scriptText({ chunkSize: 1, concurrency: 1, delayMs: 0, product: 'income', templateId: '', total: 1, chunkCount: 1, selected: ['first_name', 'last_name', 'ssn'] });
    expect(withSsn).toContain('ssn: a.ssn');
    expect(withSsn).not.toContain('company_name');

    const withCompany = scriptText({ chunkSize: 1, concurrency: 1, delayMs: 0, product: 'income', templateId: '', total: 1, chunkCount: 1, selected: ['first_name', 'last_name', 'company_name'] });
    expect(withCompany).toContain('employers: a.company_name');
    expect(withCompany).not.toContain('ssn: a.ssn');
  });
});
