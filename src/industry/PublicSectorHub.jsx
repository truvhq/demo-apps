/**
 * FILE SUMMARY: Public Sector landing page, grouped by use case.
 * Replaces the single vertical list of demo cards with use-case rows of tiles,
 * in the same Checkr-styled design language as the Batching walkthrough
 * (src/demos/batching.css). Styles live in ps-hub.css, scoped under `.psh`.
 * Route: #public-sector
 */
import { Header } from '../components/Header.jsx';
import { Icons } from '../components/Icons.jsx';
import { DEMO_ICONS } from '../IndustryPage.jsx';
import './ps-hub.css';

// Each demo appears once, in the group that matches who starts the
// verification. Ids must match the demo registry in App.jsx.
const GROUPS = [
  {
    id: 'self-service',
    label: 'Applicants verify on their own',
    desc: 'The applicant connects their income while applying or recertifying, inside your portal.',
    demos: ['customer-portal'],
  },
  {
    id: 'caseworker',
    label: 'Caseworkers request verification',
    desc: 'Staff create the order from the case record and the applicant gets a link - one at a time, or a whole file at once.',
    demos: ['verifier-portal', 'batching'],
  },
  {
    id: 'documents',
    label: 'Verify documents you already have',
    desc: 'Pay stubs, W-2s and tax returns that applicants have already submitted.',
    demos: ['documents'],
  },
];

function Tile({ demo, industryId, index }) {
  const Icon = DEMO_ICONS[demo.id];
  return (
    <a class="psh-tile" href={`#${industryId}/${demo.id}`} style={{ '--i': index }}>
      <div class="psh-tile-top">
        <span class="psh-ic" aria-hidden="true">{Icon && <Icon size={20} />}</span>
        <span class={`psh-mode ${demo.noSession ? 'walk' : 'live'}`}>
          {demo.noSession ? 'Walkthrough · no keys needed' : 'Live demo · sandbox API'}
        </span>
      </div>
      <h3 class="psh-tile-name">{demo.name}</h3>
      <p class="psh-tile-desc">{demo.desc}</p>
      <div class="psh-tags">
        {demo.tags.map(t => <span class="psh-tag" key={t}>{t}</span>)}
      </div>
      <span class="psh-open">Open demo <span class="arr" aria-hidden="true">→</span></span>
    </a>
  );
}

export function PublicSectorHub({ industry }) {
  const byId = Object.fromEntries(industry.demos.map(d => [d.id, d]));
  // Anything registered but not placed in a group still shows, so a new demo
  // is never hidden by this page.
  const placed = new Set(GROUPS.flatMap(g => g.demos));
  const groups = [...GROUPS];
  const rest = industry.demos.filter(d => !placed.has(d.id)).map(d => d.id);
  if (rest.length) groups.push({ id: 'more', label: 'More', desc: '', demos: rest });
  let n = 0;

  return (
    <div class="psh">
      <Header trail={[{ label: industry.name, href: `#${industry.id}` }]} sticky />
      <section class="psh-hero">
        <div class="psh-wrap">
          <a href="#" class="psh-back"><Icons.arrowLeft size={14} /> All industries</a>
          <div class="psh-eyebrow">Public Sector</div>
          <h1 class="psh-title">Verify income and employment for benefits</h1>
          <p class="psh-lead">{industry.desc} Pick the way your agency works today.</p>
        </div>
      </section>

      <main class="psh-wrap psh-groups">
        {groups.map(g => (
          <section class="psh-group" key={g.id} aria-labelledby={`g-${g.id}`}>
            <div class="psh-group-head">
              <h2 class="psh-group-label" id={`g-${g.id}`}>{g.label}</h2>
              {g.desc && <p class="psh-group-desc">{g.desc}</p>}
            </div>
            <div class="psh-tiles">
              {g.demos.filter(id => byId[id]).map(id => (
                <Tile key={id} demo={byId[id]} industryId={industry.id} index={n++} />
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
