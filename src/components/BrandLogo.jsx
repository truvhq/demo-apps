/**
 * FILE SUMMARY: The Truv by Checkr lockup, used wherever the brand mark appears.
 * One component so every page shows the same mark at the same proportions.
 */
export function BrandLogo({ height = 28, className = '' }) {
  return (
    <img
      src="/brand/truv-by-checkr.png"
      alt="Truv by Checkr"
      height={height}
      style={{ height: `${height}px`, width: 'auto', display: 'block' }}
      class={className}
    />
  );
}
