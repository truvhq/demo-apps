export function LoadingPreview({ label = 'Loading…', subtitle }) {
  return (
    <div class="text-center py-16">
      <div class="w-12 h-12 border-[3px] border-[#d2d2d7] border-t-primary rounded-full animate-spin mx-auto mb-6" />
      <h2 class="text-2xl font-semibold tracking-tight mb-2">{label}</h2>
      {subtitle && <p class="text-[15px] text-[#8E8E93]">{subtitle}</p>}
    </div>
  );
}
