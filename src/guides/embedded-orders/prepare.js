/**
 * FILE SUMMARY: Turns the guide's source HTML into what the page renders.
 *
 * guide-source.html is the guide exactly as published (the body of the artifact).
 * To update the page, replace that file; everything below re-applies. This module
 * makes the only changes the page needs, and nothing else touches the text:
 *
 *   1. In-page links (#rules) point at the app route, because a bare #rules would
 *      be read by the hash router as a different page.
 *   2. Screenshot paths point at /guides/embedded-orders/img/.
 *   3. Outside links open in a new tab.
 *   4. Three wording fixes (TEXT_FIXES): the word "shape" is not used for
 *      technical things here.
 *   5. An empty slot for the video after the rules intro, and two links under
 *      the title.
 */
import SOURCE from './guide-source.html?raw';

export const GUIDE_HASH = '#public-sector/embedded-orders';
export const ASSET_BASE = '/guides/embedded-orders';
export const REEL_SLOT = '<div class="eog-reel-slot"></div>';

export const TEXT_FIXES = [
  [/gives you\s+three shapes\./, 'gives you three setups.'],
  [/<th>Shape<\/th>/, '<th>Setup</th>'],
  [/Three shapes recur in the diagrams below\./, 'Three kinds of element recur in the diagrams below.'],
];

// Section ids the page nav links to, with the labels the guide's own nav used.
export const NAV = [
  ['flows', 'Capture or verify'],
  ['journey', 'Placement'],
  ['deeplink', 'Deeplinking'],
  ['returning', 'Returning applicants'],
  ['rules', 'The rules'],
  ['layout', 'Layout'],
  ['config', 'Configuration'],
  ['qa', 'QA'],
  ['demos', 'Reference apps'],
  ['decisions', 'What to decide'],
];

export function prepareGuide(raw = SOURCE) {
  let html = raw;
  for (const [from, to] of TEXT_FIXES) html = html.replace(from, to);

  html = html.replace(/href="#([\w-]+)"/g, `href="${GUIDE_HASH}/$1"`);
  html = html.replace(/(<img\b[^>]*\bsrc=")img\//g, `$1${ASSET_BASE}/img/`);
  html = html.replace(/<a (href="https?:\/\/[^"]*")/g, '<a $1 target="_blank" rel="noopener noreferrer"');

  html = html.replace(
    /(<div class="mast">[\s\S]*?<\/h1>)/,
    `$1\n<p class="eog-mast-links"><a href="${GUIDE_HASH}/watch">Watch the nine rules in about a minute</a>`
      + `<a href="${GUIDE_HASH}/qa">Jump to the pre-launch checklist</a></p>`,
  );

  html = html.replace(
    /(<section class="sec" id="rules">\s*<div class="sec-head">[\s\S]*?<\/div>)/,
    `$1\n${REEL_SLOT}`,
  );

  return html;
}
