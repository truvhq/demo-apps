/**
 * FILE SUMMARY: Event timeline for a captured refresh run.
 * DATA FLOW: Presentational. Takes already-captured events; makes no calls.
 *
 * Why this exists rather than a flowchart: the interesting property of a partial
 * refresh is its SHAPE IN TIME. Failures land in 3-5 seconds and the one success
 * lands at 20, so a diagram of boxes hides the only thing worth knowing — that by
 * the time the "completed" event arrives, two connections have been dead for
 * fifteen seconds. Lanes on a shared time axis make that visible in one look.
 *
 * Props:
 *   lanes   [{ key, label, kind, credential, verdict }]
 *   events  [{ t, lane, event, status, tone, note, key, trap }]
 *   span    seconds on the axis
 *   highlight  optional lane key to emphasise
 *   visible    optional Set of event names to show (drives the listener toggle)
 */

// Styles scoped under .rt / .rt-log — see refresh-timeline.css header.
import './refresh-timeline.css';

const TONE_DOT = {
  good: 'bg-green-500 border-green-600',
  bad: 'bg-red-500 border-red-600',
  neutral: 'bg-gray-300 border-gray-400',
};
const TONE_TEXT = {
  good: 'text-green-800',
  bad: 'text-[#b42318]',
  neutral: 'text-gray-500',
};

export function RefreshTimeline({ lanes = [], events = [], span = 22, visible = null, hideVerdicts = false }) {
  const ticks = [];
  for (let s = 0; s <= span; s += 5) ticks.push(s);
  const pct = t => `${Math.min(100, (t / span) * 100)}%`;
  const shown = e => !visible || visible.has(e.event);

  return (
    <div class="rt">
      {/* time axis */}
      <div class="rt-axis">
        <div class="rt-axis-label" />
        <div class="rt-axis-track">
          {ticks.map(s => (
            <div key={s} class="rt-tick" style={{ left: pct(s) }}>
              <span>{s}s</span>
            </div>
          ))}
        </div>
        {/* Must mirror the lane rows' verdict column exactly. Without it the axis
            track is wider than the tracks the dots are plotted in, and every
            event reads early against the ticks. */}
        <div class="rt-verdict" aria-hidden="true" />
      </div>

      {lanes.map(lane => {
        const mine = events.filter(e => e.lane === lane.key);
        return (
          <div key={lane.key} class={`rt-lane${lane.kind === 'order' ? ' rt-lane-order' : ''}`}>
            <div class="rt-axis-label">
              <div class="rt-lane-name">{lane.label}</div>
              {lane.credential && <div class="rt-lane-cred">{lane.credential}</div>}
            </div>
            <div class="rt-axis-track">
              <div class="rt-rule" />
              {mine.map((e, i) => {
                const on = shown(e);
                return (
                  <div key={i} class={`rt-dot-wrap${on ? '' : ' rt-off'}`} style={{ left: pct(e.t) }}
                    title={`+${e.t}s  ${e.event}${e.status ? ': ' + e.status : ''}`}>
                    <span class={`rt-dot ${TONE_DOT[e.tone] || TONE_DOT.neutral}${e.key ? ' rt-dot-key' : ''}`} />
                    {e.key && on && (
                      // Absolutely positioned so it never displaces the dot; flipped
                      // to the left in the right-hand third so it cannot run into
                      // the verdict column.
                      <span class={`rt-dot-label ${e.t / span > 0.62 ? 'rt-dot-label-left' : 'rt-dot-label-right'} ${TONE_TEXT[e.tone] || ''}`}>
                        {e.status || e.event}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            {/* The verdict is knowledge, not decoration: under a subscription model
                that cannot see the failure, showing it would hand the reader the
                answer the timeline is meant to withhold. The column is always
                rendered, even when empty, so every track shares one width and the
                ticks describe all of them. */}
            {lane.kind !== 'conn'
              ? <div class="rt-verdict" aria-hidden="true" />
              : hideVerdicts && lane.verdict !== 'refreshed'
                ? <div class="rt-verdict rt-verdict-unknown">still sent, nothing says it failed</div>
                : <div class={`rt-verdict ${lane.verdict === 'refreshed' ? 'rt-verdict-good' : 'rt-verdict-warn'}`}>{lane.verdict}</div>}
          </div>
        );
      })}
    </div>
  );
}

// The event log underneath, so the timeline is auditable rather than decorative.
export function RefreshEventLog({ events = [], lanes = [], visible = null }) {
  const laneLabel = k => (lanes.find(l => l.key === k)?.label || k);
  return (
    <div class="rt-log">
      {events.map((e, i) => {
        const dimmed = visible && !visible.has(e.event);
        return (
          <div key={i} class={`rt-log-row${dimmed ? ' rt-off' : ''}`}>
            <span class="rt-log-t">+{e.t}s</span>
            <span class="rt-log-ev">{e.event}</span>
            <span class={`rt-log-st ${TONE_TEXT[e.tone] || ''}`}>{e.status || '-'}</span>
            <span class="rt-log-lane">{laneLabel(e.lane)}</span>
            {e.note && <span class="rt-log-note">{e.note}</span>}
          </div>
        );
      })}
    </div>
  );
}
