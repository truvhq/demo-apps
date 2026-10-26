/**
 * FILE SUMMARY: Public Sector landing layout - Demos, Guides and Tools sections
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

// Guides: how to build and roll these out.
export const GUIDES = [
  { id: 'embedded-orders', name: 'Embedded Orders Field Guide', icon: 'fileText', href: '#public-sector/embedded-orders',
    desc: 'For teams building a benefits application: where the order page goes, nine rules, the settings to check, and a pre-launch checklist.' },
  { id: 'batching', name: 'Batching', icon: 'layers', href: '#public-sector/batching',
    desc: 'Create orders in bulk. Staff drop a CSV in a folder and a scheduled job makes one order per row. Includes a runnable kit.' },
];

// Tools: things you run on your own data, not an applicant flow.
export const TOOLS = [
  { id: 'payroll-coverage', name: 'Payroll Coverage', icon: 'barChart', href: '#coverage-analysis/payroll-coverage',
    desc: 'Upload up to 10,000 employers and see which ones Truv supports for income, employment, deposit switch, or paycheck‑linked loans.' },
  { id: 'bank-coverage', name: 'Financial Accounts Coverage', icon: 'search', href: '#coverage-analysis/bank-coverage',
    desc: 'Upload up to 10,000 financial institutions and see which ones Truv can connect to for transactions or assets data.' },
];

function Tile({ href, name, desc, Icon, index }) {
  return (
    <a class="psh-tile" href={href} style={{ '--i': index }}>
      <div class="psh-tile-top">
        <span class="psh-ic" aria-hidden="true">{Icon && <Icon size={20} />}</span>
        <Icons.arrowRight class="psh-go" size={18} aria-hidden="true" />
      </div>
      <h3 class="psh-tile-name">{name}</h3>
      <p class="psh-tile-desc">{desc}</p>
    </a>
  );
}

function Section({ id, title, sub, children }) {
  return (
    <section class="psh-section-block" id={`psh-${id}`} aria-labelledby={`psh-${id}-h`}>
      <div class="psh-section-head">
        <h2 class="psh-section-title" id={`psh-${id}-h`}>{title}</h2>
        <p class="psh-section-sub">{sub}</p>
      </div>
      <div class="psh-grid">{children}</div>
    </section>
  );
}

/**
 * items  : [{ key, demo, industryId, label }]
 * section: 'demos' | 'guides' | 'tools' - scroll to that section on mount
 */
export function DemoHub({ trail, back, title, lead, items, section }) {
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
          <h1 class="psh-title">{title}</h1>
          <p class="psh-lead">{lead}</p>
        </div>
      </section>

      <main class="psh-wrap psh-sections">
        <Section id="demos" title="Demos" sub="Working flows, run against the live API.">
          {items.map((it, i) => (
            <Tile key={it.key} href={`#${it.industryId}/${it.demo.id}`} name={it.demo.name} desc={it.desc}
              Icon={DEMO_ICONS[it.demo.id]} index={i} />
          ))}
        </Section>
        <Section id="guides" title="Guides" sub="Step-by-step help for building and rolling out.">
          {GUIDES.map((g, i) => <Tile key={g.id} href={g.href} name={g.name} desc={g.desc} Icon={Icons[g.icon]} index={i} />)}
        </Section>
        <Section id="tools" title="Tools" sub="Check coverage with your own data.">
          {TOOLS.map((g, i) => <Tile key={g.id} href={g.href} name={g.name} desc={g.desc} Icon={Icons[g.icon]} index={i} />)}
        </Section>
      </main>
    </div>
  );
}
