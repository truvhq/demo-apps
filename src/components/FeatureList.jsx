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
 * This component owns the informational treatment: no border, no fill, no box,
 * no badge chrome, no tile grid — a plain single-column list of heading plus
 * description, read straight down. Only genuinely selectable cards keep the
 * bordered, clickable-looking container, so the two are distinguishable before
 * the pointer ever moves. Every non-selectable grid across the demos renders
 * through here so the two treatments can't drift back together. Deliberately not
 * named "...Cards": these no longer render as cards, and shouldn't grow back
 * into them.
 */

// Props:
//   items : [{ name, desc, report? }] — `report` is a report-type label (VOIE,
//           VOA, ...). It is folded into the heading as "Name (VOIE)" rather than
//           rendered as its own badge: with no card border to sit against, a
//           standalone chip just read as leftover button chrome.
export function FeatureList({ items }) {
  return (
    // Always one column. Laid out 2x2, four blurbs read as a block of tiles —
    // the exact impression this treatment is getting away from. Stacked, they
    // read as consecutive descriptions. The gap is tight for the same reason:
    // enough to separate entries, not enough to imply each one is a container.
    <div class="grid gap-3 text-left">
      {items.map(item => (
        <div key={item.name}>
          <h3 class="text-[14px] font-semibold text-[#000000]">
            {item.report ? `${item.name} (${item.report})` : item.name}
          </h3>
          <p class="text-[13px] text-[#808080] leading-[1.4] mt-1">{item.desc}</p>
        </div>
      ))}
    </div>
  );
}
