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

// Guides are placeholders until the content is written. `ready: false` keeps
// them visible but not clickable, so nobody lands on an empty page.
const GUIDES = [
  { id: 'best-practices', name: 'Best practices', icon: 'shieldCheck',
    desc: 'How agencies set up verification for the best applicant experience and fewest manual reviews.', ready: false },
  { id: 'faq', name: 'FAQ', icon: 'search',
    desc: 'Answers to the questions caseworkers, IT teams and program staff ask most.', ready: false },
  { id: 'scenarios', name: 'Scenarios', icon: 'users',
    desc: 'Worked examples for real situations - households, recertification, applicants with no payroll account.', ready: false },
];

function SectionTile({ href, icon, name, desc, count, index }) {
  const Icon = Icons[icon];
  return (
    <a class="psh-tile psh-section" href={href} style={{ '--i': index }}>
      <div class="psh-tile-top">
        <span class="psh-ic big" aria-hidden="true">{Icon && <Icon size={24} />}</span>
        <span class="psh-mode">{count}</span>
      </div>
      <h2 class="psh-section-name">{name}</h2>
      <p class="psh-tile-desc">{desc}</p>
      <span class="psh-open">Open <span class="arr" aria-hidden="true">→</span></span>
    </a>
  );
}

function GuideTile({ guide, index }) {
  const Icon = Icons[guide.icon];
  return (
    <div class="psh-tile is-soon" style={{ '--i': index }} aria-disabled="true">
      <div class="psh-tile-top">
        <span class="psh-ic" aria-hidden="true">{Icon && <Icon size={20} />}</span>
        <span class="psh-mode">Coming soon</span>
      </div>
      <h3 class="psh-tile-name">{guide.name}</h3>
      <p class="psh-tile-desc">{guide.desc}</p>
    </div>
  );
}

function Hero({ industry, back, title, lead }) {
  return (
    <section class="psh-hero">
      <div class="psh-wrap">
        <a href={back.href} class="psh-back"><Icons.arrowLeft size={14} /> {back.label}</a>
        <div class="psh-eyebrow">Public Sector</div>
        <h1 class="psh-title">{title}</h1>
        <p class="psh-lead">{lead}</p>
      </div>
    </section>
  );
}

export function PublicSectorHub({ industry, section }) {
  const base = `#${industry.id}`;
  const trail = [{ label: industry.name, href: base }];
  if (section === 'demos') trail.push({ label: 'Demos', href: `${base}/demos` });
  if (section === 'guides') trail.push({ label: 'Guides', href: `${base}/guides` });

  if (!section) {
    return (
      <div class="psh">
        <Header trail={trail} sticky />
        <Hero industry={industry} back={{ href: '#', label: 'All industries' }}
              title="Verify income and employment for benefits" lead={industry.desc} />
        <main class="psh-wrap psh-landing">
          <SectionTile href={`${base}/demos`} icon="sparkles" name="Demos" index={0}
                       count={`${industry.demos.length} demos`}
                       desc="See verification working in the flows agencies use - applicant self-service, caseworker requests, bulk intake and document processing." />
          <SectionTile href={`${base}/guides`} icon="fileText" name="Guides" index={1}
                       count={`${GUIDES.length} guides`}
                       desc="Best practices, answers to common questions, and worked scenarios for planning an implementation." />
        </main>
      </div>
    );
  }

  if (section === 'guides') {
    return (
      <div class="psh">
        <Header trail={trail} sticky />
        <Hero industry={industry} back={{ href: base, label: 'Public Sector' }}
              title="Guides" lead="Reference material for planning and running verification in a benefits program." />
        <main class="psh-wrap psh-groups">
          <section class="psh-group">
            <div class="psh-group-head">
              <h2 class="psh-group-label">Plan and run</h2>
              <p class="psh-group-desc">Placeholders for now - content is being written.</p>
            </div>
            <div class="psh-tiles">
              {GUIDES.map((g, i) => <GuideTile key={g.id} guide={g} index={i} />)}
            </div>
          </section>
        </main>
      </div>
    );
  }

  return <DemosSection industry={industry} trail={trail} />;
}

function DemosSection({ industry, trail }) {
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
      <Header trail={trail} sticky />
      <Hero industry={industry} back={{ href: `#${industry.id}`, label: 'Public Sector' }}
            title="Demos" lead="Pick the way your agency works today. Each demo runs on Truv's sandbox, except the walkthrough, which needs no keys." />

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
