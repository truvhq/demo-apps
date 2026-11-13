// Presentation scaffolding + field schema for the Batch Orders demo.

// The applicant fields you can put in the file. Only first and last name are locked
// on (the API requires them); phone, email, company_name, order_number and
// external_user_id are checked by default but can be removed. Everything else is
// opt-in. `label` is the human name shown in the UI; `key` is the API field.
export const FIELDS = [
  { key: 'first_name',      label: 'First name',       locked: true,  required: true,  sample: ['Maria', 'James', 'Aisha', 'Tomas', 'Dana'] },
  { key: 'last_name',       label: 'Last name',        locked: true,  required: true,  sample: ['Lopez', 'Nguyen', 'Bello', 'Reyes', 'Whitfield'] },
  { key: 'phone',          label: 'Phone',             locked: false, warn: true, placeholder: 'real mobile #', hint: 'Must be a real, textable mobile number. A fake number fails the order even in the sandbox, so sample rows leave this blank. Add your own number to watch SMS go out (or suppress notifications below).', sample: ['', '', '', '', ''] },
  { key: 'email',          label: 'Email',             locked: false, warn: true, placeholder: 'your email', hint: 'Must be a valid address. Sample rows leave this blank, so add your own so you receive the verification email. Or set a test inbox below to auto-fill +bulktestN aliases you can receive.', sample: ['', '', '', '', ''] },
  { key: 'company_name',   label: 'Company name',      locked: false, hint: 'The employer, for the income/employment part of the order. Applicants without a match pick their employer in Bridge.', sample: ['Starbucks', 'Walmart', 'Target', 'Home Depot', 'Kroger'] },
  { key: 'order_number',   label: 'Order number',      locked: false, hint: 'Your ID for the case or household - it can span several people (think case_id or household_id) so you can tie results back to your system. Reusing an existing value returns "Existing" instead of creating a duplicate, so re-runs are safe. Give each person their own external user ID (next column).', sample: ['CASE-1001', 'CASE-1002', 'CASE-1003', 'CASE-1004', 'CASE-1005'] },
  { key: 'external_user_id', label: 'External user ID', locked: false, hint: 'Your unique ID for the individual. It keeps people apart when they share an order number - without it, two applicants on the same order number can end up seeing each other\'s connected data (whoever connects first). If you can only send one of the two, send this.', sample: ['APP-5501', 'APP-5502', 'APP-5503', 'APP-5504', 'APP-5505'] },
  { key: 'date_of_birth',  label: 'Date of birth',     locked: false, hint: 'Format YYYY-MM-DD, e.g. 1990-04-12.', sample: ['1990-04-12', '1985-11-02', '1993-07-20', '1979-01-30', '1988-09-15'] },
  { key: 'ssn',            label: 'SSN',               locked: false, hint: 'Full 9 or last 4 digits. Leave out of demos unless you need it.', sample: ['', '', '', '', ''] },
  { key: 'cc_emails',      label: 'CC emails',         locked: false, hint: 'Extra recipients, separated by semicolons.', sample: ['', '', '', '', ''] },
  { key: 'notes',          label: 'Notes',             locked: false, hint: 'Free text, up to 2,000 characters.', sample: ['Recert', 'New application', '', 'Priority', ''] },
];

export const LOCKED_KEYS = FIELDS.filter(f => f.locked).map(f => f.key);
// Checked by default: the two locked names plus the fields most intake files carry.
// Phone is on by default but its sample cells stay blank (a real mobile is required).
export const DEFAULT_SELECTED = ['first_name', 'last_name', 'phone', 'email', 'company_name', 'order_number', 'external_user_id'];

// Human label for a field key (falls back to the key).
export function fieldLabel(key) {
  const f = FIELDS.find(x => x.key === key);
  return f ? f.label : key;
}

// Products this demo supports. Benefits intake usually verifies income and assets,
// so that is the default. Employment-only is not a public-sector use case, so it is
// not offered. Each option maps to the Truv `products` array sent on every order.
export const PRODUCT_OPTIONS = [
  { value: 'income_assets', label: 'Income & Assets', products: ['income', 'assets'] },
  { value: 'income',        label: 'Income & Employment', products: ['income'] },
  { value: 'assets',        label: 'Assets only', products: ['assets'] },
];

export function productsFor(value) {
  return (PRODUCT_OPTIONS.find(o => o.value === value) || PRODUCT_OPTIONS[0]).products;
}

