/**
 * FILE SUMMARY: Public Sector landing layout - a Demos section and a Guides section
 * on one page, one card per item, no click-through levels.
 * Used only by the Public Sector page (PublicSectorHub.jsx). Styles: ps-hub.css,
 * scoped under `.psh`. Same design language as the Batching walkthrough.
 */
import { useEffect } from 'preact/hooks';
import { Header } from '../components/Header.jsx';
import { PhosphorIcons as Icons } from '../components/PhosphorIcons.jsx';
import './ps-hub.css';

const DEMO_ICONS = {
  'customer-portal': Icons.users,
  'verifier-portal': Icons.shieldCheck,
  'renewals-refresh': Icons.repeat,
  'documents': Icons.upload,
};

// Guides: walkthroughs and tools that are not an applicant flow.
export const GUIDES = [
  { id: 'batching', name: 'Batching', icon: 'layers', href: '#public-sector/batching', mode: 'Walkthrough',
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
 * items  : [{ key, demo, industryId, label }]
 * section: 'demos' | 'guides' - scroll to that section on mount
 */
export function DemoHub({ trail, back, eyebrow, title, lead, items, section }) {
  useEffect(() => {
    if (!section) return;
    // Wait for layout, then scroll the window (the sticky header covers 72px).
    const t = setTimeout(() => {
      const el = document.getElementById(`psh-${section}`);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72 });
    }, 50);
    return () => clearTimeout(t);
  }, [section]);

  return (
    <div class="psh">
      <Header trail={trail} sticky theme="checkr" />
      <section class="psh-hero">
        <div class="psh-wrap">
          {back && <a href={back.href} class="psh-back"><Icons.arrowLeft size={14} /> {back.label}</a>}
          {eyebrow && <div class="psh-eyebrow">{eyebrow}</div>}
          <h1 class="psh-title">{title}</h1>
          <p class="psh-lead">{lead}</p>
        </div>
      </section>

      <main class="psh-wrap psh-sections">
        <section class="psh-section-block" id="psh-demos" aria-labelledby="psh-demos-h">
          <div class="psh-section-head">
            <h2 class="psh-section-title" id="psh-demos-h">Demos</h2>
            <span class="psh-count">{items.length}</span>
          </div>
          <div class="psh-grid">
            {items.map((it, i) => <DemoTile key={it.key} item={it} index={i} />)}
          </div>
        </section>

        <section class="psh-section-block" id="psh-guides" aria-labelledby="psh-guides-h">
          <div class="psh-section-head">
            <h2 class="psh-section-title" id="psh-guides-h">Guides</h2>
            <span class="psh-count">{GUIDES.length}</span>
          </div>
          <div class="psh-grid">
            {GUIDES.map((g, i) => <GuideTile key={g.id} guide={g} index={i} />)}
          </div>
        </section>
      </main>
    </div>
  );
}
