/**
 * FILE SUMMARY: Chapter table and transcript for the "nine rules" video.
 *
 * The video shows each of the guide's nine rules wrong, then right, about six
 * seconds apiece. Start times were measured by watching the "Rule N of 9" label
 * change, so a chip can seek straight to a rule. The transcript writes out the
 * titles, captions and labels the video prints, so the video's message is also
 * available as text.
 */

export const VIDEO_SRC = '/guides/embedded-orders/nine-rules.mp4';
export const POSTER_SRC = '/guides/embedded-orders/nine-rules-poster.jpg';
export const VIDEO_DURATION = 62.08;

const INTRO_END = 3.5;
const RULE_LENGTH = 6;

// What each rule shows on screen: the wrong way, the right way, and the short
// annotation the video prints on the wrong way.
export const RULES = [
  { n: 1, title: 'Mount it on page load',
    dont: 'A button stands between the applicant and the order page.',
    dontNote: null,
    doText: 'The order page is the step, mounted on arrival.',
    badge: '30-35% more completed verifications' },
  { n: 2, title: 'Let the template carry the message',
    dont: 'Headings, paragraphs and a checklist stacked above the embed.',
    dontNote: 'Said again below',
    doText: 'Set the message on your template. It is said once.' },
  { n: 3, title: 'No Yes/No gate before the embed',
    dont: 'Ask, explain, then finally mount Truv: three screens.',
    dontNote: 'Two screens before Truv',
    doText: 'The income step is the landing page. One screen.' },
  { n: 4, title: 'Manual entry goes below the embed',
    dont: 'Two equal-weight buttons above the embed.',
    dontNote: 'Equal weight = equally good choices',
    doText: 'One embed. A text link and a send-link button sit beneath.' },
  { n: 5, title: 'Hide manual entry once connected',
    dont: '\u201CEnter manually instead\u201D stays on screen after a connection.',
    dontNote: 'Still offered',
    doText: 'It goes the moment a connection is made.' },
  { n: 6, title: 'Use the SDK, not an iframe',
    dont: 'An iframe of the share link.',
    dontNote: 'Hand-rolled. Never iframe share_url.',
    doText: 'Load bridge.js. Mount inline on the bridge token.' },
  { n: 7, title: 'Order page inline, sign-in as a modal',
    dont: 'Sign-in nested inside the order page.',
    dontNote: 'Nested: cramped and deprecated',
    doText: 'Order page inline. Sign-in opens as a dialog on top.' },
  { n: 8, title: 'Advance on COMPLETED',
    dont: 'Advancing on onSuccess or onClose.',
    dontNote: 'Moved on before the order finished',
    doText: 'Advance once, on COMPLETED with source order.' },
  { n: 9, title: 'Ask for income once',
    dont: 'Verified, then asked to type it all again.',
    dontNote: 'The same income, typed again',
    doText: 'A read-only row with Edit. Then move on.' },
];

export const INTRO = {
  eyebrow: 'Truv Orders · Field guide',
  title: 'Embed the order in the application',
  line: 'Nine rules. Each shown wrong, then right.',
  badge: 'The applicant never leaves',
};

export const OUTRO = {
  title: 'Embedding Truv Orders',
  line: 'Mount on load. Stay inline. Ask once.',
  badges: ['Gates, repeats, detours', 'One clean path through'],
};

export const CHAPTERS = [
  { id: 'intro', label: INTRO.title, start: 0, end: INTRO_END },
  ...RULES.map(r => {
    const start = INTRO_END + RULE_LENGTH * (r.n - 1);
    return { id: `rule-${r.n}`, n: r.n, label: r.title, start, end: start + RULE_LENGTH };
  }),
  { id: 'outro', label: OUTRO.title, start: INTRO_END + RULE_LENGTH * RULES.length, end: VIDEO_DURATION },
];

export const chapterForRule = n => CHAPTERS.find(c => c.n === n) || null;

// Which chapter a playback time falls in.
export function chapterAt(t) {
  for (let i = CHAPTERS.length - 1; i >= 0; i--) if (t >= CHAPTERS[i].start) return CHAPTERS[i];
  return CHAPTERS[0];
}

// 63.5 -> "1:03". Rounds down so a label never reads later than the real start.
export function fmt(t) {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
