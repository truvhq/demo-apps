/**
 * FILE SUMMARY: Panel
 * DATA FLOW: usePanel() polls GET /api/logs + GET /api/webhooks every 3s -> Panel displays all data in tabs
 * INTEGRATION PATTERN: Shared sidebar used by all demos in both Orders and Bridge flows
 *
 * Sidebar panel with four tabs that visualize the real-time data flow between frontend,
 * backend, and Truv API. Guide tab shows step progress. API tab shows proxied Truv API
 * calls with request/response bodies. Bridge tab shows TruvBridge SDK events. Webhooks
 * tab shows received webhook events with payload inspection.
 */

// Preact state hook
import { useState } from 'preact/hooks';

// TabButton: individual tab selector in the panel header.
// Shows label text and optional count badge for items in that tab.
function TabButton({ active, label, count, onClick }) {
  return (
    <button
      onClick={onClick}
      class={`px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all ${
        active ? 'text-primary bg-[#f5f5f7]' : 'text-[#8E8E93] hover:text-[#171717] hover:bg-[#f5f5f7]'
      }`}
    >
      {label}{count > 0 ? ` (${count})` : ''}
    </button>
  );
}

// GuideTab: step-by-step progress indicator. Shows the current step expanded
// with developer-authored guide content (HTML), completed steps with checkmarks,
// and future steps grayed out.
function GuideTab({ steps, currentStep }) {
  return (
    <div>
      {steps.map((step, i) => {
        const isDone = i < currentStep;
        const isActive = i === currentStep;

        // Active step: expanded card with title and guide HTML content
        if (isActive) {
          return (
            <div key={i} class="mb-3 p-4 bg-gray-100 rounded-lg">
              <div class="text-sm font-semibold text-primary mb-2">{i + 1}. {step.title}</div>
              {step.guide && (
                // Developer-authored static guide content. Already sanitized at build time.
                <div
                  class="text-xs text-gray-500 leading-relaxed [&_p]:my-2 [&_pre]:bg-[#1a1a2e] [&_pre]:text-[#e2e8f0] [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:text-[11px] [&_pre]:font-mono [&_pre]:overflow-x-auto [&_pre]:whitespace-pre [&_pre]:my-2 [&_pre]:leading-relaxed [&_code]:bg-black/5 [&_code]:px-1 [&_code]:rounded [&_code]:text-[11px] [&_code]:font-mono [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:my-2 [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:pl-5 [&_li]:my-1 [&_h5]:text-[11px] [&_h5]:font-bold [&_h5]:uppercase [&_h5]:tracking-wide [&_h5]:text-gray-900 [&_h5]:mt-3 [&_h5]:mb-1 [&_a]:text-primary [&_a]:font-medium"
                  dangerouslySetInnerHTML={{ __html: step.guide }}
                />
              )}
            </div>
          );
        }

        // Completed or future step: single-line with checkmark or step number
        return (
          <div key={i} class={`px-4 py-2.5 text-sm border-b border-border-light ${isDone ? 'text-success' : 'text-gray-400'}`}>
            {isDone ? '✓ ' : `${i + 1}. `}{step.title}
          </div>
        );
      })}
    </div>
  );
}

