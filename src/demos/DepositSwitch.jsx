// DepositSwitch.jsx — Retail Banking demo: Direct Deposit Switch
// Follows the same Bridge (User+Token) flow as SmartRouting.jsx (the canonical example).
// Uses product_type: 'deposit_switch'. Report rendered with DDSReport component.
import { useState, useEffect, useRef } from 'preact/hooks';
import { Layout, WaitingScreen, parsePayload, usePanel, API_BASE, IntroSlide } from '../components/index.js';
import { ApplicationForm } from '../components/ApplicationForm.jsx';
import { DDSReport } from '../components/reports/DDSReport.jsx';

const STEPS = [
  { title: 'Customer provides information', guide: '<p>The form collects applicant details. Employers are searched via:</p><pre>GET /v1/company-mappings-search/?query=...</pre><p>Then a user and bridge token are created:</p><pre>POST /v1/users/\nPOST /v1/users/{id}/tokens/</pre><p>Token uses <code>product_type: deposit_switch</code> with target account details.</p>' },
  { title: 'Customer connects payroll', guide: '<p>Bridge opens as a popup. The user selects their employer and confirms the deposit switch.</p><p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p>' },
  { title: 'Truv switches deposit', guide: '<p>Truv sends webhooks as the verification progresses. Wait for <code>task-status-updated</code> with status <code>done</code>.</p>' },
  { title: 'Bank confirms enrollment', guide: '<p>The report is fetched via the user reports endpoint:</p><pre>GET /v1/users/{user_id}/deposit_switch/reports/</pre><p>Confirms the direct deposit was switched.</p>' },
];

const DIAGRAM = `sequenceDiagram
  participant FE as Your Frontend
  participant BE as Your Backend
  participant Truv as Truv API
  FE->>BE: Customer submits information
  BE->>Truv: POST /v1/users/
  Truv-->>BE: user_id
  BE->>Truv: POST /v1/users/{user_id}/tokens/
  Note right of Truv: { product_type: deposit_switch, account details }
  Truv-->>BE: bridge_token
  BE-->>FE: bridge_token
  FE->>Truv: TruvBridge.init({ bridgeToken })
  Note over FE: Customer connects payroll
  BE->>Truv: POST /v1/link-access-tokens/
  Truv-->>BE: access_token
  Truv->>BE: Webhook: task-status-updated (done)
  BE->>Truv: GET /v1/users/{user_id}/deposit_switch/report/
  Truv-->>BE: Deposit switch confirmed`;

export function DepositSwitchDemo() {
  const [screen, setScreen] = useState('select');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(null);
  const [userId, setUserId] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  const { panel, sessionId, setCurrentStep, startPolling, addBridgeEvent, reset } = usePanel();

  async function handleFormSubmit(data) {
    setFormData(data);
    setLoading(true);
    setCurrentStep(1);
    try {
      const resp = await fetch(`${API_BASE}/api/bridge-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_type: 'deposit_switch', company_mapping_id: data.company_mapping_id }),
      });
      const result = await resp.json();
      if (!resp.ok) { alert('Error: ' + (result.error || 'Unknown')); setLoading(false); return; }
      setUserId(result.user_id);
      startPolling(result.user_id);

      if (window.TruvBridge) {
        const opts = {
          bridgeToken: result.bridge_token,
          onLoad: () => addBridgeEvent('onLoad()', null),
          onSuccess: (publicToken, meta) => {
            addBridgeEvent('onSuccess(publicToken, meta)', [
              { label: 'publicToken', value: publicToken },
              { label: 'meta', value: meta },
            ]);
            setCurrentStep(2);
            setScreen('waiting');
          },
          onEvent: (type, payload) => {
            const payloadStr = payload ? 'payload' : 'undefined';
            addBridgeEvent(`onEvent("${type}", ${payloadStr})`, payload ? [{ label: 'payload', value: payload }] : null);
          },
          onClose: () => addBridgeEvent('onClose()', null),
        };
        window.TruvBridge.init(opts).open();
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  // Wait for webhook "done", then fetch report. fetchedRef prevents double-fetching on rapid poll updates.
  useEffect(() => {
    if (screen !== 'waiting' || !userId || fetchedRef.current) return;
    const done = panel.webhooks.some(w => {
      const p = parsePayload(w.payload);
      return (p.event_type === 'task-status-updated' && p.status === 'done')
        || (w.event_type === 'task-status-updated' && w.status === 'done');
    });
    if (done) {
      setCurrentStep(3);
      setScreen('review');
      (async () => {
        try {
          const resp = await fetch(`${API_BASE}/api/users/${encodeURIComponent(userId)}/reports/deposit_switch`);
          if (resp.ok) { fetchedRef.current = true; setReportData(await resp.json()); }
        } catch (e) { console.error(e); }
      })();
    }
  }, [panel.webhooks, screen, userId]);

  function resetDemo() {
    reset();
    fetchedRef.current = false;
    setScreen('select');
    setShowForm(false);
    setFormData(null);
    setUserId(null);
    setReportData(null);
  }

  const isIntro = screen === 'select' && !showForm;

  return (
    <Layout badge="Retail Banking . Deposit Switch" steps={STEPS} panel={panel} hidePanel={isIntro}>
      <div class={isIntro ? 'flex-1 flex flex-col' : 'max-w-lg mx-auto px-8 py-10'}>
        {screen === 'select' && !showForm && (
          <IntroSlide
            label="Retail Banking . Deposit Switch"
            title="Switch direct deposit to your bank"
            subtitle="A new customer connects their payroll provider and switches their direct deposit routing to your bank. The change takes effect on their next paycheck."
            diagram={DIAGRAM}
            actions={<button onClick={() => setShowForm(true)} class="w-full py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover text-center">Get started</button>}
          />
        )}

        {screen === 'select' && showForm && (
          <ApplicationForm sessionId={sessionId} onSubmit={handleFormSubmit} submitting={loading} productType="deposit_switch" />
        )}

        {screen === 'waiting' && <WaitingScreen webhooks={panel.webhooks} />}

        {screen === 'review' && (
          <div>
            <h2 class="text-2xl font-bold tracking-tight mb-1.5">Verification Report</h2>
            <p class="text-sm text-gray-500 mb-7">Direct deposit switch</p>
            {reportData ? (
              <div>
                <DDSReport report={reportData} />
                <div class="flex gap-3 mt-6 pt-5 border-t border-gray-200">
                  <button class="px-5 py-2.5 text-sm font-semibold border border-[#e8e8ed] rounded-full hover:border-primary hover:text-primary" onClick={resetDemo}>Start Over</button>
                </div>
              </div>
            ) : (
              <div class="text-center py-10"><div class="w-10 h-10 border-[3px] border-gray-200 border-t-primary rounded-full animate-spin mx-auto" /></div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
