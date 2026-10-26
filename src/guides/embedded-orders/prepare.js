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
 *   4. Wording fixes (TEXT_FIXES). Three drop the word "shape", which is not
 *      used for technical things here. Two correct screenshot captions that name
 *      real state sites ("Texas Benefits", "MI Bridges") under images that show
 *      the invented "Acme State Benefits" application. The rest correct the guide
 *      where a build made from it, or the OpenAPI spec, showed it was wrong: the
 *      Rule 8 figure drew onSuccess before COMPLETED, two spots still described
 *      Continue as having two states, skip_behavior was shown as a single value,
 *      allow_additional_connections was missing from the checklist, and a heading
 *      counted four constraints over five.
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
  [/Texas Benefits, step 11 of 17\./, 'Acme State Benefits, step 6 of 11.'],
  [/MI Bridges\. The embed is the step/, 'Acme State Benefits. The embed is the step'],

  // Rule 8. A build made from the guide saw the order COMPLETED -> onSuccess, with
  // onSuccess last, as Rule 5 and the Rule 8 text already say. The figure drew it
  // first and called it "an account connected".
  [/<p>Gate on the one event that means the order reached its final state\.<\/p>/,
    '<p>Treat the step as verified on the one event that means the order reached its final state.</p>'],
  [/aria-label="A timeline of Bridge order events\.[^"]*"/,
    'aria-label="A timeline of Bridge order events. Employer selected, login complete and a success event for the connection come first. Self-certification follows where enabled. COMPLETED with source order is the correct gate, and fires on the final state whether that was success or skipped. onSuccess is marked the wrong gate because it arrives after COMPLETED and is not a per-connection event."'],
  [/<text x="250" y="108">SUCCESS<\/text>/,
    '<text x="250" y="108">SUCCESS</text><text x="250" y="119">(bridge)</text>'],
  [/<!-- wrong gate -->[\s\S]*?(?=<!-- onClose note)/, `<!-- self-certification -->
          <rect x="330" y="72" width="164" height="28" rx="4" fill="var(--surface-2)" stroke="currentColor" stroke-width="1.2"/>
          <text x="412" y="90" text-anchor="middle" font-size="10" font-weight="600" fill="currentColor">Self-certification</text>
          <text x="412" y="116" text-anchor="middle" font-size="9.5" fill="currentColor">where enabled, the applicant</text>
          <text x="412" y="128" text-anchor="middle" font-size="9.5" fill="currentColor">reviews records here</text>
          <!-- correct gate -->
          <text x="610" y="48" text-anchor="middle" font-size="10" font-weight="700" fill="var(--do)">CORRECT GATE</text>
          <text x="610" y="64" text-anchor="middle" class="m" font-size="9.5" font-weight="600" fill="var(--do)">COMPLETED · order</text>
          <circle cx="610" cy="86" r="8" fill="var(--do-solid)" stroke="var(--do-solid)" stroke-width="2"/>
          <circle cx="610" cy="86" r="3" fill="var(--do-on-solid)"/>
          <text x="610" y="110" text-anchor="middle" font-size="9.5" fill="var(--do)">final state reached</text>
          <text x="610" y="122" text-anchor="middle" font-size="9.5" fill="var(--do)">(success or skipped)</text>
          <!-- wrong gate -->
          <text x="772" y="48" text-anchor="middle" font-size="10" font-weight="700" fill="var(--dont)">WRONG GATE</text>
          <text x="772" y="64" text-anchor="middle" class="m" font-size="9.5" font-weight="600" fill="var(--dont)">onSuccess()</text>
          <circle cx="772" cy="86" r="6" fill="var(--dont-soft)" stroke="var(--dont)" stroke-width="2"/>
          <g stroke="var(--dont)" stroke-width="2" stroke-linecap="round">
            <line x1="764" y1="78" x2="780" y2="94"/><line x1="780" y1="78" x2="764" y2="94"/>
          </g>
          <text x="772" y="110" text-anchor="middle" font-size="9.5" fill="var(--dont)">arrives after COMPLETED;</text>
          <text x="772" y="122" text-anchor="middle" font-size="9.5" fill="var(--dont)">not a per-connection event</text>
          `],
  [/<figcaption>Gate on the right-hand marker\.[\s\S]*?<\/figcaption>/,
    "<figcaption>Gate on the COMPLETED marker. Where self-certification is enabled the applicant's review sits between the connection's SUCCESS and COMPLETED, so acting on SUCCESS can move them on before they have finished. onSuccess arrives after COMPLETED.</figcaption>"],

  // Rule 4 gives the step three states, so COMPLETED marks a step verified. It
  // does not hold back an applicant who took an escape.
  [/enableContinue\(\);(\s+)<span class="c">\/\/ the only correct gate<\/span>/,
    'markVerified();$1<span class="c">// the only gate for a verified step</span>'],
  [/source === 'order'\) enableContinue\(\);/, "source === 'order') markVerified();"],
  [/(<pre>onEvent: function \(type, payload, source\) \{\s+if \(type === 'COMPLETED'[\s\S]*?<\/pre>)/,
    `$1
        <p><b>This is the gate for a verified step, not for leaving it.</b> An applicant who took an
          escape from Rule 4 is deferred, not blocked: they can move on, labelled "Continue without
          verifying here". Do not hold them on this event.</p>`],
  [/<li>Continue becomes active only on <code>COMPLETED<\/code> \/ <code>source: "order"<\/code><\/li>/,
    '<li>Continue is disabled until the step is verified (<code>COMPLETED</code> / <code>source: "order"</code>) or the applicant takes an escape, and its label says which: "Continue" when verified, "Continue without verifying here" when deferred</li>'],

  // skip_behavior is an object keyed by product in the OpenAPI spec.
  [/It is a template setting, not a parameter you send(\s+)when creating an order:<\/p>/,
    'It is a template setting, not a parameter you send$1when creating an order, and it is an object keyed by product - for example <code>{ "income": "any" }</code> - so each value below applies to one product:</p>'],
  [/<td><code>any<\/code> for most programs<\/td>/, '<td><code>{ "income": "any" }</code> for most programs</td>'],
  [/(<tr><td><code>orders\.skip_behavior<\/code><\/td>[^\n]*<\/tr>)/,
    `$1
            <tr><td><code>allow_additional_connections</code></td><td>Template</td><td><code>["income"]</code> for the semi-open choice</td><td>Lets the applicant add a second employer to the same order; overrides the account default</td></tr>`],

  [/<p class="sub">Four constraints worth knowing before you hit them\.<\/p>/,
    '<p class="sub">Five constraints worth knowing before you hit them.</p>'],
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
      + `<a href="${GUIDE_HASH}/qa">Jump to the pre-launch QA list</a></p>`,
  );

  html = html.replace(
    /(<section class="sec" id="rules">\s*<div class="sec-head">[\s\S]*?<\/div>)/,
    `$1\n${REEL_SLOT}`,
  );

  return html;
}
