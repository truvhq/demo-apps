// Throwaway script to probe the /v1/providers/ endpoint with different query params.
// Usage: node scripts/probe-providers.js
import 'dotenv/config';
import fetch from 'node-fetch';

const headers = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'X-Access-Client-Id': process.env.API_CLIENT_ID,
  'X-Access-Secret': process.env.API_SECRET,
};
const BASE = 'https://prod.truv.com/v1/providers/';

async function probe(label, params) {
  const url = `${BASE}?${new URLSearchParams(params)}`;
  const start = Date.now();
  const r = await fetch(url, { headers });
  const t = Date.now() - start;
  const body = await r.json().catch(() => ({}));
  const list = body.results || (Array.isArray(body) ? body : []) || [];
  const names = list.slice(0, 5).map(p => p.name || p.id);
  const total = body.count ?? body.total ?? list.length;
  console.log(`\n[${label}] ${r.status} (${t}ms) — ${list.length} of ${total ?? '?'} returned`);
  console.log(`  url: ${url}`);
  console.log(`  first 5: ${JSON.stringify(names)}`);
}

await probe('search=Chase', { search: 'Chase', data_source: 'financial_accounts', product_type: 'transactions' });
await probe('query=Chase', { query: 'Chase', data_source: 'financial_accounts', product_type: 'transactions' });
await probe('q=Chase', { q: 'Chase', data_source: 'financial_accounts', product_type: 'transactions' });
await probe('name=Chase', { name: 'Chase', data_source: 'financial_accounts', product_type: 'transactions' });
await probe('no filter', { data_source: 'financial_accounts', product_type: 'transactions' });
