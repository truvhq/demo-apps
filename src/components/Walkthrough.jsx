/**
 * FILE SUMMARY: Reusable guided-walkthrough shell (the narrated intro before a live demo)
 * DATA FLOW: Pure presentation. No backend calls, no Truv API, no session needed.
 * INTEGRATION PATTERN: Wraps any demo. Renders stages, then hands off via onLaunch().
 *
 * A walkthrough is a short, arrow-key navigable slide sequence that explains what a
 * demo is about before the viewer starts clicking. Two panes per stage: an
 * illustrative surface on the left, the narrative on the right.
 *
 * ORIGIN: this generalizes the `.wt` shell built in demo-apps-private
 * (`demo/public-sector-demo` -> Walkthrough.jsx, then `demo/batching` ->
 * Batching.jsx, which added the progress bar, the 100dvh footer anchor, and the
 * ambient layer). Those two copies each re-implemented the shell and re-scoped the
 * CSS to avoid colliding with each other. This is the shared version: styles live
 * in walkthrough.css under a `twt-` namespace, copy comes in as data, and the left
 * surfaces are injectable so no demo has to fork the shell again.
 *
 * USAGE:
 *   const STAGES = [
 *     { n: '01', name: 'Welcome', kind: 'hero', title: '...', lead: '...', bullets: [...] },
 *     { n: '02', name: 'The fork', kind: 'split', title: '...', lead: '...',
 *       api: 'POST /v1/orders/{id}/', chips: [['3', 'per 24h']],
 *       lanes: [{ tone: 'good', tag: '...', title: '...', body: '...', code: '...' }] },
 *   ];
 *   <Walkthrough
 *     stages={STAGES}
 *     brand={{ product: 'truv', partner: 'Public Sector', dept: 'Renewals' }}
 *     onLaunch={() => setScreen('setup')}
 *     returnKey="truv_wt_renewals"
 *   />
 *
 * STAGE FIELDS (all optional except kind/title):
 *   n, name          chrome labels ("Stage 02 / 06", "The fork")
 *   kind             selects the left surface from `surfaces`
 *   title, lead      narrative rail heading and lead paragraph
 *   bullets[]        narrative rail list
 *   chips[[b, s]]    stat tiles under the narrative
 *   api              code block under the narrative (string, pre-formatted)
 *   ...anything      passed through to the surface component as `stage`
 *
 * SURFACES: `surfaces` maps kind -> component receiving ({ stage, index, total }).
 * Built-in kinds: hero, card, split, diagram. Pass your own map to add or replace
 * any of them; unknown kinds render nothing rather than throwing.
 *
 * WHAT TO COPY (for your own integration): nothing here talks to Truv. Copy this
 * only if you want the presentation pattern.
 */

// --- Imports: Preact hooks ---
import { useState, useEffect, useCallback } from 'preact/hooks';

// --- Imports: Mermaid renderer for the built-in `diagram` surface ---
import { MermaidDiagram } from './MermaidDiagram.jsx';

// --- Styles: scoped under .twt (see walkthrough.css header for why not .wt) ---
import './walkthrough.css';

// --- Built-in surface: hero. Oversized statement, centered. ---
// `heroLead` is deliberately NOT defaulted to `stage.lead`: the rail already
// renders the lead, and echoing it here just prints the same paragraph twice.
function HeroSurface({ stage }) {
  return (
    <div class="twt-hero">
      {stage.mark && <div class="twt-hero-mark">{stage.mark}</div>}
      <h1>{stage.heroTitle || stage.title}</h1>
      {stage.heroLead && <p>{stage.heroLead}</p>}
    </div>
  );
}

