/**
 * FILE SUMMARY: Animated dot-field background for the sign-in proof panel.
 *
 * Starts as an Off Black field of white dots. A diagonal wave sweeps across and
 * turns each cell white with a dark dot. After that it idles: dots breathe and
 * the odd Checkr Aqua dot fades in and out at random. Canvas-based, sized to its
 * parent, paused when the tab is hidden. With prefers-reduced-motion it draws
 * the settled white state once and never animates.
 * Colors are Checkr Brand Guidelines 1.0: Off Black #1B1C1F, white, Gray 4
 * #7A828C, Checkr Aqua #23DEFF.
 */
import { useEffect, useRef } from 'preact/hooks';

const SPACING = 22;          // px between dot centres
const SWEEP_MS = 2400;       // black -> white transition
const AQUA_EVERY_MS = 260;   // how often a new aqua dot may appear
const AQUA_LIFE_MS = 2600;

const OFF_BLACK = [27, 28, 31];
const WHITE = [255, 255, 255];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function DotField({ class: cls = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, cols = 0, rows = 0, phases = [], raf = 0;
    const aqua = new Map();       // cell index -> birth time
    let lastAqua = 0;
    const start = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.parentElement.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / SPACING) + 1; rows = Math.ceil(h / SPACING) + 1;
      phases = Array.from({ length: cols * rows }, () => Math.random() * Math.PI * 2);
    };

    const draw = (now) => {
      const t = reduce ? 1e9 : now - start;
      const p = Math.min(1, t / SWEEP_MS);
      const settled = p >= 1;
      const secs = t / 1000;

      if (settled) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }

      // Spawn / retire aqua dots once the field has turned white.
      if (settled && !reduce && now - lastAqua > AQUA_EVERY_MS) {
        lastAqua = now;
        if (Math.random() < 0.6) aqua.set(Math.floor(Math.random() * cols * rows), now);
      }
      for (const [k, born] of aqua) if (now - born > AQUA_LIFE_MS) aqua.delete(k);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * SPACING, y = r * SPACING;
          // Local progress of the diagonal wave at this cell (0 dark .. 1 light).
          const d = (x / w) * 0.6 + (y / h) * 0.4;
          const local = settled ? 1 : ease(Math.max(0, Math.min(1, (p * 1.4 - d) / 0.4)));
          if (!settled) {
            ctx.fillStyle = rgb(mix(OFF_BLACK, WHITE, local));
            ctx.fillRect(x - SPACING / 2, y - SPACING / 2, SPACING, SPACING);
          }
          const i = r * cols + c;
          const breathe = reduce ? 0 : 0.35 * Math.sin(secs * 1.4 + phases[i]);
          const born = aqua.get(i);
          if (born !== undefined) {
            const life = (now - born) / AQUA_LIFE_MS;
            const a = Math.sin(Math.PI * life);
            ctx.fillStyle = `rgba(35,222,255,${a})`;
            ctx.beginPath(); ctx.arc(x, y, 2.6 + a * 1.4, 0, Math.PI * 2); ctx.fill();
            continue;
          }
          // White dots on black, turning into soft gray dots on white.
          const dot = local < 0.5 ? WHITE : [122, 130, 140];
          const alpha = local < 0.5 ? 0.55 * (1 - local * 2) + 0.05 : 0.22 + 0.2 * (local - 0.5);
          ctx.fillStyle = rgb(dot, alpha);
          ctx.beginPath(); ctx.arc(x, y, 1.3 + breathe, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };

    resize();
    const ro = new ResizeObserver(() => { resize(); if (reduce) draw(performance.now()); });
    ro.observe(canvas.parentElement);
    const onVis = () => {
      if (reduce) return;
      if (document.hidden) cancelAnimationFrame(raf); else raf = requestAnimationFrame(draw);
    };
    document.addEventListener('visibilitychange', onVis);
    if (reduce) draw(performance.now()); else raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  return <canvas ref={ref} class={cls} aria-hidden="true" />;
}
