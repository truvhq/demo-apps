/**
 * FILE SUMMARY: Public Sector landing page, grouped by use case.
 * One flat page: a Demos section with a tile per demo and a Guides section with
 * a tile per guide - no click-through levels. Same design language
 * as the Batching walkthrough
 * (src/demos/batching.css). Styles live in ps-hub.css, scoped under `.psh`.
 * Route: #public-sector
 */
import { useEffect } from 'preact/hooks';
import { Header } from '../components/Header.jsx';
import { Icons } from '../components/Icons.jsx';
import { DEMO_ICONS } from '../IndustryPage.jsx';
import './ps-hub.css';

// Use-case label shown on each demo tile. Ids must match the demo registry in
// App.jsx; a demo missing here still shows, just without a label.
const USE_CASE = {
  'customer-portal': 'Applicant self-service',
  'verifier-portal': 'Caseworker request',
  'batching': 'Caseworker request · bulk',
  'documents': 'Documents already collected',
};
// Display order: self-service first, then caseworker-led, then documents.
const ORDER = ['customer-portal', 'verifier-portal', 'batching', 'documents'];

// Guides are placeholders until the content is written. They stay visible but
// not clickable, so nobody lands on an empty page.
const GUIDES = [
  { id: 'best-practices', name: 'Best practices', icon: 'shieldCheck',
    desc: 'How agencies set up verification for the best applicant experience and fewest manual reviews.' },
  { id: 'faq', name: 'FAQ', icon: 'search',
    desc: 'Answers to the questions caseworkers, IT teams and program staff ask most.' },
  { id: 'scenarios', name: 'Scenarios', icon: 'users',
    desc: 'Worked examples for real situations - households, recertification, applicants with no payroll account.' },
];

function DemoTile({ demo, industryId, index }) {
  const Icon = DEMO_ICONS[demo.id];
  return (
    <a class="psh-tile" href={`#${industryId}/${demo.id}`} style={{ '--i': index }}>
      <div class="psh-tile-top">
        <span class="psh-ic" aria-hidden="true">{Icon && <Icon size={20} />}</span>
        <span class="psh-mode">{demo.noSession ? 'Walkthrough · no keys' : 'Live · sandbox API'}</span>
      </div>
      {USE_CASE[demo.id] && <div class="psh-usecase">{USE_CASE[demo.id]}</div>}
      <h3 class="psh-tile-name">{demo.name}</h3>
      <p class="psh-tile-desc">{demo.desc}</p>
      <div class="psh-tags">
        {demo.tags.map(t => <span class="psh-tag" key={t}>{t}</span>)}
      </div>
      <span class="psh-open">Open demo <span class="arr" aria-hidden="true">→</span></span>
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

export function PublicSectorHub({ industry, section }) {
  // Old #public-sector/demos and /guides links land on this page and scroll
  // to the matching section.
  useEffect(() => {
    if (!section) return;
    // Wait for layout, then scroll the window (the sticky header covers 72px).
    const t = setTimeout(() => {
      const el = document.getElementById(`psh-${section}`);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72 });
    }, 50);
    return () => clearTimeout(t);
  }, [section]);

  const demos = [...industry.demos].sort((a, b) => {
    const ia = ORDER.indexOf(a.id), ib = ORDER.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  return (
    <div class="psh">
      <Header trail={[{ label: industry.name, href: `#${industry.id}` }]} sticky />
      <section class="psh-hero">
        <div class="psh-wrap">
          <a href="#" class="psh-back"><Icons.arrowLeft size={14} /> All industries</a>
          <div class="psh-eyebrow">Public Sector</div>
          <h1 class="psh-title">Verify income and employment for benefits</h1>
          <p class="psh-lead">{industry.desc}</p>
        </div>
      </section>

      <main class="psh-wrap psh-sections">
        <section class="psh-section-block" id="psh-demos" aria-labelledby="psh-demos-h">
          <div class="psh-section-head">
            <h2 class="psh-section-title" id="psh-demos-h">Demos</h2>
            <span class="psh-count">{demos.length}</span>
          </div>
          <div class="psh-grid">
            {demos.map((d, i) => <DemoTile key={d.id} demo={d} industryId={industry.id} index={i} />)}
          </div>
        </section>

        <section class="psh-section-block" id="psh-guides" aria-labelledby="psh-guides-h">
          <div class="psh-section-head">
            <h2 class="psh-section-title" id="psh-guides-h">Guides</h2>
            <span class="psh-count">{GUIDES.length}</span>
          </div>
          <div class="psh-grid">
            {GUIDES.map((g, i) => <GuideTile key={g.id} guide={g} index={demos.length + i} />)}
          </div>
        </section>
      </main>
    </div>
  );
}