// LogEntry: expandable row showing a single proxied Truv API call.
// Displays HTTP method badge, endpoint path, and status code.
// Expands to show request and response JSON bodies.
function LogEntry({ method, endpoint, status, requestBody, responseBody }) {
  const [open, setOpen] = useState(false);
  const badgeClass = method === 'POST' ? 'bg-success-bg text-success' : 'bg-primary-light text-primary';

  return (
    <div class="mb-2 border border-border-light rounded-lg overflow-hidden">
      {/* Collapsed header: method badge, endpoint, status */}
      <div class="flex items-center gap-2 px-3 py-2.5 cursor-pointer text-xs hover:bg-gray-50" onClick={() => setOpen(!open)}>
        <span class={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${badgeClass}`}>{method}</span>
        <span class="font-medium text-gray-900 flex-1 font-mono">{endpoint}</span>
        <span class="text-[11px] text-gray-400">{status}</span>
      </div>
      {/* Expanded detail: formatted request and response bodies */}
      {open && (
        <div class="border-t border-border-light p-3 bg-gray-50">
          {requestBody && (
            <>
              <h5 class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Request</h5>
              <pre class="text-[11px] leading-relaxed whitespace-pre-wrap break-all text-gray-500 font-mono bg-gray-100 p-2.5 rounded-md max-h-[12.5rem] overflow-y-auto">{tryFormat(requestBody)}</pre>
            </>
          )}
          {responseBody && (
            <>
              <h5 class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1 mt-3">Response</h5>
              <pre class="text-[11px] leading-relaxed whitespace-pre-wrap break-all text-gray-500 font-mono bg-gray-100 p-2.5 rounded-md max-h-[12.5rem] overflow-y-auto">{tryFormat(responseBody)}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ApiTab: lists all logged Truv API calls from usePanel() polling.
// Each call is rendered as an expandable LogEntry.
function ApiTab({ logs }) {
  if (!logs.length) return <div class="flex items-center justify-center h-32 text-gray-400 text-sm">No API calls yet.</div>;
  return <div>{logs.map((log, i) => <LogEntry key={i} method={(log.method || 'GET').toUpperCase()} endpoint={log.endpoint || log.url} status={log.status ? String(log.status) : ''} requestBody={log.request_body} responseBody={log.response_body} />)}</div>;
}

// BridgeEvent: expandable row for a single TruvBridge SDK event.
// Shows event type and timestamp. Expands to show payload data if present.
function BridgeEvent({ evt }) {
  const [open, setOpen] = useState(false);
  const hasData = evt.data != null;
  return (
    <div class="mb-2 border border-border-light rounded-lg overflow-hidden">
      {/* Event header: type name and timestamp */}
      <div class={`flex items-center gap-2 px-3 py-2.5 text-xs ${hasData ? 'cursor-pointer hover:bg-gray-50' : ''}`} onClick={() => hasData && setOpen(!open)}>
        <span class="font-medium text-gray-900">{evt.type}</span>
        <span class="text-[11px] text-gray-400">{evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}</span>
      </div>
      {/* Expanded payload data with label/value pairs */}
      {open && hasData && (
        <div class="border-t border-border-light p-3 bg-gray-50">
          {evt.data.map(({ label, value }) => (
            <pre class="text-[11px] leading-relaxed whitespace-pre-wrap break-all font-mono"><span class="text-gray-400">{label} = </span><span class="text-gray-500">{tryFormat(value)}</span></pre>
          ))}
        </div>
      )}
    </div>
  );
}

// BridgeTab: lists all TruvBridge SDK events in reverse chronological order.
// Events are logged by BridgeScreen's onLoad/onEvent/onSuccess/onClose callbacks.
function BridgeTab({ events }) {
  if (!events.length) return <div class="flex items-center justify-center h-32 text-gray-400 text-sm">No Bridge events yet.</div>;
  return <div>{[...events].reverse().map((evt, i) => <BridgeEvent key={i} evt={evt} />)}</div>;
}

// WebhookEntry: expandable row for a single webhook event.
// Shows event type, color-coded status badge, and timestamp.
// Expands to show the full webhook payload JSON.
function WebhookEntry({ wh }) {
  const [open, setOpen] = useState(false);
  // Status color coding: green for completed/done, yellow for pending, red for failed, blue otherwise
  const statusColor = wh.status === 'completed' || wh.status === 'done' ? 'text-success bg-success-bg'
    : wh.status === 'pending' ? 'text-warning bg-warning-bg'
    : wh.status === 'failed' ? 'text-error bg-red-50'
    : 'text-blue-500 bg-blue-50';
  const payload = wh.payload || wh;

  return (
    <div class="mb-2 border border-border-light rounded-lg overflow-hidden">
      {/* Webhook header: event type, status badge, timestamp */}
      <div class="flex items-center gap-2 px-3 py-2.5 text-xs cursor-pointer hover:bg-gray-50" onClick={() => setOpen(!open)}>
        <span class="font-medium text-gray-900 flex-1">{wh.event_type || ''}</span>
        {wh.status && <span class={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${statusColor}`}>{wh.status}</span>}
        <span class="text-[11px] text-gray-400">{wh.created_at || wh.timestamp ? new Date(wh.created_at || wh.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}</span>
      </div>
      {/* Expanded: full formatted webhook payload */}
      {open && (
        <div class="border-t border-border-light p-3 bg-gray-50">
          <pre class="text-[11px] leading-relaxed whitespace-pre-wrap break-all text-gray-500 font-mono">{tryFormat(payload)}</pre>
        </div>
      )}
    </div>
  );
}

