/**
 * FILE SUMMARY: The "nine rules" video, woven into the guide two ways.
 *
 *   RulesReel - one player at the top of "The rules" with a chip per chapter and
 *               the video's on-screen text written out underneath.
 *   RuleClip  - a "See it in motion" toggle on each rule card that plays just that
 *               rule's six seconds, right where the rule is explained.
 *
 * Both play the same file. Nothing loads until the reader asks for it, only one
 * video plays at a time, and nothing starts by itself for a reader who has asked
 * their system for less motion.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { CHAPTERS, INTRO, OUTRO, RULES, VIDEO_SRC, POSTER_SRC, chapterAt, chapterForRule, fmt } from './chapters.js';

let playing = null;
const claim = v => { if (playing && playing !== v) playing.pause(); playing = v; };
const prefersLessMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function PlayIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>;
}

function CloseIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none" /></svg>;
}

// Seek a video that may not have loaded yet, then play it.
function seekAndPlay(v, t) {
  const go = () => { v.currentTime = t; claim(v); v.play().catch(() => {}); };
  if (v.readyState >= 1) go();
  else { v.addEventListener('loadedmetadata', go, { once: true }); v.load(); }
}

export function RulesReel() {
  const ref = useRef(null);
  const [active, setActive] = useState(CHAPTERS[0].id);

  useEffect(() => {
    const v = ref.current;
    if (!v) return undefined;
    const onTime = () => setActive(chapterAt(v.currentTime).id);
    const onPlay = () => claim(v);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('play', onPlay);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('play', onPlay);
      if (playing === v) playing = null;
    };
  }, []);

  return (
    <figure class="eog-reel" id="watch">
      <div class="eog-reel-head">
        <span class="eog-kicker">In motion · about a minute</span>
        <h3>The nine rules, each shown wrong, then right</h3>
      </div>
      <video
        ref={ref}
        class="eog-video"
        controls
        playsInline
        preload="none"
        poster={POSTER_SRC}
        aria-label="The nine rules for embedding a Truv order, each shown wrong, then right. The text of every scene is written out below the video."
      >
        <source src={VIDEO_SRC} type="video/mp4" />
        Your browser cannot play this video. <a href={VIDEO_SRC}>Open the video file</a>.
      </video>
      <ol class="eog-chapters" aria-label="Jump to a rule in the video">
        {CHAPTERS.map(c => (
          <li key={c.id}>
            <button
              type="button"
              class="eog-chapter"
              aria-current={active === c.id ? 'true' : undefined}
              onClick={() => seekAndPlay(ref.current, c.start)}
            >
              <span class="eog-chapter-n">{c.n ? `Rule ${c.n}` : c.id === 'intro' ? 'Intro' : 'End'}</span>
              <span class="eog-chapter-label">{c.label}</span>
              <span class="eog-chapter-time">{fmt(c.start)}</span>
            </button>
          </li>
        ))}
      </ol>
      <details class="eog-transcript">
        <summary>Read what the video says</summary>
        <p><b>{INTRO.eyebrow}.</b> {INTRO.title}. {INTRO.line} <i>{INTRO.badge}.</i></p>
        <div class="tbl-scroll">
          <table>
            <thead><tr><th>Rule</th><th>Don't</th><th>Do</th></tr></thead>
            <tbody>
              {RULES.map(r => (
                <tr key={r.n}>
                  <td><b>{r.n}. {r.title}</b>{r.badge && <span class="note">{r.badge}</span>}</td>
                  <td>{r.dont}{r.dontNote && <span class="note">Label on screen: {r.dontNote}</span>}</td>
                  <td>{r.doText}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p><b>{OUTRO.title}.</b> {OUTRO.line} <i>{OUTRO.badges.join(' / ')}.</i></p>
      </details>
    </figure>
  );
}

export function RuleClip({ n }) {
  const chapter = chapterForRule(n);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const loop = useRef(!prefersLessMotion());

  useEffect(() => {
    const v = ref.current;
    if (!open || !v || !chapter) return undefined;
    const onMeta = () => { v.currentTime = chapter.start; };
    const onTime = () => {
      if (v.currentTime >= chapter.end - 0.05) {
        v.currentTime = chapter.start;
        if (!loop.current) v.pause();
      }
    };
    const onPlay = () => claim(v);
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('play', onPlay);
    if (v.readyState >= 1) onMeta();
    if (!prefersLessMotion()) { claim(v); v.play().catch(() => {}); }
    return () => {
      v.pause();
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('play', onPlay);
      if (playing === v) playing = null;
    };
  }, [open, chapter]);

  if (!chapter) return null;
  const bodyId = `eog-clip-${n}`;
  return (
    <div class="eog-clip">
      <button
        type="button"
        class="eog-clip-btn"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen(o => !o)}
      >
        {open ? <CloseIcon /> : <PlayIcon />}
        <span>{open ? 'Hide the motion' : `See rule ${n} in motion`}</span>
        {!open && <span class="eog-clip-time">{Math.round(chapter.end - chapter.start)} sec</span>}
      </button>
      {open && (
        <div class="eog-clip-body" id={bodyId}>
          <video
            ref={ref}
            class="eog-video"
            muted
            controls
            playsInline
            preload="metadata"
            src={`${VIDEO_SRC}#t=${chapter.start},${chapter.end}`}
            aria-label={`Rule ${n}, ${chapter.label}, shown wrong and then right. The same content is written out in the rule below.`}
          />
        </div>
      )}
    </div>
  );
}
