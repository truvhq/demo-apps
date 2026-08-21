import React, { useEffect, useState } from 'react';

import { GUIDE_FLOW_LABELS, GUIDE_STEPS } from '../devpanel/guideContent.js';
import { getBridgeEvents, subscribeBridgeEvents } from '../devpanel/bridgeEvents.js';
import { getGuideProgress, subscribeGuideProgress } from '../devpanel/guideStore.js';
import { Select } from './Select.jsx';

/** A row matches a filter context if any of that context's identifying
 * strings (loan number, loan UUID, application number, last known Truv
 * order ID) appear anywhere in the row's JSON — covers the common cases
 * without needing per-app knowledge of exactly which field they land in
 * (e.g. a loan's UUID is always echoed as `loan.external_id` on every order
 * request/response, and `last_truv_order_id` matches a webhook's
 * `truv_order_id` field directly). A loan that has moved on to a newer order
 * since an older one completed won't match that older order's traffic —
 * acceptable for a demo tool, not treated as exhaustive history. */
function matchesContext(item, context) {
  if (!context) return true;
  const haystack = JSON.stringify(item);
  return context.identifiers.some((id) => id && haystack.includes(id));
}

/** Right-side developer pane visualizing the real-time data flow between
 * this app, its backend, and Truv — four tabs, matching the reference demo
 * app's dev panel (`/Users/brian/demo-apps/src/components/Panel.jsx`):
 * Guide (live step-by-step walkthrough of whichever integration method is
 * currently running), API Calls (`ApiCallLog`), Bridge (TruvBridge SDK
 * callback events), and Webhooks (`WebhookEvent`) — click a row on the
 * latter two tabs to see the full payload.
 *
 * Shared by POS and LOS; each app just passes its own `api` client (must
 * expose `listApiLogs`/`listWebhookEvents`), plus `loadContexts` — an async
 * function returning the list of applications/loan files this app can
 * filter by, as `{ id, label, identifiers: string[] }`. Guide and Bridge
 * data comes from devpanel/guideStore.js and devpanel/bridgeEvents.js —
 * module-level stores fed by whichever screen is actually driving a
 * verification (Configure Truv console, the borrower's "Verify with Truv"
 * flow, BridgeEmbedScreen), independent of whether this panel happens to be
 * open at that moment. */