// Build a valid, receivable test email by aliasing the inbox with +bulktestN, so
// every sample order has a real address that reaches one inbox. Falls back to a
// valid example address when no inbox is set yet.
export function aliasEmail(emailBase, rowIndex) {
  const n = rowIndex + 1;
  const base = String(emailBase || '').trim();
  const at = base.indexOf('@');
  if (at > 0) {
    const local = base.slice(0, at).split('+')[0];
    const domain = base.slice(at + 1);
    if (local && domain) return `${local}+bulktest${n}@${domain}`;
  }
  return `batch-demo+bulktest${n}@example.com`;
}

// True when a cell value looks like one of our generated aliases, so re-aliasing on
// an inbox change replaces generated emails but leaves anything hand-typed alone.
export function isAliasEmail(value) {
  return /\+bulktest\d+@/.test(String(value || ''));
}

// A short, unique-per-click token so each fresh batch of sample rows gets brand new
// order numbers and external user IDs (so they create fresh orders, not "Existing").
export function freshSeed() {
  return Date.now().toString(36).slice(-5);
}

// The sample value for one field in one row. phone and email stay blank (a real mobile
// is required; add your own email); order_number and external_user_id are made unique
// with the per-click `seed` so re-sampling never collides; everything else cycles its
// sample. email auto-fills only when a test inbox is set, as +bulktestN aliases.
export function sampleValue(key, rowIndex, emailBase, seed) {
  if (key === 'phone') return '';
  if (key === 'email') return emailBase && String(emailBase).trim() ? aliasEmail(emailBase, rowIndex) : '';
  if (key === 'order_number') return `CASE-${seed || '1000'}-${rowIndex + 1}`;
  if (key === 'external_user_id') return `APP-${seed || '5500'}-${rowIndex + 1}`;
  const f = FIELDS.find(x => x.key === key);
  if (!f) return '';
  return f.sample[rowIndex % f.sample.length] ?? '';
}

// A few ready-made applicants so the demo is playable without a CSV in hand. `seed`
// (from freshSeed) makes order_number / external_user_id unique for this batch.
export function sampleApplicants(selectedKeys, emailBase, seed) {
  const n = 5;
  const out = [];
  for (let i = 0; i < n; i++) {
    const row = {};
    for (const f of FIELDS) {
      if (selectedKeys.includes(f.key)) row[f.key] = sampleValue(f.key, i, emailBase, seed);
    }
    out.push(row);
  }
  return out;
}

// CSV header aliases accepted on upload, mapped onto our field keys.
export const HEADER_ALIASES = {
  case_number: 'order_number',
  company: 'company_name',
  employer: 'company_name',
  first: 'first_name',
  last: 'last_name',
  dob: 'date_of_birth',
  cc: 'cc_emails',
  mobile: 'phone',
};

// Sort field keys into the canonical FIELDS order (used when adding selections).
export function byFieldOrder(a, b) {
  const order = FIELDS.map(f => f.key);
  return order.indexOf(a) - order.indexOf(b);
}

// Minimal RFC-4180-ish CSV splitter: quoted fields with embedded commas, quotes,
// and newlines. Returns a 2D array of cells.
export function parseCsvGrid(text) {
  const rows = []; let row = []; let cell = ''; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.length);
}

// Parse an uploaded CSV into field-keyed row objects. Returns the recognized
// header keys (for auto-selecting columns), the data rows, and any unknown headers.
export function parseCsvToFields(text) {
  const grid = parseCsvGrid(text);
  if (!grid.length) return { headerKeys: [], dataRows: [], unknown: [] };
  const rawHeaders = grid[0].map(h => String(h).trim());
  const knownKeys = new Set(FIELDS.map(f => f.key));
  const unknown = [];
  const headerKeys = rawHeaders.map(h => {
    const norm = h.toLowerCase().replace(/\s+/g, '_');
    const mapped = knownKeys.has(norm) ? norm : HEADER_ALIASES[norm];
    if (!mapped) { if (h) unknown.push(h); return null; }
    return mapped;
  });
  const dataRows = [];
  for (const r of grid.slice(1)) {
    if (!r.some(c => String(c).trim() !== '')) continue;
    const obj = {};
    headerKeys.forEach((k, i) => { if (k) obj[k] = String(r[i] ?? '').trim(); });
    dataRows.push(obj);
  }
  return { headerKeys, dataRows, unknown };
}

