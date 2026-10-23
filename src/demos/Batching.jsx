/**
 * FILE SUMMARY: Guided sales walkthrough for Truv batch order intake.
 * Same shell as Walkthrough.jsx (left = animated product surface, right = narrative),
 * but every stage animates the process itself rather than showing a static mock:
 * rows land in a folder, get validated, fly into POST /v1/orders/, bounce off the
 * duplicate ledger, fan out as confirmations, and come back as results.
 * The final stage is the download area for the setup guides and the runnable kit.
 * Route: #public-sector/batching
 */
import { useState, useEffect } from 'preact/hooks';
// batching.css is self-contained (shell + animations) so this demo has no
// dependency on any other demo's stylesheet and deploys on its own branch.
import './batching.css';
import { Header } from '../components/Header.jsx';
import { Icons } from '../components/Icons.jsx';

/* ---------- shared bits ---------- */

// Columns mirror a real intake file. The API requires products, first_name and
// last_name; in practice you also send email so the applicant can be invited.
// Everything after that is the customer's choice, so the illustration shows
// separate columns rather than a single combined "name".
const ROWS = [
  { f: 'Maria', l: 'Lopez', e: 'maria.lopez@mail.gov', c: 'CASE-4471' },
  { f: 'James', l: 'Nguyen', e: 'j.nguyen@mail.gov', c: 'CASE-4472' },
  { f: 'Aisha', l: 'Bello', e: 'a.bello@mail.gov', c: 'CASE-4473' },
  { f: 'Tomas', l: 'Reyes', e: 't.reyes@mail.gov', c: 'CASE-4474' },
  { f: 'Dana', l: 'Whitfield', e: 'd.whitfield@mail.gov', c: 'CASE-4475' },
];

/** A small CSV card used across several stages. `compact` drops the email
 *  column so the sheet still reads when it sits in a narrow column. */