export function DevPanel({ api, loadContexts }) {
  const [tab, setTab] = useState('guide');
  const [logs, setLogs] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [contexts, setContexts] = useState([]);
  const [selectedContextId, setSelectedContextId] = useState('');
  const [guideProgress, setGuideProgressState] = useState(getGuideProgress());
  const [bridgeEvents, setBridgeEvents] = useState(getBridgeEvents());

  useEffect(() => {
    const load = () => {
      api.listApiLogs().then(setLogs).catch(() => {});
      api.listWebhookEvents().then(setWebhooks).catch(() => {});
    };
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [api]);

  useEffect(() => {
    loadContexts?.().then(setContexts).catch(() => {});
  }, [loadContexts]);

  useEffect(() => subscribeGuideProgress(setGuideProgressState), []);
  useEffect(() => subscribeBridgeEvents(setBridgeEvents), []);

  const selectedContext = contexts.find((c) => String(c.id) === selectedContextId) || null;
  const allItems = tab === 'calls' ? logs : tab === 'webhooks' ? webhooks : [];
  const items = allItems.filter((item) => matchesContext(item, selectedContext));

  return (
    <aside style={{
      width: 420, flexShrink: 0, borderLeft: '1px solid var(--truv-grey-30)',
      background: 'var(--truv-white)', display: 'flex', flexDirection: 'column',
      height: '100vh', position: 'sticky', top: 0,
    }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--truv-grey-30)' }}>
        <strong style={{ fontFamily: 'var(--truv-font-display)', fontSize: 16 }}>Dev Panel</strong>
        <p style={{ fontSize: 12, color: 'var(--truv-grey-50)', margin: '4px 0 0' }}>
          Live view of what this app is doing with Truv — click a row to see the full payload.
        </p>
      </div>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--truv-grey-30)' }}>
        <TabButton active={tab === 'guide'} onClick={() => setTab('guide')}>Guide</TabButton>
        <TabButton active={tab === 'calls'} onClick={() => { setTab('calls'); setExpandedId(null); }}>
          API Calls ({selectedContext ? `${logs.filter((i) => matchesContext(i, selectedContext)).length}/${logs.length}` : logs.length})
        </TabButton>
        <TabButton active={tab === 'bridge'} onClick={() => { setTab('bridge'); setExpandedId(null); }}>
          Bridge ({bridgeEvents.length})
        </TabButton>
        <TabButton active={tab === 'webhooks'} onClick={() => { setTab('webhooks'); setExpandedId(null); }}>
          Webhooks ({selectedContext ? `${webhooks.filter((i) => matchesContext(i, selectedContext)).length}/${webhooks.length}` : webhooks.length})
        </TabButton>
      </div>

      {/* Rendered below the tab row (not above it) so the tabs stay in a
          fixed position when switching between tabs that show this filter
          (API Calls, Webhooks) and ones that don't (Guide, Bridge). */}
      {(tab === 'calls' || tab === 'webhooks') && loadContexts && (
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--truv-grey-30)' }}>
          <Select
            label="Filter by application/loan"
            value={selectedContextId}
            onChange={(e) => setSelectedContextId(e.target.value)}
            placeholder="All applications/loans"
            options={contexts.map((c) => ({ value: String(c.id), label: c.label }))}
          />
        </div>
      )}

      {tab === 'guide' && <GuideTab progress={guideProgress} />}

      {tab === 'bridge' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {bridgeEvents.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--truv-grey-50)' }}>
              No Bridge events yet — they'll appear here as soon as a TruvBridge widget opens.
            </span>
          )}
          {bridgeEvents.map((event) => (
            <BridgeEventRow
              key={event.id}
              event={event}
              expanded={expandedId === event.id}
              onToggle={() => setExpandedId((id) => (id === event.id ? null : event.id))}
            />
          ))}
        </div>
      )}

      {(tab === 'calls' || tab === 'webhooks') && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--truv-grey-50)' }}>
              {selectedContext ? 'No activity matching this application/loan yet.' : 'No activity yet.'}
            </span>
          )}
          {items.map((item) => (
            <LogRow
              key={item.id}
              item={item}
              kind={tab}
              expanded={expandedId === item.id}
              onToggle={() => setExpandedId((id) => (id === item.id ? null : item.id))}
            />
          ))}
        </div>
      )}
    </aside>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, border: 'none', background: 'none', cursor: 'pointer', padding: '10px 6px', fontSize: 12,
        fontWeight: active ? 600 : 400, color: active ? 'var(--truv-accent)' : 'var(--truv-grey-60)',
        borderBottom: active ? '2px solid var(--truv-accent)' : '2px solid transparent', whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

/** Steps before the live progress marker render collapsed with a checkmark,
 * the current step renders expanded with its full guide content, and steps
 * after it render collapsed and greyed out — same visual language as the
 * reference demo app's GuideTab. */