// Escape a single CSV cell.
export function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Find duplicate non-empty order_numbers across rows. Returns the list of
// offending values (each listed once). Within one batch a repeated order_number
// yields the EXISTING order (and its link) for the later row rather than a new
// order, so the UI warns before sending.
export function duplicateOrderNumbers(rows) {
  const seen = new Map();
  const dupes = new Set();
  for (const r of rows) {
    const on = String(r.order_number || '').trim();
    if (!on) continue;
    if (seen.has(on)) dupes.add(on); else seen.set(on, true);
  }
  return [...dupes];
}

// The live "script" view. Mirrors what the server runner actually does - including
// the optional fields currently selected - so a solutions engineer can lift it as
// a starting point and see both the chunking knobs and the real payload.
export function scriptText({ chunkSize, concurrency, delayMs, products = ['income', 'assets'], templateId, total, chunkCount, selected = [], notify }) {
  const productsJson = JSON.stringify(products);
  const has = k => selected.includes(k);
  const tmpl = templateId ? `,\n      template_id: "${templateId}"` : '';
  // notification_settings: suppress wins over a delay (the API ignores the delay when suppressed).
  const notifLine = notify && notify.suppress
    ? '\n      notification_settings: { suppress_user_notifications: true },'
    : (notify && notify.delayHours > 0
        ? `\n      notification_settings: { first_notification_delay_hours: ${notify.delayHours} },`
        : '');
  const pace = delayMs > 0 ? `\n    await sleep(${delayMs})            // wait ${delayMs}ms between requests` : '';
  const optional = [
    has('order_number') && '      order_number: a.order_number,',
    has('external_user_id') && '      external_user_id: a.external_user_id,',
    has('date_of_birth') && '      date_of_birth: a.date_of_birth,',
    has('ssn') && '      ssn: a.ssn,',
    has('cc_emails') && '      cc_emails: a.cc_emails?.split(";"),',
    has('notes') && '      notes: a.notes,',
  ].filter(Boolean).join('\n');
  const employers = has('company_name')
    ? '\n      employers: a.company_name ? [{ company_name: a.company_name }] : undefined,'
    : '';
  const contact = [has('email') && 'a.email', has('phone') && 'a.phone'].filter(Boolean);
  const contactLine = contact.length ? `\n      ${has('email') ? 'email: a.email,' : ''}${has('email') && has('phone') ? ' ' : ''}${has('phone') ? 'phone: a.phone,' : ''}` : '';
  return `// ${total} applicants → ${chunkCount} batch request(s)
const CHUNK_SIZE  = ${chunkSize};   // orders per request
const CONCURRENCY = ${concurrency};   // requests sent at the same time

const batches = chunk(applicants, CHUNK_SIZE);

await pool(batches, CONCURRENCY, async (orders) => {${pace}
  // 1. create the batch - the API returns right away with a job id
  const { id } = await truv.post("/v1/orders/batch/", {
    orders: orders.map(a => ({
      products: ${productsJson},
      first_name: a.first_name,
      last_name:  a.last_name,${contactLine}${employers}
${optional}${notifLine}${tmpl}
    }))
  });

  // 2. poll the job until it finishes
  let job = { status: "pending" };
  while (job.status === "pending") {
    await sleep(1500);
    job = await truv.get(\`/v1/orders/batch/\${id}/\`);
  }

  // 3. each result is created | existing | failed - one bad row never blocks the rest
  for (const r of job.results) record(r);
});

// or skip the polling and handle the order-batch-completed webhook instead.`;
}

// Languages offered in the script view.
export const SCRIPT_LANGS = [
  { id: 'node', label: 'Node.js' },
  { id: 'python', label: 'Python' },
  { id: 'curl', label: 'cURL' },
];

// Per-order fields and how each renders in each language (bare "key: value", no
// trailing comma; callers join them). company_name becomes an employers[] entry.
const ORDER_FIELDS = [
  { key: 'email',           py: '"email": a["email"]',                         curl: '"email": "maria.lopez@example.com"' },
  { key: 'phone',           py: '"phone": a["phone"]',                         curl: '"phone": "+15555550123"' },
  { key: 'company_name',    py: '"employers": [{"company_name": a["company_name"]}]', curl: '"employers": [{ "company_name": "Home Depot" }]' },
  { key: 'order_number',    py: '"order_number": a["order_number"]',            curl: '"order_number": "CASE-1001"' },
  { key: 'external_user_id', py: '"external_user_id": a["external_user_id"]',   curl: '"external_user_id": "APP-5501"' },
  { key: 'date_of_birth',   py: '"date_of_birth": a["date_of_birth"]',          curl: '"date_of_birth": "1990-04-12"' },
  { key: 'ssn',             py: '"ssn": a["ssn"]',                             curl: '"ssn": "123456789"' },
  { key: 'cc_emails',       py: '"cc_emails": a["cc_emails"].split(";")',       curl: '"cc_emails": ["supervisor@example.org"]' },
  { key: 'notes',           py: '"notes": a["notes"]',                         curl: '"notes": "Recert"' },
];

