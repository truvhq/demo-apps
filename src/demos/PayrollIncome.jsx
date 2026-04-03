// PayrollIncome.jsx — Consumer Credit demo: Payroll Income Verification
// Follows the same Bridge (User+Token) flow as SmartRouting.jsx (the canonical example).
// Uses data_sources: ['payroll'] and GET /v1/company-mappings-search/ for employer search.
import { useState, useEffect, useRef } from 'preact/hooks';
import { Layout, WaitingScreen, parsePayload, usePanel, API_BASE, IntroSlide } from '../components/index.js';
import { VoieReport } from '../components/reports/VoieReport.jsx';
import { ApplicationForm } from '../components/ApplicationForm.jsx';

const STEPS = [
  { title: 'Applicant submits information', guide: '<p>The form collects applicant details. Employers are searched via:</p><pre>GET /v1/company-mappings-search/?query=...</pre><p>This returns a <code>company_mapping_id</code> (not <code>provider_id</code> — that\'s for banks). Pass <code>company_mapping_id</code> when creating the bridge token to deeplink Bridge to that employer.</p><p>Then a user and bridge token are created:</p><pre>POST /v1/users/\nPOST /v1/users/{id}/tokens/</pre><p>The <code>data_sources: [payroll]</code> parameter restricts Bridge to payroll providers only.</p>' },
  { title: 'Applicant connects payroll', guide: '<p>Bridge opens as a popup. The user selects their employer and logs in.</p><p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p>' },
  { title: 'Truv processes verification', guide: '<p>Truv sends webhooks as the verification progresses. Wait for <code>task-status-updated</code> with status <code>done</code>.</p>' },
  { title: 'Team Member reviews income report', guide: '<p>The report is fetched via the user reports endpoint:</p><pre>POST /v1/users/{user_id}/reports/</pre><p>Returns VOIE report with income and employment data.</p>' },
];

const DIAGRAM = `sequenceDiagram
  participant FE as Your Frontend
  participant BE as Your Backend
  participant Truv as Truv API
  FE->>BE: Applicant submits information
  BE->>Truv: POST /v1/users/
  Truv-->>BE: user_id
  BE->>Truv: POST /v1/users/{user_id}/tokens/
  Note right of Truv: { product_type: income, data_sources: [payroll] }
  Truv-->>BE: bridge_token
  BE-->>FE: bridge_token
  FE->>Truv: TruvBridge.init({ bridgeToken })
  Note over FE: Applicant connects payroll
  BE->>Truv: POST /v1/link-access-tokens/
  Truv-->>BE: access_token
  Truv->>BE: Webhook: task-status-updated (done)
  BE->>Truv: POST /v1/users/{user_id}/reports/
  Truv-->>BE: VOIE Report`;

export function PayrollIncomeDemo() {
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
        body: JSON.stringify({ product_type: 'income', data_sources: ['payroll'], company_mapping_id: data.company_mapping_id }),
      });
      const result = await resp.json();
      if (!resp.ok) { alert('Error: ' + (result.error || 'Unknown')); setLoading(false); return; }
      setUserId(result.user_id);
      startPolling(result.user_id);

      if (window.TruvBridge) {
        const opts = {
          bridgeToken: result.bridge_token,
          onSuccess: () => { setCurrentStep(2); setScreen('waiting'); },
          onEvent: (name, d) => addBridgeEvent(name, d),
        };
        window.TruvBridge.init(opts).open();
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }

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
          const resp = await fetch(`${API_BASE}/api/users/${encodeURIComponent(userId)}/reports/income`);
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
    <Layout badge="Payroll Income" steps={STEPS} panel={panel} hidePanel={isIntro}>
      <div class={isIntro ? 'flex-1 flex flex-col' : 'max-w-lg mx-auto px-8 py-10'}>
        {screen === 'select' && !showForm && (
          <IntroSlide
            label="Consumer Credit . Payroll Income"
            title="Verify income directly from payroll"
            subtitle="Connect to the applicant's payroll provider to verify current income, employment, and pay history. The fastest and most accurate path for lending decisions."
            diagram={DIAGRAM}
            actions={<button onClick={() => setShowForm(true)} class="w-full max-w-[280px] py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover text-center">Get started</button>}
          />
        )}
        {screen === 'select' && showForm && (
          <ApplicationForm sessionId={sessionId} onSubmit={handleFormSubmit} submitting={loading} productType="income" />
        )}
        {screen === 'waiting' && <WaitingScreen webhooks={panel.webhooks} />}
        {screen === 'review' && (
          <div>
            <h2 class="text-2xl font-bold tracking-tight mb-1.5">Verification Report</h2>
            <p class="text-sm text-gray-500 mb-7">Payroll income verification</p>
            {reportData ? (
              <div>
                <VoieReport report={reportData} />
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