function GuideTab({ progress }) {
  const steps = progress.flowKey ? GUIDE_STEPS[progress.flowKey] : null;

  if (!steps) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        <span style={{ fontSize: 12, color: 'var(--truv-grey-50)' }}>
          No verification flow running yet — pick an integration method on the Configure Truv console, or click
          "Verify with Truv" on an application, and the step-by-step guide for that method will appear here.
        </span>
      </div>
    );
  }

  const complete = progress.stepIndex >= steps.length;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--truv-grey-60)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {GUIDE_FLOW_LABELS[progress.flowKey]}
      </div>
      {steps.map((step, i) => {
        const done = complete || i < progress.stepIndex;
        const active = !complete && i === progress.stepIndex;
        if (!active) {
          return (
            <div key={step.title} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: done ? 1 : 0.5 }}>
              <span style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0, fontSize: 11, lineHeight: '18px', textAlign: 'center',
                background: done ? 'var(--truv-green)' : 'var(--truv-grey-30)', color: 'var(--truv-white)',
              }}>
                {done ? '✓' : i + 1}
              </span>
              <span style={{ fontSize: 13, fontWeight: done ? 500 : 400 }}>{step.title}</span>
            </div>
          );
        }
        return (
          <div key={step.title} style={{ border: '1px solid var(--truv-accent)', borderRadius: 8, padding: 12, background: 'var(--truv-accent-disabled)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0, fontSize: 11, lineHeight: '18px', textAlign: 'center',
                background: 'var(--truv-accent)', color: 'var(--truv-white)',
              }}>
                {i + 1}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{step.title}</span>
            </div>
            {/* Static, developer-authored guide copy from guideContent.js — not user input. */}
            <div className="truv-devpanel-guide-html" style={{ fontSize: 12, color: 'var(--truv-grey-60)' }} dangerouslySetInnerHTML={{ __html: step.html }} />
          </div>
        );
      })}
      <style>{`
        .truv-devpanel-guide-html p { margin: 0 0 8px; }
        .truv-devpanel-guide-html pre { background: var(--truv-primary-black); color: #c6f6d5; font-size: 11px; border-radius: 6px; padding: 8px; overflow-x: auto; white-space: pre-wrap; margin: 0 0 8px; }
        .truv-devpanel-guide-html code { font-family: monospace; }
      `}</style>
    </div>
  );
}

function BridgeEventRow({ event, expanded, onToggle }) {
  const hasDetail = event.data !== undefined && event.data !== null;
  return (
    <div style={{ border: '1px solid var(--truv-grey-30)', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
      <button
        onClick={onToggle}
        disabled={!hasDetail}
        style={{
          width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: hasDetail ? 'pointer' : 'default',
          padding: 10, display: 'flex', flexDirection: 'column', gap: 2,
        }}
      >
        <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600 }}>{event.label}</span>
        <span style={{ fontSize: 11, color: 'var(--truv-grey-50)' }}>{new Date(event.at).toLocaleString()}</span>
      </button>
      {expanded && hasDetail && (
        <div style={{ borderTop: '1px solid var(--truv-grey-30)', padding: 10, background: 'var(--truv-grey-20)' }}>
          <PayloadBlock label="Data" value={event.data} />
        </div>
      )}
    </div>
  );
}

function LogRow({ item, kind, expanded, onToggle }) {
  const isCall = kind === 'calls';
  const ok = isCall ? item.status_code < 400 : item.signature_valid;
  const title = isCall ? `${item.method} ${item.endpoint}` : item.event_type;
  const subtitle = isCall
    ? `${item.status_code} · ${item.duration_ms}ms`
    : (item.signature_valid ? 'Signature verified' : 'Signature INVALID');
  const timestamp = isCall ? item.created_at : item.received_at;

  return (
    <div style={{ border: '1px solid var(--truv-grey-30)', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer',
          padding: 10, display: 'flex', flexDirection: 'column', gap: 2,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600, wordBreak: 'break-all' }}>{title}</span>
          <span style={{ fontSize: 11, color: ok ? 'var(--truv-green)' : 'var(--truv-text-red)', flexShrink: 0 }}>{subtitle}</span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--truv-grey-50)' }}>{new Date(timestamp).toLocaleString()}</span>
      </button>
      {expanded && (
        <div style={{ borderTop: '1px solid var(--truv-grey-30)', padding: 10, background: 'var(--truv-grey-20)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {isCall ? (
            <>
              <PayloadBlock label="Request" value={item.request_body} />
              <PayloadBlock label="Response" value={item.response_body} />
            </>
          ) : (
            <PayloadBlock label="Payload" value={item.payload} />
          )}
        </div>
      )}
    </div>
  );
}

function PayloadBlock({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--truv-grey-60)', marginBottom: 4 }}>{label}</div>
      <pre style={{
        fontSize: 11, background: 'var(--truv-white)', border: '1px solid var(--truv-grey-30)', borderRadius: 6,
        padding: 8, overflowX: 'auto', maxHeight: 240, overflowY: 'auto', margin: 0,
      }}>
        {value ? JSON.stringify(value, null, 2) : '(empty)'}
      </pre>
    </div>
  );
}