function notifLang(notify, lang) {
  if (!notify) return null;
  if (notify.suppress) {
    const v = lang === 'python' ? 'True' : 'true';
    return `"notification_settings": {"suppress_user_notifications": ${v}}`;
  }
  if (notify.delayHours > 0) return `"notification_settings": {"first_notification_delay_hours": ${notify.delayHours}}`;
  return null;
}

export function pythonScript({ chunkSize, products = ['income', 'assets'], templateId, total, chunkCount, selected = [], notify }) {
  const lines = [
    `"products": ${JSON.stringify(products)}`,
    `"first_name": a["first_name"]`,
    `"last_name": a["last_name"]`,
    ...ORDER_FIELDS.filter(f => selected.includes(f.key)).map(f => f.py),
    notifLang(notify, 'python'),
    templateId ? `"template_id": "${templateId}"` : null,
  ].filter(Boolean).map(l => '            ' + l).join(',\n');
  return `# ${total} applicants into ${chunkCount} batch request(s)
import requests, time

BASE = "https://prod.truv.com/v1"
HEADERS = {
    "X-Access-Client-Id": "YOUR_CLIENT_ID",
    "X-Access-Secret": "YOUR_SECRET",
    "Content-Type": "application/json",
}
CHUNK_SIZE = ${chunkSize}   # orders per request

def chunked(items, n):
    for i in range(0, len(items), n):
        yield items[i:i + n]

for orders in chunked(applicants, CHUNK_SIZE):
    body = {"orders": [{
${lines}
    } for a in orders]}

    # 1. create the batch (returns right away with a job id)
    job = requests.post(f"{BASE}/orders/batch/", json=body, headers=HEADERS).json()

    # 2. poll the job until it finishes
    while job["status"] == "pending":
        time.sleep(1.5)
        job = requests.get(f"{BASE}/orders/batch/{job['id']}/", headers=HEADERS).json()

    # 3. each result is created | existing | failed (one bad row never blocks the rest)
    for r in job["results"]:
        record(r)`;
}

export function curlScript({ products = ['income', 'assets'], templateId, selected = [], notify }) {
  const lines = [
    `"products": ${JSON.stringify(products)}`,
    `"first_name": "Maria"`,
    `"last_name": "Lopez"`,
    ...ORDER_FIELDS.filter(f => selected.includes(f.key)).map(f => f.curl),
    notifLang(notify, 'curl'),
    templateId ? `"template_id": "${templateId}"` : null,
  ].filter(Boolean).map(l => '      ' + l).join(',\n');
  return `# Create one batch (repeat this request for each chunk of your file)
curl -X POST https://prod.truv.com/v1/orders/batch/ \\
  -H "X-Access-Client-Id: YOUR_CLIENT_ID" \\
  -H "X-Access-Secret: YOUR_SECRET" \\
  -H "Content-Type: application/json" \\
  -d '{
  "orders": [
    {
${lines}
    }
  ]
}'

# Returns 202 { "id": "JOB_ID", "status": "pending" }. Poll until completed:
curl https://prod.truv.com/v1/orders/batch/JOB_ID/ \\
  -H "X-Access-Client-Id: YOUR_CLIENT_ID" \\
  -H "X-Access-Secret: YOUR_SECRET"

# Each result is created | existing | failed, or handle the order-batch-completed webhook.`;
}

// Dispatch to the right language generator. Node is the richest (per-row mapping);
// Python and cURL mirror the same payload and flow.
export function buildScript(lang, params) {
  if (lang === 'python') return pythonScript(params);
  if (lang === 'curl') return curlScript(params);
  return scriptText(params);
}

// Minimal, dependency-free syntax highlighter. Escapes HTML, then wraps comments,
// strings, numbers, keywords (and cURL flags) in colored spans for a dark surface.
// Returns an HTML string for dangerouslySetInnerHTML.
const HL_KEYWORDS = {
  node: ['const', 'let', 'var', 'await', 'async', 'function', 'return', 'for', 'while', 'if', 'else', 'new', 'of', 'in', 'true', 'false', 'null', 'undefined'],
  python: ['import', 'from', 'as', 'def', 'for', 'while', 'if', 'elif', 'else', 'in', 'return', 'True', 'False', 'None', 'with', 'and', 'or', 'not', 'yield', 'lambda'],
  curl: ['curl'],
};
const HL_COLOR = { comment: '#8b949e', string: '#7ee787', number: '#79c0ff', keyword: '#ff7b72', flag: '#d2a8ff' };

