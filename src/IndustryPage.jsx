import { Icons } from './components/Icons.jsx';
import { Header } from './components/Header.jsx';

const DEMO_ICONS = {
  'pos-application': Icons.fileText,
  'pos-tasks': Icons.clipboard,
  'los': Icons.shieldCheck,
  'documents': Icons.upload,
  'customer-portal': Icons.users,
  'verifier-portal': Icons.shieldCheck,
  'batching': Icons.layers,
  'renewals-refresh': Icons.repeat,
  'refresh-guide': Icons.fileText,
  'smart-routing': Icons.shuffle,
  'bank-income': Icons.bankBuilding,
  'payroll-income': Icons.briefcase,
  'pll': Icons.repeat,
  'income-pll': Icons.link2,
  'deposit-switch': Icons.arrowRightLeft,
  'payroll-coverage': Icons.barChart,
  'bank-coverage': Icons.search,
};

// One tile. `tile` stacks the content vertically so cards line up in a grid;
// otherwise it is the original icon-left row used by single-section industries.
function DemoCard({ demo, industryId, index, tile }) {
  const Icon = DEMO_ICONS[demo.id];
  return (
    <a
      href={`#${industryId}/${demo.id}`}
      class="group block animate-slideUp h-full"
      style={{ animationDelay: `${80 + index * 60}ms` }}
    >
      <div class={`border border-[#e8e8ed] rounded-2xl transition-all duration-300 hover:border-[#c0c0c5] active:scale-[0.99] h-full ${tile ? 'p-5' : 'pl-4 pr-6 py-5'}`}>
        <div class={`flex h-full ${tile ? 'flex-col gap-4' : 'items-start gap-4'}`}>
          <div class="w-10 h-10 rounded-xl bg-[#f5f5f7] flex items-center justify-center text-[#000000] shrink-0 group-hover:bg-primary/5 group-hover:text-primary transition-all">
            {Icon && <Icon size={20} />}
          </div>
          <div class="flex-1 min-w-0 flex flex-col">
            <div class="flex items-center justify-between mb-1">
              <h3 class="text-[17px] font-semibold tracking-[-0.02em] text-[#000000] group-hover:text-primary transition-colors">{demo.name}</h3>
              <svg class="w-4 h-4 text-[#808080] opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
            </div>
            <p class="text-[15px] text-[#808080] leading-[1.5] mb-3">{demo.desc}</p>
            <div class="flex flex-wrap gap-1.5 mt-auto">
              {demo.tags.map(t => (
                <span key={t} class="text-[11px] font-medium text-[#808080] bg-[#f5f5f7] px-2.5 py-1 rounded-md font-mono">{t}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </a>
  );
}

// A titled group of tiles in a two-column grid (one column on narrow screens).
function Section({ title, blurb, items, industryId, offset }) {
  if (items.length === 0) return null;
  return (
    <section class="mb-12">
      <div class="mb-5">
        <h2 class="text-[22px] font-semibold tracking-[-0.02em] text-[#000000]">{title}</h2>
        <p class="text-[15px] text-[#808080] mt-1">{blurb}</p>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
        {items.map((d, i) => (
          <DemoCard key={d.id} demo={d} industryId={industryId} index={offset + i} tile />
        ))}
      </div>
    </section>
  );
}

export function IndustryPage({ industry }) {
  const guides = industry.demos.filter(d => d.kind === 'guide');
  const demos = industry.demos.filter(d => d.kind !== 'guide');
  // Only industries that actually have guides get the two-section layout.
  const sectioned = guides.length > 0;

  return (
    <div class="min-h-screen flex flex-col bg-white">
      <Header trail={[{ label: industry.name, href: `#${industry.id}` }]} sticky />
      <main class="flex-1 flex items-start justify-center pt-16 pb-20 px-6">
        <div class={`${sectioned ? 'max-w-[960px]' : 'max-w-[640px]'} w-full`}>
          <div class="animate-slideUp mb-12 max-w-[640px]">
            <a href="#" class="text-[13px] text-primary font-medium hover:underline mb-4 inline-flex items-center gap-1">
              <Icons.arrowLeft size={14} />
              All Industries
            </a>
            <h1 class="text-[28px] sm:text-[40px] font-semibold tracking-[-0.03em] text-[#000000] leading-[1.1] mb-3">{industry.name}</h1>
            <p class="text-[17px] text-[#808080] leading-[1.5]">{industry.desc}</p>
          </div>
          {sectioned ? (
            <>
              <Section title="Demos" blurb="Interactive flows you can run end to end." items={demos} industryId={industry.id} offset={0} />
              <Section title="Guides" blurb="Reference material to read before you build." items={guides} industryId={industry.id} offset={demos.length} />
            </>
          ) : (
            <div class="space-y-3">
              {industry.demos.map((d, i) => (
                <DemoCard key={d.id} demo={d} industryId={industry.id} index={i} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
