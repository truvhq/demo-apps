/**
 * FILE SUMMARY: Public Sector guide: Embedding Truv Orders in benefits applications.
 * ROUTE: #public-sector/embedded-orders   (and #public-sector/embedded-orders/<section>)
 *
 * The guide's text lives in src/guides/embedded-orders/guide-source.html and is
 * rendered as published. This page adds the app header, a section nav that tracks
 * where you are, deep links to every section and rule, and the extras in
 * enhance.jsx (video, copy buttons, an interactive QA list). It makes no API calls.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Header } from '../components/Header.jsx';
import '../industry/ps-hub.css';
import '../guides/embedded-orders/embedded-orders.css';
import { prepareGuide, NAV, GUIDE_HASH } from '../guides/embedded-orders/prepare.js';
import { enhanceGuide } from '../guides/embedded-orders/enhance.jsx';

const TRAIL = [
  { label: 'Public Sector', href: '#public-sector' },
  { label: 'Embedded Orders Field Guide', href: GUIDE_HASH },
];

// Where a section's top edge should sit: below the sticky app header (56px) and
// section nav (48px), with a little air.
const TARGET_TOP = 124;

// Jump to a section, then keep it lined up while the layout settles. Screenshots
// load after the first paint and move everything below them, so one scroll lands
// in the wrong place. Stops as soon as the reader scrolls themselves. Returns a
// function that cancels it.
function alignTo(id) {
  const el = id && document.getElementById(id);
  if (!el) return () => {};
  const drift = () => el.getBoundingClientRect().top - TARGET_TOP;
  window.scrollBy({ top: drift(), behavior: 'auto' });
  // Move keyboard focus with the page, so the next Tab starts inside the section.
  el.tabIndex = -1;
  el.focus({ preventScroll: true });
  let tries = 0;
  let timer = 0;
  const stop = () => {
    clearTimeout(timer);
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(t => window.removeEventListener(t, stop));
  };
  const settle = () => {
    const d = drift();
    if (Math.abs(d) > 3) window.scrollBy({ top: d, behavior: 'auto' });
    if (++tries < 14) timer = setTimeout(settle, 120);
    else stop();
  };
  ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(t => window.addEventListener(t, stop, { passive: true }));
  timer = setTimeout(settle, 120);
  return stop;
}

export function EmbeddedOrdersGuide({ screen }) {
  const html = useMemo(() => prepareGuide(), []);
  const rootRef = useRef(null);
  const navRef = useRef(null);
  const barRef = useRef(null);
  const [active, setActive] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => { document.title = 'Embedded Orders Field Guide | Truv Demo Apps'; }, []);

  // Says something to screen-reader users (the page has no other way to confirm a copy).
  const announce = useCallback(text => {
    setMessage('');
    setTimeout(() => setMessage(text), 30);
  }, []);

  useEffect(() => enhanceGuide(rootRef.current, announce), [announce]);

  // Which section is on screen, and how far down the page the reader is.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.scrollY + TARGET_TOP + 8;
      let current = '';
      for (const [id] of NAV) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top + window.scrollY <= line) current = id;
      }
      setActive(prev => (prev === current ? prev : current));
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (barRef.current) barRef.current.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // Keep the current section's link visible in the nav when the nav scrolls sideways.
  useEffect(() => {
    const nav = navRef.current;
    const link = nav?.querySelector('[aria-current]');
    if (nav && link) nav.scrollLeft = link.offsetLeft - (nav.clientWidth - link.clientWidth) / 2;
  }, [active]);

  // #public-sector/embedded-orders/<id> scrolls to that section or rule.
  const cancelAlign = useRef(() => {});
  useEffect(() => {
    cancelAlign.current();
    if (!screen) return undefined;
    const start = setTimeout(() => { cancelAlign.current = alignTo(screen); }, 60);
    return () => { clearTimeout(start); cancelAlign.current(); };
  }, [screen]);

  // Clicking the link for the section you are already on does not change the hash,
  // so it would do nothing. Scroll to it anyway.
  const onClick = e => {
    // The skip link is a plain #guide link, which the router would read as another page.
    if (e.target.closest?.('a.eog-skip')) {
      e.preventDefault();
      cancelAlign.current();
      cancelAlign.current = alignTo('guide');
      return;
    }
    const link = e.target.closest?.(`a[href^="${GUIDE_HASH}/"]`);
    if (link && link.getAttribute('href') === window.location.hash) {
      e.preventDefault();
      cancelAlign.current();
      cancelAlign.current = alignTo(link.getAttribute('href').split('/').pop());
    }
  };

  return (
    <div class="psh eog-page" onClick={onClick}>
      <a class="eog-skip" href="#guide">Skip to the guide</a>
      <Header trail={TRAIL} sticky theme="checkr" />
      <div class="eog-nav">
        <nav ref={navRef} aria-label="Guide sections">
          {NAV.map(([id, label]) => (
            <a key={id} href={`${GUIDE_HASH}/${id}`} aria-current={active === id ? 'location' : undefined}>{label}</a>
          ))}
        </nav>
        <button type="button" class="eog-print" onClick={() => window.print()}>Print or save as PDF</button>
        <div class="eog-progress" aria-hidden="true"><span ref={barRef} /></div>
      </div>
      <main id="guide" tabIndex={-1} class="eog" ref={rootRef} dangerouslySetInnerHTML={{ __html: html }} />
      <div class="eog-sr" role="status" aria-live="polite">{message}</div>
    </div>
  );
}