// --- Built-in surface: card. A single framed panel, for problem statements. ---
function CardSurface({ stage }) {
  const card = stage.card || {};
  return (
    <div class="twt-card">
      {card.eyebrow && <div class="twt-card-eyebrow">{card.eyebrow}</div>}
      {card.title && <h3>{card.title}</h3>}
      {card.body && <p>{card.body}</p>}
      {Array.isArray(card.rows) && (
        <ul class="twt-ul" style="margin-top:16px">
          {card.rows.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}
    </div>
  );
}

// --- Built-in surface: split. Two outcome lanes side by side. ---
function SplitSurface({ stage }) {
  const lanes = stage.lanes || [];
  return (
    <div class="twt-split">
      {lanes.map((lane, i) => (
        <div key={i} class={`twt-lane ${lane.tone || ''}`}>
          {lane.tag && <div class="twt-lane-tag">{lane.tag}</div>}
          {lane.title && <h4>{lane.title}</h4>}
          {lane.body && <p>{lane.body}</p>}
          {lane.code && <code>{lane.code}</code>}
        </div>
      ))}
    </div>
  );
}

// --- Built-in surface: diagram. Renders a Mermaid definition in a framed panel. ---
function DiagramSurface({ stage }) {
  if (!stage.diagram) return null;
  return (
    <div class="twt-diagram">
      <MermaidDiagram definition={stage.diagram} id={stage.diagramId || `twt-${stage.n || stage.name || 'stage'}`} />
    </div>
  );
}

// Default surface registry. Callers extend or override by passing `surfaces`.
export const DEFAULT_SURFACES = {
  hero: HeroSurface,
  card: CardSurface,
  split: SplitSurface,
  diagram: DiagramSurface,
};

// --- Component: Walkthrough ---
export function Walkthrough({
  stages = [],
  brand = {},
  theme = null,
  surfaces = null,
  onLaunch = null,
  launchLabel = 'Launch the live demo',
  skipLabel = 'Skip to live demo',
  returnKey = null,
  ambient = true,
}) {
  const total = stages.length;

  // Resume support: when a walkthrough hands off to a live demo and the viewer
  // comes back, land on the stage they left from. The key is a prop rather than a
  // module constant so two walkthroughs in one build cannot clobber each other.
  const [i, setI] = useState(() => {
    if (!returnKey) return 0;
    try {
      const saved = sessionStorage.getItem(returnKey);
      if (saved != null) {
        sessionStorage.removeItem(returnKey);
        const n = parseInt(saved, 10);
        if (Number.isFinite(n) && n >= 0 && n < total) return n;
      }
    } catch { /* sessionStorage unavailable: start at the beginning */ }
    return 0;
  });

  const registry = surfaces ? { ...DEFAULT_SURFACES, ...surfaces } : DEFAULT_SURFACES;
  const stage = stages[i] || {};
  const isLast = i >= total - 1;

  // Hand off to the live demo, remembering where we were.
  const launch = useCallback(() => {
    if (returnKey) {
      try { sessionStorage.setItem(returnKey, String(i)); } catch { /* non-fatal */ }
    }
    if (onLaunch) onLaunch();
  }, [i, onLaunch, returnKey]);

  const go = useCallback((next) => {
    setI(prev => {
      const n = typeof next === 'function' ? next(prev) : next;
      return Math.max(0, Math.min(total - 1, n));
    });
  }, [total]);

  // Keyboard nav. Left/Right move stages; Enter on the last stage launches.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') { if (isLast) launch(); else go(p => p + 1); }
      else if (e.key === 'ArrowLeft') go(p => p - 1);
      else if (e.key === 'Enter' && isLast) launch();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isLast, go, launch]);

  if (!total) return null;

  const Surface = registry[stage.kind];

  return (
    <div class={`twt${theme ? ` twt-theme-${theme}` : ''}`}>

      {/* Top chrome: brand, stage label, skip-ahead */}
      <header class="twt-top">
        <div class="twt-brand">
          <span class="twt-product">{brand.product || 'truv'}</span>
          {brand.partner && <span class="twt-rule" />}
          {brand.partner && (
            <span class="twt-partner">
              {brand.partner}
              {brand.dept && <span class="twt-dept">{brand.dept}</span>}
            </span>
          )}
        </div>
        <div class="twt-step">
          <div class="twt-k">Stage {stage.n || String(i + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}</div>
          <div class="twt-nm">{stage.name || ''}</div>
        </div>
        {!isLast && onLaunch && (
          <button class="twt-cta" onClick={launch}>{skipLabel} {'→'}</button>
        )}
        <div class="twt-progress"><i style={{ width: `${((i + 1) / total) * 100}%` }} /></div>
      </header>

      {/* Body: illustrative surface + narrative rail. Both remount on stage change
          so their one-shot entrance animations replay. */}
      <div class="twt-body">
        <div class="twt-stage">
          {ambient && (
            <div class="twt-ambient" aria-hidden="true">
              <div class="twt-orb o1" /><div class="twt-orb o2" /><div class="twt-orb o3" />
              <div class="twt-grid" />
              <div class="twt-ring r1" /><div class="twt-ring r2" />
              <div class="twt-vignette" />
            </div>
          )}
          <div class="twt-stage-inner" key={`s-${i}`}>
            {Surface ? <Surface stage={stage} index={i} total={total} /> : null}
          </div>
        </div>

        <div class="twt-context" key={`c-${i}`}>
          <div class="twt-eyebrow">{stage.n || String(i + 1).padStart(2, '0')} {'·'} {stage.name || ''}</div>
          <h2 class="twt-title">{stage.title}</h2>
          {stage.lead && <p class="twt-lead" dangerouslySetInnerHTML={{ __html: stage.lead }} />}
          {Array.isArray(stage.bullets) && stage.bullets.length > 0 && (
            <ul class="twt-ul">{stage.bullets.map((b, bi) => <li key={bi} dangerouslySetInnerHTML={{ __html: b }} />)}</ul>
          )}
          {Array.isArray(stage.chips) && stage.chips.length > 0 && (
            <div class="twt-chips">
              {stage.chips.map(([b, s], ci) => (
                <div key={ci} class="twt-chip"><b>{b}</b><span>{s}</span></div>
              ))}
            </div>
          )}
          {stage.api && <div class="twt-api" dangerouslySetInnerHTML={{ __html: stage.api }} />}
        </div>
      </div>

      {/* Footer nav: dots + back/next, with the CTA replacing Next on the last stage */}
      <footer class="twt-nav">
        <div class="twt-dots">
          {stages.map((s, di) => (
            <button
              key={di}
              class={`twt-dot${di === i ? ' active' : ''}${di < i ? ' done' : ''}`}
              aria-label={`Go to stage ${s.n || di + 1}: ${s.name || ''}`}
              onClick={() => go(di)}
            />
          ))}
        </div>
        <div class="twt-navbtns">
          <button class="twt-btn ghost" disabled={i === 0} onClick={() => go(p => p - 1)}>{'←'} Back</button>
          {isLast
            ? <button class="twt-btn primary" onClick={launch}>{launchLabel} {'→'}</button>
            : <button class="twt-btn primary" onClick={() => go(p => p + 1)}>Next {'→'}</button>}
        </div>
      </footer>
    </div>
  );
}