export function highlightCode(code, lang) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const span = (kind, text) => `<span style="color:${HL_COLOR[kind]}${kind === 'comment' ? ';font-style:italic' : ''}">${esc(text)}</span>`;
  const commentPat = lang === 'node' ? '\\/\\/[^\\n]*' : '#[^\\n]*';
  const kws = HL_KEYWORDS[lang] || [];
  const kwPat = kws.length ? `\\b(?:${kws.join('|')})\\b` : '(?!x)x';
  const flagPat = lang === 'curl' ? '|(--?[A-Za-z][A-Za-z-]*)' : '';
  const re = new RegExp(
    `(${commentPat})` +
    `|("""[\\s\\S]*?"""|'''[\\s\\S]*?''')` +
    `|("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\`)` +
    `|(\\b\\d+(?:\\.\\d+)?\\b)` +
    `|(${kwPat})${flagPat}`,
    'g'
  );
  let out = '', last = 0, m;
  while ((m = re.exec(code))) {
    if (m.index > last) out += esc(code.slice(last, m.index));
    if (m[1]) out += span('comment', m[1]);
    else if (m[2]) out += span('string', m[2]);
    else if (m[3]) out += span('string', m[3]);
    else if (m[4]) out += span('number', m[4]);
    else if (m[5]) out += span('keyword', m[5]);
    else if (m[6]) out += span('flag', m[6]);
    last = re.lastIndex;
    if (re.lastIndex === m.index) re.lastIndex++;
  }
  out += esc(code.slice(last));
  return out;
}

export const STEPS = [
  { title: 'The payload', guide: '<p>A batch is just an array of orders. Build a few applicants in the table, or upload a CSV, and pick which columns ride along. Only <code>first_name</code> and <code>last_name</code> are required; phone, email, company name, order number and external user ID are on by default.</p><p>Only the fields you select are sent, so you can see exactly what one order in the array looks like. Download a matching template any time.</p>' },
  { title: 'Why split one file into batches', guide: '<p>A single request holds up to 10,000 orders. To send more you run several requests - 30,000 at once is just 3 requests of 10,000, sent in parallel. Splitting also lets you watch progress and isolate failures. Play with the knobs and watch the live script change:</p><ul><li><strong>Batch size</strong> - orders per request</li><li><strong>Sent at the same time</strong> - batches in parallel</li><li><strong>Delay</strong> - pause between requests</li></ul>' },
  { title: 'The 202 + job id', guide: '<p><code>202</code> is the server saying "got it, I\'ll do this in the background," handing back a job id you use to check progress:</p><pre>POST /v1/orders/batch/\n{ "orders": [ ... ] }\n\n202 { "id": "...", "status": "pending" }</pre><p>The orders are created in the background. <strong>Each order is processed on its own, so one bad row never blocks the rest.</strong></p>' },
  { title: 'Poll vs. webhook', guide: '<p>Two ways to find out when a job finishes:</p><p><strong>Polling</strong> means your code keeps checking back ("done yet?") until the job finishes:</p><pre>GET /v1/orders/batch/{id}/</pre><p>A <strong>webhook</strong> flips that: Truv calls your system the moment it is done, so you never have to ask. Handle <code>order-batch-completed</code> (shown in the panel when a webhook URL is configured). Either way, each row comes back <strong>created</strong>, <strong>existing</strong> (the order_number already existed, nothing duplicated), or <strong>failed</strong> (with the reason).</p>' },
  { title: 'Handle the results', guide: '<p>See how you would wire this into your own system: read each per-order result, open a <code>share_url</code>, and note the <strong>notification_settings</strong> callout for jobs that run off-hours. Export the results to CSV to inspect the full shape.</p>' },
];

export const INTRO_SLIDE_CONFIG = {
  label: 'Public Sector · Batch Orders',
  title: 'Learn the batch orders endpoint',
  subtitle: 'A hands-on way to understand how bulk order creation works - the batch endpoint, the job lifecycle, the per-order results, and the order-batch-completed webhook and how to handle it. Build a small file, send it to the Truv sandbox, and watch what comes back. This is a learning sandbox, not a production run.',
};
