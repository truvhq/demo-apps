/**
 * FILE SUMMARY: Read-only informational blurbs shown on demo intro slides
 * DATA FLOW: Presentational: no direct backend communication
 *
 * The intro slides mix two kinds of content: selectable option cards the viewer
 * is meant to click (see the product pickers in demos/scaffolding/) and purely
 * informational blurbs that just describe the flow. Both used to share the same
 * bordered-white-card recipe, so the static ones read as buttons and viewers
 * clicked them expecting something to happen (IMP-250).
 *
 * This component owns the informational treatment: no border, no fill, no box —
 * just text in a grid. Only genuinely selectable cards keep the bordered,
 * clickable-looking container, so the two are distinguishable before the pointer
 * ever moves. Every non-selectable grid across the demos renders through here so
 * the two treatments can't drift back together. Deliberately not named
 * "...Cards": these no longer render as cards, and shouldn't grow back into them.
 *
 * The grid gap is wider than the old card grid's on purpose: with no box to
 * bound each entry, spacing is the only thing separating one blurb's
 * description from the next one's heading.
 */

// Props:
//   items   : [{ name, desc, report? }] — `report` renders as a small mono badge
//   columns : 1 (default) or 2 for a two-up grid on sm and wider
export function FeatureList({ items, columns = 1 }) {
  return (
    <div class={`grid gap-5 text-left ${columns === 2 ? 'grid-cols-1 sm:grid-cols-2 gap-x-6' : ''}`}>
      {items.map(item => (
        <div key={item.name}>
          <div class="flex items-start justify-between gap-3 mb-1">
            <h3 class="text-[14px] font-semibold text-[#000000]">{item.name}</h3>
            {item.report && (
              <span class="text-[11px] font-medium text-[#808080] bg-[#f5f5f7] px-2 py-0.5 rounded-md font-mono shrink-0">{item.report}</span>
            )}
          </div>
          <p class="text-[13px] text-[#808080] leading-[1.4]">{item.desc}</p>
        </div>
      ))}
    </div>
  );
}
