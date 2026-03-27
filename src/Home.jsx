const DEMOS = [
  {
    id: 'application',
    name: 'Application',
    useCase: 'User verifies during an application',
    desc: 'The user fills in their details, selects their employer, and completes income or employment verification through Bridge.',
    tags: ['Company Search', 'Orders', 'Bridge', 'Reports'],
  },
  {
    id: 'follow-up',
    name: 'Follow-up',
    useCase: 'User completes remaining verifications',
    desc: 'After submitting an application, the user returns to a dashboard of verification tasks and completes them one by one.',
    tags: ['Orders', 'Bridge', 'VOIE', 'VOE', 'Assets'],
  },
  {
    id: 'consumer-credit',
    name: 'Consumer Credit Application',
    useCase: 'Bundle multiple products in one flow',
    desc: 'Combine income verification, direct deposit switching, and payroll-linked lending in a single UI. Uses Bridge directly — no orders needed.',
    tags: ['Users', 'Bridge Tokens', 'Link Reports'],
  },
  {
    id: 'employee-portal',
    name: 'Verifier Portal',
    useCase: 'Verifier processes without the user present',
    desc: 'The user already submitted and left. A verifier creates orders using collected data, sends a link with email/phone, and tracks completion.',
    tags: ['Orders', 'Share URL', 'Status Tracking', 'Reports'],
  },
  {
    id: 'upload-documents',
    name: 'Document Processing',
    useCase: 'Extract data from collected documents',
    desc: 'Process pay stubs, W-2s, and tax returns already collected. Truv validates, classifies, and extracts structured data.',
    tags: ['Document Collections', 'Finalize', 'Parsed Data'],
  },
];

function DemoCard({ demo, index }) {
  return (
    <a
      href={`#${demo.id}`}
      class="group block animate-slideUp"
      style={{ animationDelay: `${80 + index * 60}ms` }}
    >
      <div class="border border-transparent rounded-2xl px-6 py-5 transition-all duration-300 hover:bg-[#f5f5f7] active:scale-[0.99]">
        <div class="flex items-start justify-between mb-2">
          <h3 class="text-[17px] font-semibold tracking-[-0.02em] text-[#1d1d1f] group-hover:text-primary transition-colors">{demo.name}</h3>
          <svg class="w-4 h-4 text-[#86868b] mt-1 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
        </div>
        <p class="text-[13px] font-medium text-primary mb-2">{demo.useCase}</p>
        <p class="text-[15px] text-[#6e6e73] leading-[1.5] mb-4">{demo.desc}</p>
        <div class="flex flex-wrap gap-1.5">
          {demo.tags.map(t => (
            <span key={t} class="text-[11px] font-medium text-[#86868b] bg-[#f5f5f7] px-2.5 py-1 rounded-md font-mono">{t}</span>
          ))}
        </div>
      </div>
    </a>
  );
}

export function Home() {
  return (
    <div class="min-h-screen flex flex-col bg-white">
      <header class="flex items-center h-12 px-6 bg-white/80 backdrop-blur-xl border-b border-[#d2d2d7]/40 sticky top-0 z-10">
        <div class="flex items-center gap-2">
          <div class="w-[18px] h-[18px] bg-primary rounded-full" />
          <div class="text-[14px] font-semibold tracking-[-0.01em] text-[#1d1d1f]">Truv Quickstart</div>
        </div>
      </header>
      <main class="flex-1 flex items-start justify-center pt-16 pb-20 px-6">
        <div class="max-w-[640px] w-full">
          <div class="animate-slideUp mb-12">
            <h1 class="text-[40px] font-semibold tracking-[-0.03em] text-[#1d1d1f] leading-[1.1] mb-3">Quickstart Demos</h1>
            <p class="text-[17px] text-[#6e6e73] leading-[1.5] max-w-[480px]">
              Five integration patterns for verifying income, employment, and assets with the Truv API.
            </p>
          </div>
          <div class="-mx-6 divide-y divide-[#d2d2d7]/30">
            {DEMOS.map((d, i) => <DemoCard key={d.id} demo={d} index={i} />)}
          </div>
        </div>
      </main>
    </div>
  );
}
