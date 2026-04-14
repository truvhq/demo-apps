// PayrollIncome.jsx — Consumer Credit demo: Payroll Income Verification
// Follows the same Bridge (User+Token) flow as SmartRouting.jsx (the canonical example).
// Uses data_sources: ['payroll'] and GET /v1/company-mappings-search/ for employer search.
import { useState } from 'preact/hooks';
import { Layout, WaitingScreen, usePanel, API_BASE, IntroSlide, useReportFetch } from '../components/index.js';
import { VoieReport } from '../components/reports/VoieReport.jsx';
import { ApplicationForm } from '../components/ApplicationForm.jsx';
import { DIAGRAM } from '../diagrams/payroll-income.js';

const STEPS = [
  { title: 'Applicant submits information', guide: '<p>The form collects applicant details. Employers are searched via:</p><pre>GET /v1/company-mappings-search/?query=...</pre><p>This returns a <code>company_mapping_id</code> (not <code>provider_id</code> — that\'s for banks). Pass <code>company_mapping_id</code> when creating the bridge token to deeplink Bridge to that employer.</p><p>Then a user and bridge token are created:</p><pre>POST /v1/users/\nPOST /v1/users/{id}/tokens/</pre><p>The <code>data_sources: [payroll]</code> parameter restricts Bridge to payroll providers only.</p>' },
  { title: 'Applicant connects payroll', guide: '<p>Bridge opens as a popup. The user selects their employer and logs in.</p><p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p>' },
  { title: 'Truv processes verification', guide: '<p>Truv sends webhooks as the verification progresses. Wait for <code>task-status-updated</code> with status <code>done</code>.</p>' },
  { title: 'Team Member reviews income report', guide: '<p>The report is fetched via the user reports endpoint:</p><pre>POST /v1/users/{user_id}/reports/</pre><p>Returns VOIE report with income and employment data.</p>' },
];

export function PayrollIncomeDemo() {
  const [screen, setScreen] = useState('select');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(false);

  const { panel, sessionId, setCurrentStep, startPolling, pollOnceAndStop, addBridgeEvent, reset } = usePanel();

  const { reports, loading: reportLoading, reset: resetReports } = useReportFetch({
    userId,
    products: ['income'],
    webhooks: panel.webhooks,
    pollOnceAndStop,
    webhookEvent: 'task',
    onComplete: () => { setCurrentStep(3); setScreen('review'); },
  });

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

  function resetDemo() {
    reset();
    resetReports();
    setScreen('select');
    setShowForm(false);
    setFormData(null);
    setUserId(null);
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
            actions={<button onClick={() => setShowForm(true)} class="w-full py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover text-center">Get started</button>}
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
            {reports?.income && !reportLoading ? (
              <div>
                <VoieReport report={reports.income} />
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
