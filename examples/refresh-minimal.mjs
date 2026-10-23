#!/usr/bin/env node
/**
 * Refresh an existing Truv order and print each connection's result.
 *
 *   TRUV_CLIENT_ID=... TRUV_SECRET=... node examples/refresh-minimal.mjs <original_order_id>
 *   (API_CLIENT_ID and API_SECRET work too, so your demo-apps .env values can be reused.)
 *
 * No dependencies; needs Node 18+. Sandbox keys use the same host as production.
 *
 * What it does, in order:
 *   1. Reads the original order for its user_id and each connection's link_id.
 *   2. Refreshes it, retrying while Truv says the connections are not ready yet.
 *   3. Polls the task list and matches tasks to connections by link_id.
 *   4. Prints refreshed / needs the applicant / cannot be fixed by the applicant / unknown.
 *
 * The connection must already exist: the applicant has to have connected in Bridge once.
 * Refreshes are limited per connection: 1 initial request plus 3 refreshes per 24 hours.
 */

const BASE = process.env.TRUV_API_URL || 'https://prod.truv.com/v1/';
const ID = process.env.TRUV_CLIENT_ID || process.env.API_CLIENT_ID;
const SECRET = process.env.TRUV_SECRET || process.env.API_SECRET;
const orderId = process.argv[2];
if (!ID || !SECRET || !orderId) {
  console.error('Usage: TRUV_CLIENT_ID=... TRUV_SECRET=... node examples/refresh-minimal.mjs <original_order_id>');
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const headers = { 'X-Access-Client-Id': ID, 'X-Access-Secret': SECRET, 'Content-Type': 'application/json', Accept: 'application/json' };

async function call(method, path, body) {
  const res = await fetch(BASE + path.replace(/^\//, ''), { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

const NEEDS_APPLICANT = ['login_error', 'mfa_error', 'session_expired'];
const NOT_FIXABLE = ['no_data', 'unavailable', 'error', 'config_error', 'account_locked', 'unable_to_reset', 'not_supported'];
const verdict = status => status === 'done' ? 'refreshed'
  : NEEDS_APPLICANT.includes(status) ? 'needs the applicant'
  : NOT_FIXABLE.includes(status) ? 'cannot be fixed by the applicant'
  : 'pending';

// 1. The original order: who is it, and which connections does it have?
const original = await call('GET', `orders/${orderId}/`);
if (original.status !== 200) { console.error('Could not read the order:', original.status, JSON.stringify(original.data)); process.exit(1); }
const userId = original.data.user_id;
const connections = [...(original.data.employers || []), ...(original.data.financial_accounts || [])]
  .filter(c => c.link_id)
  .map(c => ({ id: c.id, link_id: c.link_id, name: c.company_name || c.provider?.name || c.id }));
if (!connections.length) { console.error('This order has no connected employer or bank to refresh.'); process.exit(1); }
const products = original.data.financial_accounts?.length && !original.data.employers?.length ? ['assets'] : ['income'];
console.log(`Order ${orderId}: ${connections.map(c => c.name).join(', ')}`);

// 2. Refresh. A refresh sent too early or while another is running comes back as a 400.
const startedAt = new Date(Date.now() - 2000).toISOString();
let refresh;
for (let attempt = 0; attempt < 18; attempt++) {
  refresh = await call('POST', `orders/${orderId}/`, { products });
  if (refresh.status < 400) break;
  const message = JSON.stringify(refresh.data);
  if (refresh.status === 429) { console.error('Refresh limit reached for a connection:', message); process.exit(1); }
  if (refresh.status !== 400) { console.error('Refresh failed:', refresh.status, message); process.exit(1); }
  console.log(`Not ready yet (${/in progress/i.test(message) ? 'a refresh is already running' : 'connection not refreshable yet'}). Retrying in 5s...`);
  await sleep(5000);
}
if (!refresh || refresh.status >= 400) { console.error('Gave up: the connections never became refreshable.'); process.exit(1); }
const refreshId = refresh.data.id;
console.log(`Refresh order ${refreshId} created. Waiting for results...`);

// 3. Poll tasks. Tasks are paginated; match them to connections by link_id, and only count
//    tasks created after the refresh started so an earlier run is never mistaken for this one.
async function resultsNow() {
  const tasks = [];
  let path = `tasks/?user_id=${encodeURIComponent(userId)}&page_size=100`;
  for (let page = 0; page < 5 && path; page++) {
    const r = await call('GET', path);
    if (r.status !== 200) break;
    tasks.push(...(r.data.results || []));
    path = r.data.next ? r.data.next.replace(BASE, '') : null;
  }
  return connections.map(c => {
    const mine = tasks.filter(t => t.link_id === c.link_id && t.created_at >= startedAt);
    const final = mine.find(t => verdict(t.status) !== 'pending');
    return { ...c, status: final?.status || null, verdict: final ? verdict(final.status) : 'pending', message: final?.error_message || '' };
  });
}

let results = [];
for (let i = 0; i < 24; i++) {            // up to about two minutes
  await sleep(5000);
  results = await resultsNow();
  if (results.every(r => r.verdict !== 'pending')) break;
}

// 4. Report. A connection with no task after the wait is unknown. Never treat that as refreshed.
console.log('');
for (const r of results) {
  const v = r.verdict === 'pending' ? 'unknown (no task yet, do not assume it refreshed)' : r.verdict;
  console.log(`${r.name.padEnd(24)} ${v}${r.status ? `  [${r.status}]` : ''}${r.message ? `  "${r.message}"` : ''}`);
}
if (results.some(r => r.verdict === 'needs the applicant')) {
  console.log(`\nSend the applicant this link to answer the challenge: ${refresh.data.share_url}`);
} else if (results.some(r => r.verdict === 'pending')) {
  // Seen after an earlier refresh failed on that connection: Truv creates the refresh order but
  // starts no task. The applicant's link is the way to find out whether the connection still works.
  console.log(`\nA connection with no task may still be waiting on the applicant from an earlier failed refresh. Their link: ${refresh.data.share_url}`);
}