function Sheet({ rows = ROWS, badRow = -1, phase = 'idle', title = 'july31_batch.csv', compact = false }) {
  return (
    <div class={`bt-sheet phase-${phase}${compact ? ' compact' : ''}`}>
      <div class="bt-sheet-head">
        <span class="bt-file-ic" aria-hidden="true">
          <Icons.file size={14} />
        </span>
        <span class="bt-file-name">{title}</span>
        <span class="bt-file-meta">{rows.length} rows · your columns</span>
      </div>
      <div class="bt-sheet-cols">
        <span>first_name</span>
        <span>last_name</span>
        {!compact && <span>email</span>}
        <span>case_number<em>yours</em></span>
        <span />
      </div>
      <div class="bt-sheet-rows">
        {rows.map((r, k) => (
          <div
            class={`bt-row${badRow === k ? ' bad' : ''}`}
            style={{ '--i': k }}
          >
            <span class="n">{r.f}</span>
            <span class={`n${r.l ? '' : ' empty'}`}>{r.l || 'empty'}</span>
            {!compact && <span class="e">{r.e}</span>}
            <span class="c">{r.c}</span>
            <span class="mark" aria-hidden="true" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- stage 01: the problem ---------- */
function TheProblem() {
  return (
    <div class="bt-art bt-problem">
      <div class="bt-queue" aria-hidden="true">
        {Array.from({ length: 18 }).map((_, k) => (
          <div class="bt-queue-card" style={{ '--i': k }} />
        ))}
      </div>
      <div class="bt-problem-card">
        <div class="bt-problem-num">2,400</div>
        <div class="bt-problem-lbl">verifications waiting this week</div>
        <div class="bt-problem-eg">Example agency - illustrative figures</div>
        <div class="bt-problem-split">
          <div><b>1</b><span>caseworker</span></div>
          <div><b>~90s</b><span>per order, by hand</span></div>
          <div><b>60h</b><span>of typing</span></div>
        </div>
      </div>
    </div>
  );
}

/* ---------- stage 02: the drop ---------- */
function TheDrop() {
  return (
    <div class="bt-art bt-drop">
      <div class="bt-folder">
        <div class="bt-folder-tab">input</div>
        <div class="bt-folder-body">
          <div class="bt-drop-sheet"><Sheet phase="land" /></div>
        </div>
      </div>
      <div class="bt-drop-caption">Exported automatically, or dropped in by hand as a fallback.</div>
    </div>
  );
}

/* ---------- stage 03: checked, then sent (validation + submission merged) ----
   One narrative: the tool checks the file, and only a clean file is sent. The
   toggle makes the consequence concrete - clean file becomes five orders, one
   bad value becomes none. ------------------------------------------------- */
function CheckAndSend({ mode }) {
  const bad = mode === 'reject' ? 2 : -1;
  const rows = mode === 'reject'
    ? ROWS.map((r, k) => (k === bad ? { ...r, l: '' } : r))
    : ROWS;

  // 'checking' -> 'verdict' -> 'sending' -> 'done'. A bad row is set aside and
  // the rest are still sent, which is how Truv's batch endpoint behaves.
  const good = mode === 'reject' ? ROWS.length - 1 : ROWS.length;
  const [step, setStep] = useState('checking');
  const [sent, setSent] = useState(0);

  // Every beat is scheduled up front as a flat setTimeout. No nested timers and
  // no interval closures, so the sequence cannot half-run and cleanup is total.
  useEffect(() => {
    setStep('checking');
    setSent(0);
    const CHECK_MS = 780;      // scan finishes, verdict appears
    const SEND_AT = 1150;      // first row leaves
    const PER_ROW = 340;
    const timers = [setTimeout(() => setStep('verdict'), CHECK_MS)];
    timers.push(setTimeout(() => setStep('sending'), SEND_AT));
    for (let k = 0; k < good; k++) {
      timers.push(setTimeout(() => setSent(k + 1), SEND_AT + k * PER_ROW));
    }
    timers.push(setTimeout(() => setStep('done'), SEND_AT + good * PER_ROW));
    return () => timers.forEach(clearTimeout);
  }, [mode]);

  const flying = step === 'sending' || step === 'done';

  return (
    <div class="bt-art bt-checksend">
      <div class="bt-cs-row">
        <div class="bt-cs-file">
          <div class="bt-scanline" aria-hidden="true" />
          <Sheet rows={rows} phase={mode === 'reject' ? 'reject' : 'scan'} badRow={bad} compact />
        </div>

        <div class={`bt-cs-wire${flying ? ' live' : ''}`} aria-hidden="true">
          <svg viewBox="0 0 90 200" preserveAspectRatio="none">
            <path d="M0 100 C 30 100, 60 100, 90 100" />
          </svg>
          {flying && ROWS.map((_, k) => (
            <span class={`bt-packet${k < sent ? ' gone' : ''}${k === sent ? ' fly' : ''}`} />
          ))}
        </div>

        <div class="bt-cs-out">
          <div class="bt-endpoint">
            <span class="mth">POST</span>
            <span class="path">/v1/orders/batch/</span>
          </div>
          <div class="bt-counter">
            <div class={`bt-counter-n${mode === 'reject' ? ' zero' : ''}`}>
              {sent}
            </div>
            <div class="bt-counter-l">orders created</div>
          </div>
          {mode === 'reject' && step !== 'checking' && (
            <div class="bt-cs-blocked">1 row skipped</div>
          )}
        </div>
      </div>

      {step !== 'checking' && (
        <div class={`bt-verdict ${mode === 'reject' ? 'bad' : 'good'}`}>
          <div>
            <div class="bt-verdict-t">
              {mode === 'reject' ? '4 of 5 rows sent' : 'All 5 rows valid'}
            </div>
            <div class="bt-verdict-d">
              {mode === 'reject'
                ? <>Row 3 skipped · <code>last_name</code> is empty</>
                : 'Checked on your server, then submitted'}
            </div>
          </div>
          <div class="bt-verdict-n">
            {step !== 'done' ? 'sending…'
              : mode === 'reject' ? 'row 3 → failed/' : 'moved to processed/'}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- stage 05: the ledger ---------- */
function Ledger() {
  return (
    <div class="bt-art bt-ledger">
      <div class="bt-ledger-wrap">
        <div class="bt-redrop">
          <div class="bt-redrop-lbl">Same file, dropped again</div>
          <Sheet phase="bounce" title="july31_batch (copy).csv" compact />
        </div>
        <div class="bt-shield" aria-hidden="true">
          <div class="bt-shield-ring r1" />
          <div class="bt-shield-ring r2" />
          <div class="bt-shield-core">
            <Icons.shieldCheck size={22} />
          </div>
        </div>
        <div class="bt-ledger-card">
          <div class="bt-ledger-head">state/ledger.csv</div>
          {ROWS.map((r, k) => (
            <div class="bt-ledger-row" style={{ '--i': k }}>
              <span class="c">{r.c}</span>
              <span class="s">already ordered</span>
            </div>
          ))}
          <div class="bt-ledger-foot">0 new orders created</div>
        </div>
      </div>
    </div>
  );
}

/* ---------- stage 07: results (optional webhook) ---------- */
function Results() {
  return (
    <div class="bt-art bt-results">
      <div class="bt-res-flow">
        <div class="bt-res-node ev" style={{ '--i': 0 }}>
          <div class="bt-res-k">Truv sends</div>
          <div class="bt-res-v">order-finalized</div>
        </div>
        <div class="bt-res-arrow" style={{ '--i': 1 }} aria-hidden="true" />
        <div class="bt-res-node" style={{ '--i': 2 }}>
          <div class="bt-res-k">You verify</div>
          <div class="bt-res-v">X-WEBHOOK-SIGN</div>
        </div>
        <div class="bt-res-arrow" style={{ '--i': 3 }} aria-hidden="true" />
        <div class="bt-res-node" style={{ '--i': 4 }}>
          <div class="bt-res-k">You fetch</div>
          <div class="bt-res-v">GET /v1/orders/{'{id}'}/</div>
        </div>
      </div>
      <div class="bt-res-out">
        <div class="bt-res-file json" style={{ '--i': 5 }}>
          <div class="t">order.json</div>
          <div class="d">employer · status · income</div>
        </div>
        <div class="bt-res-file pdf" style={{ '--i': 6 }}>
          <div class="t">report.pdf</div>
          <div class="d">verification report</div>
        </div>
      </div>
      <div class="bt-res-alt">Skip all of this and review in the Truv dashboard - nothing lands in your environment.</div>
    </div>
  );
}

/* ---------- stage 09: the demo / download area ---------- */

// Preact renders a bare `download` attribute as download="true", which saves
// every file as true.zip / true.pdf. Always pass the real filename.
const fileName = href => href.split('/').pop();
const ASSETS = [
  {
    id: 'setup', kind: 'pdf', href: '/batching/Truv_Batch_Setup_Guide.pdf',
    name: 'Batch Intake - Setup Guide',
    desc: 'Setup, the CSV columns, the optional emails, and what to do when something breaks. Hand this to whoever runs the setup.',
    meta: 'PDF · 5 pages',
    preview: { type: 'page', src: '/batching/preview-Truv_Batch_Setup_Guide.png' },
    inside: ['Before you start - keys and prerequisites', 'Start on Windows, Mac or Linux', 'Setup in three commands',
             'Going live', 'Daily use and the CSV columns', 'The emails',
             'Getting results back', 'If something goes wrong'],
  },
  {
    id: 'webhooks', kind: 'pdf', href: '/batching/Truv_Webhooks_and_Results.pdf',
    name: 'Webhooks & Results Retrieval',
    desc: 'Only if they want results in their own systems. Which event to use, how to verify the signature, and who can build it.',
    meta: 'PDF · 5 pages',
    preview: { type: 'page', src: '/batching/preview-Truv_Webhooks_and_Results.png' },
    inside: ['Do you actually need this?', 'Who can set it up - four tiers',
             'Register your endpoint', 'Choose your events',
             'Verify the signature', 'Fetch the results', 'Go-live checklist'],
  },
  {
    id: 'kit', kind: 'zip', href: '/batching/Truv_Intake_Kit.zip',
    name: 'Truv Intake Kit',
    desc: 'Everything on this page in one download - the runnable tool, both guides, and the blank CSV.',
    meta: 'ZIP · 12 files',
    preview: {
      type: 'tree',
      // Excerpts are copied verbatim from the shipped files, so what a reviewer
      // reads here is what they get in the download.
      files: [
        {
          f: 'truv_intake.py', d: 'the tool - run this',
          about: 'Builds the order body from one CSV row. The reference is the case number plus the name, so each household member gets their own order. Field names verified against openapi.yaml.',
          code: [
            'def build_payload(row, truv, stamp=None):',
            '    payload = {',
            '        "products": truv["products"],',
            '        "first_name": (row.get("first_name") or "").strip(),',
            '        "last_name": (row.get("last_name") or "").strip(),',
            '    }',
            '    order_number = order_number_for(row, stamp)',
            '    if order_number:',
            '        payload["order_number"] = order_number',
            '    if (row.get("email") or "").strip():',
            '        payload["email"] = row["email"].strip()',
            '    phone = normalize_phone(row.get("phone", ""))',
            '    if phone:',
            '        payload["phone"] = phone',
            '',
            '    staff = (row.get("staff_email") or "").strip()',
            '    if staff:',
            '        manager = {"email": staff}',
            '        if (row.get("staff_name") or "").strip():',
            '            manager["name"] = row["staff_name"].strip()',
            '        # `manager` is a nested object. There is no flat order_manager_email field.',
            '        payload["manager"] = manager',
          ],
        },
        {
          f: 'direct_example.py', d: 'create at submit time',
          about: 'Create the order at submit time instead of exporting a file. Uses the same order reference as the batch tool; send each applicant through one path only.',
          code: [
            '    payload = {',
            '        "products": PRODUCTS,',
            '        "first_name": first_name.strip(),',
            '        "last_name": last_name.strip(),',
            '    }',
            '',
            '    if case_number:',
            '        # Your own identifier: the case number plus the applicant\'s name, the same',
            '        # reference truv_intake.py uses. A case often covers a household, so the',
            '        # name keeps each person\'s order separate. This path does not read the',
            '        # batch tool\'s ledger, so send each applicant through one path only.',
            '        ref = "%s %s %s" % (str(case_number).strip(), first_name.strip(), last_name.strip())',
            '        payload["order_number"] = "-".join(ref.split())',
            '',
            '    if email:',
            '        payload["email"] = email.strip()',
            '',
            '    if phone:',
            '        # Truv wants 10 digits, no country code. "(415) 555-4193" -> "4155554193"',
            '        digits = re.sub(r"\\D", "", phone)',
            '        if len(digits) == 11 and digits.startswith("1"):',
            '            digits = digits[1:]',
            '        if len(digits) == 10:',
            '            payload["phone"] = digits',
          ],
        },
        {
          f: 'webhook_receiver_example.py', d: 'runnable receiver',
          about: 'The one security step you cannot skip: HMAC over the raw body, compared in constant time.',
          code: [
            'def verify_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:',
            '    if not signature_header:',
            '        return False',
            '    expected = "v1=" + hmac.new(',
            '        key=secret.encode("utf-8"),',
            '        msg=raw_body,',
            '        digestmod=hashlib.sha256,',
            '    ).hexdigest()',
            '    # compare_digest avoids leaking timing information.',
            '    return hmac.compare_digest(expected, signature_header)',
          ],
        },
        { f: 'README.md', d: 'setup runbook' },
        { f: 'config.ini.example', d: 'your keys go here' },
        { f: 'orders_template.csv', d: 'blank CSV' },
        { f: 'START-HERE-mac-linux.command', d: 'double-click launcher' },
        { f: 'START-HERE-windows.bat', d: 'double-click launcher' },
        { f: 'LICENSE', d: 'MIT' },
        { f: 'VERSION', d: 'kit version' },
        { f: 'Truv_Batch_Setup_Guide.pdf', d: 'guide' },
        { f: 'Truv_Webhooks_and_Results.pdf', d: 'guide' },
      ],
    },
  },
  {
    id: 'csv', kind: 'csv', href: '/batching/orders_template.csv',
    name: 'orders_template.csv',
    desc: 'The blank CSV with the correct column headers.',
    meta: 'CSV · ready to fill in',
    preview: {
      type: 'csv',
      header: ['first_name', 'last_name', 'case_number', 'email', '…'],
      rows: [
        ['Maria', 'Lopez', 'CASE-1001', 'maria.lopez@example.com', '…'],
        ['Carlos', 'Lopez', 'CASE-1001', 'carlos.lopez@example.com', '…'],
      ],
      note: 'Two rows share CASE-1001 on purpose - a household is several applicants, each getting their own order. Delete the examples before use.',
    },
  },
];

function KitIcon({ kind }) {
  if (kind === 'zip') {
    return (
      <Icons.fileZip size={18} />
    );
  }
  if (kind === 'csv') {
    return (
      <Icons.fileCsv size={18} />
    );
  }
  return (
    <Icons.fileText size={18} />
  );
}

function DemoArea({ selected, onSelect }) {
  // The hint is discoverability, not decoration: it appears on arrival and
  // retires for good the first time someone opens a preview.
  const [touched, setTouched] = useState(false);
  const pick = (id) => { setTouched(true); onSelect(id); };
  return (
    <div class="bt-art bt-kit">
      {!touched && !selected && (
        <div class="bt-kit-hint" aria-hidden="true">
          <span class="bt-kit-hint-dot" />
          Click any file to preview it
        </div>
      )}
      <div class="bt-kit-grid">
        {ASSETS.map((a, k) => (
          <div
            class={`bt-kit-card ${a.kind}${selected === a.id ? ' on' : ''}`}
            style={{ '--i': k }}
          >
            <button
              type="button"
              class="bt-kit-main"
              onClick={() => pick(selected === a.id ? null : a.id)}
              aria-pressed={selected === a.id}
            >
              <span class="bt-kit-ic"><KitIcon kind={a.kind} /></span>
              <span class="bt-kit-body">
                <span class="bt-kit-name">{a.name}</span>
                <span class="bt-kit-desc">{a.desc}</span>
                <span class="bt-kit-meta">
                  {a.meta}
                  <em>{selected === a.id ? 'previewing →' : 'click to preview'}</em>
                </span>
              </span>
            </button>
            <a class="bt-kit-dl" href={a.href} download={fileName(a.href)} title={`Download ${a.name}`}>
              <Icons.download size={15} />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Right-rail preview of whatever card is selected on the final stage. */
function FilePreview({ asset, onClose }) {
  const p = asset.preview;
  const [openFile, setOpenFile] = useState(null);
  const openCode = p.type === 'tree' && openFile
    ? p.files.find(x => x.f === openFile)
    : null;
  return (
    <div class="bt-prev">
      <div class="bt-prev-top">
        <div>
          <div class="bt-prev-eyebrow">Preview</div>
          <div class="bt-prev-name">{asset.name}</div>
        </div>
        <button type="button" class="bt-prev-x" onClick={onClose} aria-label="Close preview">×</button>
      </div>

      {p.type === 'page' && (
        <div class="bt-prev-page">
          <img src={p.src} alt={`First page of ${asset.name}`}
               width="695" height="900" decoding="async" />
        </div>
      )}

      {p.type === 'tree' && (
        <>
          <div class="bt-prev-tree">
            {p.files.map(item => (
              item.code ? (
                <button
                  type="button"
                  class={`bt-prev-file has-code${openFile === item.f ? ' on' : ''}`}
                  onClick={() => setOpenFile(openFile === item.f ? null : item.f)}
                >
                  <span class="f">{item.f}</span>
                  <span class="d">{openFile === item.f ? 'hide code' : 'view code'}</span>
                  <span class="chev" aria-hidden="true">
                    <Icons.code size={12} />
                  </span>
                </button>
              ) : (
                <div class="bt-prev-file">
                  <span class="f">{item.f}</span>
                  <span class="d">{item.d}</span>
                </div>
              )
            ))}
          </div>
          {openCode && (
            <div class="bt-prev-codewrap" key={openFile}>
              <div class="bt-prev-codehead">
                <span class="fn">{openCode.f}</span>
                <span class="ab">{openCode.about}</span>
              </div>
              <pre class="bt-prev-code"><code>{openCode.code.join('\n')}</code></pre>
            </div>
          )}
          {!openCode && (
            <div class="bt-prev-cue">
              <span class="bt-prev-cue-arrow" aria-hidden="true">
                <Icons.arrowUp size={15} />
              </span>
              <span>Open <strong>view code</strong> on any of the three Python files
              to read a real excerpt from it.</span>
            </div>
          )}
        </>
      )}

      {p.type === 'csv' && (
        <>
          <div class="bt-prev-csv">
            <div class="r h">{p.header.map(c => <span>{c}</span>)}</div>
            {p.rows.map(row => <div class="r">{row.map(c => <span>{c}</span>)}</div>)}
          </div>
          <p class="bt-prev-note">{p.note}</p>
        </>
      )}

      {asset.inside && (
        <>
          <div class="bt-prev-sub">What's inside</div>
          <ul class="bt-prev-list">{asset.inside.map(x => <li>{x}</li>)}</ul>
        </>
      )}

    </div>
  );
}

/* ---------- stages ---------- */
const STAGES = [
  {
    n: '01', name: 'Where this fits', kind: 'problem',
    title: 'When embedding is not an option yet',
    lead: 'Embedding verification in your own application is the better experience and the one to reach for first. Batch is the fallback - for agencies with thousands of verifications a week, no development capacity, or applicant data sitting in a system they do not control.',
    bullets: [
      'Staff re-key data that already exists in the case record',
      'Verification starts days after the application is filed',
      'No single record of which applicants have already been sent a request',
    ],
  },
  {
    n: '02', name: 'The export', kind: 'drop',
    title: 'Your system exports the file',
    lead: 'The recommended pattern: your case system writes the export on a schedule into a folder on your own server, and the tool picks it up - hourly, nightly, whatever you set. Staff saving a file by hand is the fallback for when that export cannot be automated. After each run the file moves to processed/, or to failed/ if a person needs to look at it.',
    bullets: [
      'The folder is on your infrastructure - nothing inbound. The tool calls Truv over HTTPS, and your mail server only if you turn on email alerts',
      'An order needs only a first and last name. Add an email and Truv invites the applicant directly',
      'Every other column is yours to define - phone, case number, staff routing, notes',
      'One file can carry up to 3,000 applicants - the hourly order limit for an account',
    ],
  },
  {
    n: '03', name: 'Checked, then sent', kind: 'checksend',
    title: 'Checked first, and one bad row never blocks the rest',
    lead: 'The tool validates every row on your own server, then sends the whole file to Truv in one request. Valid rows become orders. Anything wrong is set aside and written back out as a small file with the reason on each line - fix those and drop them in again. The same applicant is not ordered twice by accident.',
    toggle: true,
    api: true,
    fields: true,
  },
  {
    n: '04', name: 'No accidental repeats', kind: 'ledger',
    title: 'The same applicant is not ordered twice by accident',
    lead: 'Every applicant sent is recorded in a local ledger, keyed on the person and the case - not the case alone. When each row has a case number, re-sending the same export, renaming it or running it twice by mistake creates nothing new.',
    bullets: [
      'A household sharing one case number is several applicants, and each gets their own order',
      'Redeterminations, retries and expired orders are legitimate repeats - mark the row force_new and a new order is created',
      'Survives a crash mid-batch; failed rows are not recorded, so a retry re-attempts them',
    ],
  },
  {
    n: '05', name: 'Results', kind: 'results',
    title: 'Results delivered into your own systems',
    lead: 'The recommended path. Subscribe to the order-finalized webhook event, and the moment an order reaches its terminal state Truv calls your endpoint; you verify the signature and pull the JSON and the PDF report. Staff review results in the tools they already use.',
    bullets: [
      'A small build for a developer - verify a signature, answer 2xx, fetch the order and its reports',
      'Dashboard-only review is the fallback when no endpoint can be stood up',
      'Optionally, every run emails an operations summary - if it stops arriving, something is down',
    ],
  },
  {
    n: '06', name: 'Set it up', kind: 'kit',
    title: 'Everything needed to run this',
    lead: 'The guides and the runnable tool for the batch path shown here. A sandbox test takes three commands - setup, a health check, one real test order - and the launcher runs them for you. Going live also needs a scheduled export and someone who owns the keys and folders.',
    kit: true,
  },
];

const ROUTE = 'public-sector/batching';
const stageFromScreen = (screen) => {
  const n = parseInt(screen, 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(STAGES.length - 1, n - 1)) : 0;
};

export function BatchingWalkthrough({ screen }) {
  // The stage lives in the URL (#public-sector/batching/3), so reload keeps your
  // place, browser Back steps back a stage, and a stage can be linked directly.
  const i = stageFromScreen(screen);
  const [vmode, setVmode] = useState('pass');
  const [preview, setPreview] = useState(null);   // selected file on the final stage
  const s = STAGES[i];
  // Read the stage from the URL at call time, not from this render: two quick
  // presses land before the hashchange re-render, and the second would
  // otherwise recompute from a stale stage and go nowhere.
  const current = () => stageFromScreen(window.location.hash.split('/')[2]);
  const go = (k) => {
    const n = Math.max(0, Math.min(STAGES.length - 1, k));
    setPreview(null);
    if (n !== current()) window.location.hash = n === 0 ? ROUTE : `${ROUTE}/${n + 1}`;
  };
  const step = (d) => go(current() + d);

  // A new stage starts at the top. On narrow screens the body scrolls, and
  // without this you would land halfway down the next stage.
  useEffect(() => {
    document.querySelector('.bt .wt-body')?.scrollTo(0, 0);
  }, [i]);

  useEffect(() => {
    const h = (e) => {
      if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'Escape') setPreview(null);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [i]);

  // On phones the preview opens below the file list, out of sight - bring it up.
  const selectFile = (id) => {
    setPreview(id);
    if (id && window.matchMedia('(max-width: 900px)').matches) {
      requestAnimationFrame(() => document.querySelector('.bt .wt-context')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };

  const previewAsset = s.kind === 'kit' && preview
    ? ASSETS.find(a => a.id === preview)
    : null;
  const progress = ((i + 1) / STAGES.length) * 100;

  return (
    <div class="wt bt">
      <Header trail={[{ label: 'Public Sector', href: '#public-sector' },
                      { label: 'Batching', href: '#public-sector/batching' }]} />
      <header class="wt-top">
        <div class="wt-brand">
          <span class="partner">Batch Order Intake</span>
        </div>
        <div class="wt-step">
          <div class="k">Stage {s.n} / {STAGES.length.toString().padStart(2, '0')}</div>
          <div class="nm">{s.name}</div>
        </div>
        {i < STAGES.length - 1 && (
          <button class="wt-cta" onClick={() => go(STAGES.length - 1)}>Skip to the setup files →</button>
        )}
        <div class="wt-progress" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>
      </header>

      <div class="wt-body">
        <div class="wt-stage">
          <div class="wt-ambient" aria-hidden="true">
            <div class="wt-ambient-orb o1" />
            <div class="wt-ambient-orb o2" />
            <div class="wt-ambient-orb o3" />
            <div class="wt-ambient-grid" />
            <div class="wt-ambient-ring r1" />
            <div class="wt-ambient-ring r2" />
            <div class="wt-ambient-vignette" />
          </div>
          {/* Remounting replays the one-shot CSS animations. The key includes the
              validation mode so flipping that toggle re-runs the scan immediately
              instead of showing an already-finished state. */}
          <div
            class={`wt-stage-inner kind-${s.kind}`}
            key={`${i}${s.kind === 'checksend' ? `-${vmode}` : ''}`}
          >
            {s.kind === 'problem' && <TheProblem />}
            {s.kind === 'drop' && <TheDrop />}
            {s.kind === 'checksend' && <CheckAndSend mode={vmode} />}
            {s.kind === 'ledger' && <Ledger />}
            {s.kind === 'results' && <Results />}
            {s.kind === 'kit' && <DemoArea selected={preview} onSelect={selectFile} />}
          </div>
        </div>

        <div class={`wt-context${previewAsset ? ' has-preview' : ''}`} key={`c-${i}`}>
          {previewAsset ? (
            <FilePreview asset={previewAsset} onClose={() => setPreview(null)} />
          ) : (
          <>
          <div class="wt-eyebrow">{s.n} · {s.name}</div>
          <h2 class="wt-title">{s.title}</h2>
          <p class="wt-lead">{s.lead}</p>
          {s.bullets && <ul class="wt-ul">{s.bullets.map(b => <li>{b}</li>)}</ul>}

          {s.toggle && (
            <>
              <div class="bt-switch-hint">
                Change the file and watch it re-check:
              </div>
              <div class="bt-switch">
                <button
                  type="button"
                  class={`bt-switch-b ${vmode === 'pass' ? 'on' : ''}`}
                  onClick={() => setVmode('pass')}
                >All rows valid</button>
                <button
                  type="button"
                  class={`bt-switch-b ${vmode === 'reject' ? 'on' : ''}`}
                  onClick={() => setVmode('reject')}
                >One bad row</button>
              </div>
            </>
          )}

          {s.api && (
            <div class="wt-api">
              <div><span class="mth">POST</span> /v1/orders/batch/</div>
              <div>{'{'} <span class="k">"orders"</span>: [</div>
              <div>&nbsp;&nbsp;{'{'} <span class="k">"products"</span>: [<span class="s">"income"</span>],</div>
              <div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"first_name"</span>: <span class="s">"Aisha"</span>,</div>
              <div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"last_name"</span>: <span class="s">{vmode === 'reject' ? '""' : '"Bello"'}</span>,</div>
              <div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="k">"order_number"</span>: <span class="s">"CASE-4473"</span> {'}'},</div>
              <div>&nbsp;&nbsp;<span class="c">… one object per row</span></div>
              <div>] {'}'}</div>
              <div><span class="c">→ 202 · job id, status "pending"</span></div>
              <div class="gap"><span class="mth">GET</span> /v1/orders/batch/{'{id}'}/</div>
              <div><span class="c">→ per row:</span> <span class="k">created</span>{vmode === 'reject'
                ? <> · <span class="k">failed</span> <span class="c">(last_name: required)</span></>
                : null}</div>
            </div>
          )}
          {s.fields && (
            <p class="bt-note">
              One request carries the whole file - up to 3,000 orders, which is also
              the hourly limit. Results come back per row: poll the job, or subscribe
              to the <code>order-batch-completed</code> webhook. The file can carry any field the Order API accepts. <code>order_number</code> is where a case number goes;{' '}
              <code>notes</code> takes free text; <code>custom_field</code> carries your
              own value once enabled in the dashboard. Only{' '}
              <code>products</code>, <code>first_name</code> and <code>last_name</code>{' '}
              are strictly required.
            </p>
          )}

          {s.kit && (
            <>
              <div class="bt-cmds">
                <div><span class="p">$</span> python3 truv_intake.py setup</div>
                <div><span class="p">$</span> python3 truv_intake.py doctor</div>
                <div><span class="p">$</span> python3 truv_intake.py selftest</div>
              </div>
              <p class="bt-note">
                Sandbox and production use the <strong>same API address</strong> - only the key pair
                differs. The tool refuses to touch production until a sandbox test has passed.
              </p>
            </>
          )}
          </>
          )}
        </div>
      </div>

      <footer class="wt-nav">
        <div class="wt-dots">
          {STAGES.map((_, k) => (
            <button
              class={`wt-dot ${k === i ? 'active' : k < i ? 'done' : ''}`}
              onClick={() => go(k)}
              aria-label={`Stage ${k + 1}: ${STAGES[k].name}`}
              aria-current={k === i ? 'step' : undefined}
            />
          ))}
        </div>
        <div class="wt-navbtns">
          <button class="wt-btn ghost" disabled={i === 0} onClick={() => step(-1)}>← Back</button>
          {i === STAGES.length - 1
            ? <a class="wt-btn primary" href="/batching/Truv_Intake_Kit.zip" download="Truv_Intake_Kit.zip">Download the kit ↓</a>
            : <button class="wt-btn primary" onClick={() => step(1)}>Next →</button>}
        </div>
      </footer>
    </div>
  );
}