// WebhooksTab: webhooks tab content. Shows tunnel URL if available,
// link to Truv dashboard webhook config, and list of received webhooks.
function WebhooksTab({ webhooks, tunnelUrl }) {
  return (
    <div>
      {/* Tunnel URL display for local development webhook forwarding */}
      {tunnelUrl && (
        <div class="bg-gray-50 rounded-lg px-3 py-2.5 mb-3 text-xs text-gray-500">
          <span class="font-medium text-gray-400">Tunnel: </span>
          <a href={tunnelUrl} target="_blank" rel="noopener noreferrer" class="text-primary break-all hover:underline">{tunnelUrl}</a>
        </div>
      )}
      {/* Link to Truv dashboard for webhook configuration */}
      <div class="mb-3 text-xs">
        <a href="https://dashboard.truv.com/app/development/webhooks" target="_blank" rel="noopener noreferrer" class="text-primary font-medium">See webhook config</a>
      </div>
      {/* Webhook event list in reverse chronological order */}
      {!webhooks.length ? (
        <div class="flex items-center justify-center h-32 text-gray-400 text-sm">No webhooks received yet.</div>
      ) : (
        [...webhooks].reverse().map((wh, i) => <WebhookEntry key={i} wh={wh} />)
      )}
    </div>
  );
}

// tryFormat: utility to pretty-print JSON strings or objects for display in expandable sections
function tryFormat(s) {
  if (!s) return '';
  const str = typeof s === 'string' ? s : JSON.stringify(s);
  try { return JSON.stringify(JSON.parse(str), null, 2); } catch { return str; }
}

// Panel: main exported sidebar component. Consumes all polled data from usePanel()
// and renders it across four tabs. The panel prop contains currentStep, apiLogs,
// bridgeEvents, webhooks, and tunnelUrl.
export function Panel({ steps, panel }) {
  // Active tab state: defaults to Guide tab
  const [activeTab, setActiveTab] = useState('guide');
  // Destructure polled data from usePanel() with safe defaults
  const { currentStep = 0, apiLogs = [], bridgeEvents = [], webhooks = [], tunnelUrl = null } = panel || {};

  // Tab definitions with counts for API, Bridge, and Webhooks tabs
  const tabs = [
    { id: 'guide', label: 'Guide' },
    { id: 'api', label: 'API', count: apiLogs.length },
    { id: 'bridge', label: 'Bridge', count: bridgeEvents.length },
    { id: 'webhooks', label: 'Webhooks', count: webhooks.length },
  ];

  // Render: sidebar with tab header and scrollable content area
  return (
    <aside class="w-1/3 min-w-0 border-l border-border bg-white flex flex-col overflow-hidden">
      {/* Tab navigation bar */}
      <div class="flex gap-0.5 px-5 py-4 border-b border-border">
        {tabs.map(t => (
          <TabButton key={t.id} active={activeTab === t.id} label={t.label} count={t.count} onClick={() => setActiveTab(t.id)} />
        ))}
      </div>
      {/* Tab content area: renders the active tab's component */}
      <div class="flex-1 overflow-y-auto px-5 py-4">
        {activeTab === 'guide' && <GuideTab steps={steps || []} currentStep={currentStep} />}
        {activeTab === 'api' && <ApiTab logs={apiLogs} />}
        {activeTab === 'bridge' && <BridgeTab events={bridgeEvents} />}
        {activeTab === 'webhooks' && <WebhooksTab webhooks={webhooks} tunnelUrl={tunnelUrl} />}
      </div>
    </aside>
  );
}
