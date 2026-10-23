/**
 * FILE SUMMARY: Shared flat landing layout - a Demos section and a Guides section
 * on one page, one tile per item, no click-through levels.
 * Used by the home page (every industry, with an industry filter) and by the
 * Public Sector page. Styles: ps-hub.css, scoped under `.psh`. Same design
 * language as the Batching walkthrough.
 */
import { useEffect, useState } from 'preact/hooks';
import { Header } from '../components/Header.jsx';
import { Icons } from '../components/Icons.jsx';
import { DEMO_ICONS } from '../IndustryPage.jsx';
import './ps-hub.css';

// Guides: walkthroughs and tools that are not an applicant flow. `only` limits a
// guide to those industry pages (it always shows on the home page).
export const GUIDES = [
  { id: 'batching', name: 'Batching', icon: 'layers', href: '#public-sector/batching', mode: 'Walkthrough', only: ['public-sector'],
    desc: 'Bulk order intake: staff drop a CSV into a folder and a scheduled job creates one order per row. Includes the setup guides and a runnable kit.' },
  { id: 'payroll-coverage', name: 'Payroll Coverage', icon: 'barChart', href: '#coverage-analysis/payroll-coverage', mode: 'Coverage tool',
    desc: 'Upload a CSV of up to 10,000 employers and see which ones Truv supports for income, employment, deposit-switch, or paycheck-linked-loans.' },
  { id: 'bank-coverage', name: 'Financial Accounts Coverage', icon: 'search', href: '#coverage-analysis/bank-coverage', mode: 'Coverage tool',
    desc: 'Upload a CSV of up to 10,000 financial accounts and see which ones Truv can connect to for transactions or assets data.' },
];

function DemoTile({ item, index }) {
  const { demo, industryId, label } = item;
  const Icon = DEMO_ICONS[demo.id];
  return (
    <a class="psh-tile" href={`#${industryId}/${demo.id}`} style={{ '--i': index }}>
      <div class="psh-tile-top">
        <span class="psh-ic" aria-hidden="true">{Icon && <Icon size={20} />}</span>
        <span class="psh-mode">Live API demo</span>
      </div>
      {label && <div class="psh-usecase">{label}</div>}
      <h3 class="psh-tile-name">{demo.name}</h3>
      <p class="psh-tile-desc">{demo.desc}</p>
      <div class="psh-tags">
        {(demo.tags || []).map(t => <span class="psh-tag" key={t}>{t}</span>)}
      </div>
    </a>
  );
}

function GuideTile({ guide, index }) {
  const Icon = Icons[guide.icon];
  return (
    <a class="psh-tile" href={guide.href} style={{ '--i': index }}>
      <div class="psh-tile-top">
        <span class="psh-ic" aria-hidden="true">{Icon && <Icon size={20} />}</span>
        <span class="psh-mode">{guide.mode}</span>
      </div>
      <h3 class="psh-tile-name">{guide.name}</h3>
      <p class="psh-tile-desc">{guide.desc}</p>
    </a>
  );
}

/**
 * items   : [{ key, demo, industryId, industryName, label }]
 * filters : optional [{ id, name }] - shows industry chips above the demos
 * section : 'demos' | 'guides' - scroll to that section on mount
 * industryId: the industry page this is on; omit on the home page (shows every guide)
 * heroExtra: optional node under the lead (e.g. the Update API keys button)
 */
export function DemoHub({ trail, back, eyebrow, title, lead, items, filters, defaultFilter = 'all',
                          section, industryId, heroExtra }) {
  const guides = GUIDES.filter(g => !g.only || !industryId || g.only.includes(industryId));
  // The filter lives in the URL (#filter=<industry-id>) so a filtered view can
  // be linked and shared. Unknown ids fall back to All.
  const validIds = new Set((filters || []).map(f => f.id));
  const fromHash = () => {
    const m = /^#filter=([\w-]+)/.exec(window.location.hash);
    if (m && (m[1] === 'all' || validIds.has(m[1]))) return m[1];
    return validIds.has(defaultFilter) ? defaultFilter : 'all';
  };
  const [filter, setFilterState] = useState(filters ? fromHash : 'all');
  const setFilter = (id) => {
    setFilterState(id);
    // replaceState: updates the shareable URL without adding a history entry
    // per click or triggering the router.
    // All gets its own link too, so it can override a non-All default.
    const url = window.location.pathname + window.location.search + `#filter=${id}`;
    window.history.replaceState(null, '', url);
  };
  // A pasted link or a manual hash edit on the same page re-applies the filter.
  useEffect(() => {
    if (!filters) return;
    const onHash = () => setFilterState(fromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!section) return;
    // Wait for layout, then scroll the window (the sticky header covers 72px).
    const t = setTimeout(() => {
      const el = document.getElementById(`psh-${section}`);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72 });
    }, 50);
    return () => clearTimeout(t);
  }, [section]);

  const shown = filter === 'all' ? items : items.filter(i => i.industryId === filter);

  return (
    <div class="psh">
      <Header trail={trail} sticky />
      <section class="psh-hero">
        <div class="psh-wrap">
          {back && <a href={back.href} class="psh-back"><Icons.arrowLeft size={14} /> {back.label}</a>}
          {eyebrow && <div class="psh-eyebrow">{eyebrow}</div>}
          <h1 class="psh-title">{title}</h1>
          <p class="psh-lead">{lead}</p>
          {heroExtra}
        </div>
      </section>

      <main class="psh-wrap psh-sections">
        <section class="psh-section-block" id="psh-demos" aria-labelledby="psh-demos-h">
          <div class="psh-section-head">
            <h2 class="psh-section-title" id="psh-demos-h">Demos</h2>
            <span class="psh-count">{shown.length}</span>
          </div>
          {filters && (
            <div class="psh-filters" role="group" aria-label="Filter demos by industry">
              {[{ id: 'all', name: 'All' }, ...filters].map(f => (
                <button type="button" key={f.id} aria-pressed={filter === f.id}
                        class={`psh-chip${filter === f.id ? ' on' : ''}`} onClick={() => setFilter(f.id)}>
                  {f.name}
                </button>
              ))}
            </div>
          )}
          <div class="psh-grid" key={filter}>
            {shown.map((it, i) => <DemoTile key={it.key} item={it} index={i} />)}
          </div>
        </section>

        <section class="psh-section-block" id="psh-guides" aria-labelledby="psh-guides-h">
          <div class="psh-section-head">
            <h2 class="psh-section-title" id="psh-guides-h">Guides</h2>
            <span class="psh-count">{guides.length}</span>
          </div>
          <div class="psh-grid">
            {guides.map((g, i) => <GuideTile key={g.id} guide={g} index={i} />)}
          </div>
        </section>
      </main>
    </div>
  );
}
