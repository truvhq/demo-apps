export function Section({ title, children }) {
  return <div class="mb-6"><h3 class="text-sm font-semibold text-gray-900 mb-3">{title}</h3>{children}</div>;
}

export function Row({ label, value }) {
  return (
    <div class="grid grid-cols-[180px_1fr] border-b border-border-light">
      <div class="py-3 text-sm text-gray-500 font-medium">{label}</div>
      <div class="py-3 text-sm font-semibold">{value}</div>
    </div>
  );
}

export function StatusBadge({ status }) {
  const cls = status === 'completed' ? 'bg-success-bg text-success border border-green-200' : 'bg-warning-bg text-warning';
  return <span class={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${cls}`}>{status}</span>;
}

export function ProviderHeader({ name, logoUrl, meta, status }) {
  return (
    <div class="flex items-center gap-3 mb-5 py-4 border-b-2 border-border">
      {logoUrl && <img src={logoUrl} class="w-10 h-10 rounded-lg object-contain border border-border" />}
      <div>
        <div class="text-lg font-bold">{name}</div>
        {meta && <div class="text-sm text-gray-500 mt-0.5">{meta}</div>}
      </div>
      {status && <div class="ml-auto"><StatusBadge status={status} /></div>}
    </div>
  );
}
