/**
 * FILE SUMMARY: The logins every Truv account has, searchable, with a Try button on the ones that can
 * be run here. Data comes from standard-logins.js, which is copied from the Truv docs.
 */
import { useMemo, useState } from 'preact/hooks';
import { GROUPS, LOGINS, IDENTITIES, FILES, DOCS } from './standard-logins.js';
import { Chip, Copyable, StatusChip, plural } from './ui.jsx';
import { statusName, suiteItemFromLogin } from './model.js';
import { OUTCOMES, DOC_LINKS } from './outcomes.js';

const FILTERS = [
  ['all', 'All'], ['universal', 'Errors and MFA'], ['income', 'Income'], ['assets', 'Bank'],
  ['education', 'Education'], ['documents', 'Documents'],
];
// Deposit switch, paycheck-linked loans and mortgage are not used by the public sector flows this tool sits under.
const LEFT_OUT = new Set(['dds', 'pll', 'mortgage']);
const PRODUCT_NAMES = { income: 'Income', employment: 'Employment', assets: 'Assets' };

const has = (text, q) => String(text || '').toLowerCase().includes(q);
// People search with their own words; the catalog uses Truv's.
const SYNONYMS = { terminated: ['ended', 'is_active: false'], fired: ['ended'], inactive: ['is_active: false', 'ended'], lock: ['locked'], wrong: ['login_error', 'incorrect'], fail: ['error'], failure: ['error'], code: ['mfa'], verify: ['mfa'], slow: ['wait', 'delay'] };
// Every word typed has to be found, either as typed or as a word Truv uses for it.
const found = (hay, q) => q.split(/\s+/).filter(Boolean).every(w => hay.includes(w) || (Object.hasOwn(SYNONYMS, w) ? SYNONYMS[w] : []).some(x => hay.includes(x)));
const demoLinks = [['customer-portal', 'Customer Portal'], ['verifier-portal', 'Case Worker Portal'], ['renewals-refresh', 'Renewals & Data Refresh']];

function countFor(id) {
  if (id === 'education') return IDENTITIES.length;
  if (id === 'documents') return FILES.length;
  return LOGINS.filter(l => l.group === id).length;
}

function LoginRow({ row, onTry }) {
  const products = row.products.filter(p => PRODUCT_NAMES[p]);
  return (
    <li class="sbx-row sbx-row-login">
      <div class="sbx-cell" data-label="Login"><Copyable value={row.login} what="login" /></div>
      <div class="sbx-cell" data-label="Password"><Copyable value={row.password} what="password" /></div>
      <div class="sbx-cell sbx-grow" data-label="What you get">
        <p class="sbx-what">{row.returns}</p>
        <div class="sbx-meta">
          {row.status && row.status !== 'mfa' && <><span class="sbx-meta-label">Result</span> <StatusChip status={row.status} /></>}
          {row.group === 'universal' && products.map(p => <Chip key={p}>{PRODUCT_NAMES[p]}</Chip>)}
          {row.ssn && <span class="sbx-small">Applicant SSN ends {row.ssn.slice(-4)}</span>}
          {row.sample && <a class="sbx-link" href={row.sample} target="_blank" rel="noopener noreferrer">Sample report</a>}
        </div>
        {row.note && <p class="sbx-note">{row.note}</p>}
      </div>
      <div class="sbx-cell sbx-actions">
        <button type="button" class="sbx-btn ghost small" onClick={() => onTry(row)} aria-label={`Try ${row.login} with password ${row.password}`}>Try</button>
      </div>
    </li>
  );
}

function Group({ group, children, count }) {
  return (
    <section class="sbx-group" aria-labelledby={`sbx-g-${group.id}`}>
      <header class="sbx-group-head">
        <div>
          <h2 id={`sbx-g-${group.id}`}>{group.name} <span class="sbx-count">{count}</span></h2>
          <p>{group.blurb}</p>
        </div>
        <a class="sbx-link" href={`${DOCS}${group.docs}`} target="_blank" rel="noopener noreferrer">Docs</a>
      </header>
      {children}
    </section>
  );
}

function bySection(rows, key = 'section') {
  const out = [];
  for (const r of rows) {
    let s = out.find(x => x.name === r[key]);
    if (!s) { s = { name: r[key], rows: [] }; out.push(s); }
    s.rows.push(r);
  }
  return out;
}

