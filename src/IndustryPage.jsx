import { Icons } from './components/Icons.jsx';
import { Header } from './components/Header.jsx';

const DEMO_ICONS = {
  'pos-application': Icons.fileText,
  'pos-tasks': Icons.clipboard,
  'los': Icons.shieldCheck,
  'documents': Icons.upload,
  'customer-portal': Icons.users,
  'verifier-portal': Icons.shieldCheck,
  'smart-routing': Icons.shuffle,
  'bank-income': Icons.bankBuilding,
  'payroll-income': Icons.briefcase,
  'pll': Icons.repeat,
  'deposit-switch': Icons.arrowRightLeft,
};

function DemoCard({ demo, industryId, index }) {
  const Icon = DEMO_ICONS[demo.id];
  return (
    <a
      href={`#${industryId}/${demo.id}`}
      class="group block animate-slideUp"
      style={{ animationDelay: `${80 + index * 60}ms` }}
    >
      <div class="border border-transparent rounded-2xl px-6 py-5 transition-all duration-300 hover:bg-[#f5f5f7] active:scale-[0.99]">
        <div class="flex items-start gap-4">
          <div class="w-10 h-10 rounded-xl bg-[#f5f5f7] border border-[#e8e8ed] flex items-center justify-center text-[#8E8E93] shrink-0 group-hover:border-primary/30 group-hover:bg-primary/5 group-hover:text-primary transition-all">
            {Icon && <Icon size={20} />}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between mb-1">
              <h3 class="text-[17px] font-semibold tracking-[-0.02em] text-[#171717] group-hover:text-primary transition-colors">{demo.name}</h3>
              <svg class="w-4 h-4 text-[#8E8E93] opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
            </div>
            <p class="text-[15px] text-[#8E8E93] leading-[1.5] mb-3">{demo.desc}</p>
            <div class="flex flex-wrap gap-1.5">
              {demo.tags.map(t => (
                <span key={t} class="text-[11px] font-medium text-[#8E8E93] bg-[#f5f5f7] px-2.5 py-1 rounded-md font-mono">{t}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </a>
  );
}

export function IndustryPage({ industry }) {
  return (
    <div class="min-h-screen flex flex-col bg-white">
      <Header breadcrumb={industry.name} sticky />
      <main class="flex-1 flex items-start justify-center pt-16 pb-20 px-6">
        <div class="max-w-[640px] w-full">
          <div class="animate-slideUp mb-12">
            <a href="#" class="text-[13px] text-primary font-medium hover:underline mb-4 inline-flex items-center gap-1">
              <Icons.arrowLeft size={14} />
              All Industries
            </a>
            <h1 class="text-[40px] font-semibold tracking-[-0.03em] text-[#171717] leading-[1.1] mb-3">{industry.name}</h1>
            <p class="text-[17px] text-[#8E8E93] leading-[1.5] max-w-[480px]">{industry.desc}</p>
          </div>
          <div class="-mx-6 divide-y divide-[#d2d2d7]/30">
            {industry.demos.map((d, i) => (
              <DemoCard key={d.id} demo={d} industryId={industry.id} index={i} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
