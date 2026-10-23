import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'fs';
import { join } from 'path';
import SOURCE from '../../src/guides/embedded-orders/guide-source.html?raw';
import { prepareGuide, NAV, GUIDE_HASH, ASSET_BASE, REEL_SLOT } from '../../src/guides/embedded-orders/prepare.js';
import { CHAPTERS, RULES, chapterAt, chapterForRule, fmt, VIDEO_SRC, POSTER_SRC, VIDEO_DURATION } from '../../src/guides/embedded-orders/chapters.js';
import { lineKey } from '../../src/guides/embedded-orders/enhance.jsx';

const root = join(__dirname, '..', '..');
const html = prepareGuide();

// Everything a reader sees: tags dropped, SVG text kept, whitespace collapsed.
const visibleText = s => s
  .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#8217;/g, '’')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

describe('the guide text', () => {
  // The only differences from the published text, written out by hand so this test
  // does not depend on how the code makes them.
  const WORDING = [
    ['gives you three shapes.', 'gives you three setups.'],
    ['Shape You pass The applicant can', 'Setup You pass The applicant can'],
    ['Three shapes recur in the diagrams below.', 'Three kinds of element recur in the diagrams below.'],
    ['Texas Benefits, step 11 of 17.', 'Acme State Benefits, step 6 of 11.'],
    ['MI Bridges. The embed is the step', 'Acme State Benefits. The embed is the step'],
  ];
  const MAST_LINKS = ' Watch the nine rules in about a minute Jump to the pre-launch QA list';

  it('is the source text plus only the listed changes', () => {
    const heading = 'Embedding Truv Orders in benefits applications';
    let expected = visibleText(SOURCE);
    for (const [from, to] of WORDING) {
      expect(expected.includes(from), `source has "${from}"`).toBe(true);
      expected = expected.replace(from, to);
    }
    expected = expected.replace(heading, heading + MAST_LINKS);
    const got = visibleText(html);
    expect(got.length).toBeGreaterThan(50_000);
    expect(got).toBe(expected);
  });

  it('never uses the word "shape" for technical things', () => {
    expect(html).not.toMatch(/\bshapes?\b/i);
  });

  it('captions the screenshots with the invented app they show, not real state sites', () => {
    const captions = [...html.matchAll(/<p class="sub">([\s\S]*?)<\/p>/g)].map(m => m[1]);
    expect(captions.length).toBeGreaterThanOrEqual(5);
    for (const c of captions) expect(c).not.toMatch(/Texas Benefits|MI Bridges/);
  });

  it('keeps every table, row, cell, list item and link the published guide has', () => {
    const count = re => (html.match(re) || []).length;
    expect(count(/<table\b/g)).toBe(12);
    expect(count(/<tr\b/g)).toBe(77);
    expect(count(/<t[dh]\b/g)).toBe(228);
    expect(count(/<li\b/g)).toBe(47);
    expect(count(/<a\b/g)).toBe(37 + 2); // the guide's links, plus two under the title
    expect(count(/class="callout/g)).toBe(14);
    expect(count(/class="callout warn/g)).toBe(3);
  });

  it('keeps every section, rule, figure, screenshot and code block', () => {
    expect([...html.matchAll(/<section class="sec" id="([\w-]+)"/g)].map(m => m[1])).toEqual(
      ['start', 'flows', 'journey', 'deeplink', 'returning', 'rules', 'layout', 'config', 'qa', 'demos', 'decisions']);
    expect([...html.matchAll(/<article class="rule-card" id="(rule-\d)"/g)].length).toBe(9);
    expect((html.match(/<svg\b/g) || []).length).toBe(9);
    expect((html.match(/<img\b/g) || []).length).toBe(9);
    expect((html.match(/<pre\b/g) || []).length).toBe(16);
  });
});

describe('links and files', () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));

  it('points every in-page link at the app route, to an id that exists', () => {
    expect(html).not.toMatch(/href="#[^p]/);
    const targets = [...html.matchAll(new RegExp(`href="${GUIDE_HASH}/([\\w-]+)"`, 'g'))].map(m => m[1]);
    expect(targets.length).toBeGreaterThanOrEqual(18);
    for (const t of targets) expect(ids.has(t) || t === 'watch', `#${t}`).toBe(true);
  });

  it('has a nav entry for a section that exists, for every nav label', () => {
    for (const [id] of NAV) expect(ids.has(id), id).toBe(true);
    expect(NAV.length).toBe(10);
  });

  it('opens outside links in a new tab without leaking the opener', () => {
    const links = [...html.matchAll(/<a [^>]*href="https?:\/\/[^"]*"[^>]*>/g)].map(m => m[0]);
    expect(links.length).toBe(19);
    for (const l of links) expect(l).toMatch(/target="_blank" rel="noopener noreferrer"/);
  });

  it('serves every screenshot from a file that exists', () => {
    const srcs = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map(m => m[1]);
    expect(srcs.length).toBe(9);
    for (const s of srcs) {
      expect(s.startsWith(`${ASSET_BASE}/img/`), s).toBe(true);
      expect(existsSync(join(root, 'public', s)), s).toBe(true);
    }
  });

  it('puts the video slot once, inside the rules section, before the first rule', () => {
    expect(html.split(REEL_SLOT).length - 1).toBe(1);
    const at = html.indexOf(REEL_SLOT);
    expect(at).toBeGreaterThan(html.indexOf('id="rules"'));
    expect(at).toBeLessThan(html.indexOf('id="rule-1"'));
  });
});

describe('the video', () => {
  it('ships the file and its poster', () => {
    for (const src of [VIDEO_SRC, POSTER_SRC]) expect(statSync(join(root, 'public', src)).size, src).toBeGreaterThan(10_000);
  });

  it('has an intro, nine six-second rules in order, and an outro that reaches the end', () => {
    expect(CHAPTERS.length).toBe(11);
    expect(RULES.map(r => r.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (let i = 1; i < CHAPTERS.length; i++) expect(CHAPTERS[i].start).toBe(CHAPTERS[i - 1].end);
    expect(CHAPTERS[0].start).toBe(0);
    expect(CHAPTERS.at(-1).end).toBe(VIDEO_DURATION);
    for (let n = 1; n <= 9; n++) {
      const c = chapterForRule(n);
      expect(c.end - c.start).toBe(6);
      expect(c.start).toBe(3.5 + 6 * (n - 1));
    }
  });

  it('finds the chapter for a playback time', () => {
    expect(chapterAt(0).id).toBe('intro');
    expect(chapterAt(3.49).id).toBe('intro');
    expect(chapterAt(3.5).id).toBe('rule-1');
    expect(chapterAt(40).id).toBe('rule-7');
    expect(chapterAt(61).id).toBe('outro');
  });

  it('formats times as m:ss', () => {
    expect(fmt(0)).toBe('0:00');
    expect(fmt(9.5)).toBe('0:09');
    expect(fmt(62.08)).toBe('1:02');
  });
});

describe('the pre-launch checklist', () => {
  it('gives each line its own id, however it is spaced', () => {
    expect(lineKey('A  b\n c')).toBe(lineKey('A b c'));
    const lines = [...SOURCE.matchAll(/<div class="checkgroup">[\s\S]*?<\/div>/g)]
      .flatMap(m => [...m[0].matchAll(/<li>([\s\S]*?)<\/li>/g)].map(x => x[1].replace(/<[^>]+>/g, ' ')));
    expect(lines.length).toBe(29);
    expect(new Set(lines.map(lineKey)).size).toBe(29);
  });
});