export function StandardLogins({ onTry, onGo, onSuite, initialQuery = '', onQuery }) {
  const [query, setQueryState] = useState(initialQuery);
  const setQuery = (v) => { setQueryState(v); onQuery?.(v); };
  const [filter, setFilter] = useState('all');
  const q = query.trim().toLowerCase();

  const match = useMemo(() => {
    const hay = (parts) => parts.filter(Boolean).join('\n').toLowerCase();
    return {
      logins: LOGINS.filter(l => !q || found(hay([l.login, l.password, l.returns, l.id, l.section, l.note, l.ssn, statusName(l.status), ...(l.products || []).map(p => PRODUCT_NAMES[p])]), q)),
      identities: IDENTITIES.filter(i => !q || found(hay([i.ssnLast4, i.dob, i.returns, i.section]), q)),
      files: FILES.filter(f => !q || found(hay([f.filename, f.label, f.returns, f.section]), q)),
      reports: [],
    };
  }, [q]);

  const shown = (id) => filter === 'all' || filter === id;
  const total = match.logins.length + match.identities.length + match.files.length + match.reports.length;
  const visibleTotal = FILTERS.filter(([id]) => id !== 'all' && shown(id)).reduce((n, [id]) => n + (
    id === 'education' ? match.identities.length : id === 'documents' ? match.files.length
      : id === 'mortgage' ? match.logins.filter(l => l.group === id).length + match.reports.length
        : match.logins.filter(l => l.group === id).length), 0);

  return (
    <div class="sbx-standard">
      <div class="sbx-intro">
        <p>Every account has these. Click a value to copy it, or press Try to run it. Want your own data instead? <button type="button" class="sbx-linkbtn" onClick={() => onGo?.('build')}>Build a scenario</button>.</p>
        <p class="sbx-small">
          Use these logins in the demos: {demoLinks.map(([id, name], i) => <span key={id}>{i > 0 && ', '}<a class="sbx-link" href={`#public-sector/${id}`}>{name}</a></span>)}. Search for the Truv Payroll Provider in Bridge.
        </p>
        <details class="sbx-glossary">
          <summary>What each result means</summary>
          <div class="sbx-tablewrap" tabIndex={0} role="region" aria-label="What each result means">
            <table class="sbx-table">
              <thead><tr><th>Result</th><th>What it means</th><th>What to do</th><th>Who can fix it</th></tr></thead>
              <tbody>{OUTCOMES.map(o => <tr key={o.status}><td><StatusChip status={o.status} /><br /><code class="sbx-small">{o.status}</code></td><td>{o.means}</td><td>{o.do}</td><td>{o.fix}</td></tr>)}</tbody>
            </table>
          </div>
          <p class="sbx-small">From the Truv docs: {Object.values(DOC_LINKS).map((l, i) => <span key={l.href}>{i > 0 && ', '}<a class="sbx-link" href={l.href} target="_blank" rel="noopener noreferrer">{l.label}</a></span>)}.</p>
        </details>
        <p class="sbx-small">The logins below are generic test credentials that every client can use.</p>
      </div>

      <div class="sbx-toolbar">
        <div class="sbx-search">
          <label for="sbx-search" class="sbx-sr">Search standard logins</label>
          <input id="sbx-search" type="search" placeholder="Search by login, status or what it returns" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
        </div>
        <div class="sbx-filters" role="group" aria-label="Show">
          {FILTERS.map(([id, label]) => (
            <button type="button" key={id} class="sbx-pill" aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {label}{id !== 'all' && <><span class="sbx-sr">, </span><span class="sbx-pill-n">{countFor(id)}</span></>}
            </button>
          ))}
        </div>
      </div>

      {onSuite && (
        <p class="sbx-small sbx-matrix">
          Test your error handling in one go: <button type="button" class="sbx-linkbtn" onClick={() => onSuite({ title: 'Run the failure matrix', intro: 'Signs in with every error login and the no-records login, and checks that each ends the way the docs say.', items: LOGINS.filter(l => l.group === 'universal' && (l.login === 'error.user' || l.password === 'no_data')).map(suiteItemFromLogin) })}>Run the failure matrix</button>
        </p>
      )}

      <p class="sbx-sr" role="status">{plural(visibleTotal, 'result')}</p>

      {GROUPS.filter(g => shown(g.id) && !LEFT_OUT.has(g.id)).map(group => {
        if (group.id === 'education') {
          if (!match.identities.length) return null;
          return (
            <Group key={group.id} group={group} count={match.identities.length}>
              <p class="sbx-small sbx-pad">Create an order for an applicant whose SSN ends in the four digits below. Sandbox ignores the first five digits, so 666-09-9916 selects 9916. If the SSN matches nothing, the date of birth is used.</p>
              {bySection(match.identities).map(sec => (
                <div key={sec.name}>
                  <h3 class="sbx-sub">{sec.name}</h3>
                  <ul class="sbx-rows">
                    {sec.rows.map(r => (
                      <li class="sbx-row sbx-row-id" key={r.ssnLast4}>
                        <div class="sbx-cell" data-label="SSN ends"><Copyable value={r.ssnLast4} what="SSN last four" /></div>
                        <div class="sbx-cell" data-label="Date of birth">{r.dob === '-' ? <span class="sbx-small">none</span> : <code>{r.dob}</code>}</div>
                        <div class="sbx-cell sbx-grow" data-label="What you get"><p class="sbx-what">{r.returns}</p></div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Group>
          );
        }
        if (group.id === 'documents') {
          if (!match.files.length) return null;
          return (
            <Group key={group.id} group={group} count={match.files.length}>
              <p class="sbx-small sbx-pad">Upload a file with exactly this name. Add the prefix <code>suspicious.</code> to any of them to flag it, for example <code>suspicious.most.recent.paystub.pdf</code>.</p>
              {bySection(match.files).map(sec => (
                <div key={sec.name}>
                  <h3 class="sbx-sub">{sec.name}</h3>
                  <ul class="sbx-rows">
                    {sec.rows.map(f => (
                      <li class="sbx-row sbx-row-file" key={f.filename}>
                        <div class="sbx-cell" data-label="File name"><Copyable value={f.filename} what="file name" /></div>
                        <div class="sbx-cell sbx-grow" data-label="What it is"><p class="sbx-what">{f.label}{f.returns ? `. ${f.returns}` : ''}</p></div>
                        <div class="sbx-cell sbx-actions"><a class="sbx-link" href={f.url} target="_blank" rel="noopener noreferrer" aria-label={`Download ${f.filename}`}>Download</a></div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Group>
          );
        }
        const rows = match.logins.filter(l => l.group === group.id);
        const reports = group.id === 'mortgage' ? match.reports : [];
        if (!rows.length && !reports.length) return null;
        return (
          <Group key={group.id} group={group} count={rows.length + reports.length}>
            {bySection(rows).map(sec => (
              <div key={sec.name}>
                {bySection(rows).length > 1 && <h3 class="sbx-sub">{sec.name}</h3>}
                <ul class="sbx-rows">{sec.rows.map(r => <LoginRow key={r.id} row={r} onTry={onTry} />)}</ul>
              </div>
            ))}
            {reports.length > 0 && (
              <div>
                <h3 class="sbx-sub">Ready-made reports</h3>
                <p class="sbx-small sbx-pad">Fetch these by ID. Nothing to sign in to.</p>
                <ul class="sbx-rows">
                  {reports.map(r => (
                    <li class="sbx-row sbx-row-report" key={r.id}>
                      <div class="sbx-cell" data-label="Report ID"><Copyable value={r.id} what={`${r.kind} report ID`} /></div>
                      <div class="sbx-cell sbx-grow" data-label="Borrower"><p class="sbx-what">{r.agency}, {r.kind.toLowerCase()}. {r.borrower}, SSN {r.ssn}.</p></div>
                      <div class="sbx-cell sbx-actions">{r.sample && <a class="sbx-link" href={r.sample} target="_blank" rel="noopener noreferrer">Sample report</a>}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Group>
        );
      })}

      {visibleTotal === 0 && (
        <div class="sbx-empty">
          <p><strong>{query ? `Nothing matches "${query}"${filter !== 'all' ? ' here' : ''}.` : 'Nothing in this group.'}</strong></p>
          <button type="button" class="sbx-btn ghost" onClick={() => { setQuery(''); setFilter('all'); }}>Clear the search and filter</button>
        </div>
      )}
    </div>
  );
}
