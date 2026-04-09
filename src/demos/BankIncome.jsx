// BankIncome.jsx — Consumer Credit demo: Bank Income Verification
// Follows the same Bridge (User+Token) flow as SmartRouting.jsx (the canonical example).
// Uses data_sources: ['financial_accounts'] and GET /v1/providers/ for bank search.
import { useState } from 'preact/hooks';
import { Layout, WaitingScreen, usePanel, API_BASE, IntroSlide, useReportFetch } from '../components/index.js';
import { IncomeInsightsReport } from '../components/reports/IncomeInsightsReport.jsx';
import { ApplicationForm } from '../components/ApplicationForm.jsx';

const STEPS = [
  { title: 'Applicant submits information', guide: '<p>The form collects applicant details. Financial institutions (banks) are searched via:</p><pre>GET /v1/providers/?data_source=financial_accounts</pre><p>This returns a <code>provider_id</code> (not <code>company_mapping_id</code> — that\'s for payroll employers). Pass <code>provider_id</code> when creating the bridge token to deeplink Bridge to that bank.</p><p>Then a user and bridge token are created:</p><pre>POST /v1/users/\nPOST /v1/users/{id}/tokens/</pre><p>The <code>data_sources: [financial_accounts]</code> parameter restricts Bridge to bank connections only.</p>' },
  { title: 'Applicant connects bank account', guide: '<p>Bridge opens as a popup. The user selects their bank and logs in.</p><p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p>' },
  { title: 'Truv processes transactions', guide: '<p>Truv sends webhooks as the verification progresses. Wait for <code>task-status-updated</code> with status <code>done</code>.</p>' },
  { title: 'Team Member reviews income report', guide: '<p>The report is fetched via the user reports endpoint:</p><pre>POST /v1/users/{user_id}/income_insights/reports/</pre><p>Returns income insights derived from bank transactions.</p>' },
];

const DIAGRAM = `sequenceDiagram
  participant FE as Your Frontend
  participant BE as Your Backend
  participant Truv as Truv API
  FE->>BE: Applicant submits information
  BE->>Truv: POST /v1/users/
  Truv-->>BE: user_id
  BE->>Truv: POST /v1/users/{user_id}/tokens/
  Note right of Truv: { product_type: income, data_sources: [financial_accounts] }
  Truv-->>BE: bridge_token
  BE-->>FE: bridge_token
  FE->>Truv: TruvBridge.init({ bridgeToken })
  Note over FE: Applicant connects bank account
  BE->>Truv: POST /v1/link-access-tokens/
  Truv-->>BE: access_token
  Truv->>BE: Webhook: task-status-updated (done)
  BE->>Truv: POST /v1/users/{user_id}/income_insights/reports/
  Truv-->>BE: Income Insights Report`;

export function BankIncomeDemo() {
  const [screen, setScreen] = useState('select');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(false);

  const { panel, sessionId, setCurrentStep, startPolling, stopPolling, addBridgeEvent, reset } = usePanel();

  const { reports, loading: reportLoading, reset: resetReports } = useReportFetch({
    userId,
    products: ['income_insights'],
    webhooks: panel.webhooks,
    stopPolling,
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
        body: JSON.stringify({ product_type: 'income', data_sources: ['financial_accounts'], provider_id: data.provider_id }),
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
    <Layout badge="Bank Income" steps={STEPS} panel={panel} hidePanel={isIntro}>
      <div class={isIntro ? 'flex-1 flex flex-col' : 'max-w-lg mx-auto px-8 py-10'}>
        {screen === 'select' && !showForm && (
          <IntroSlide
            label="Consumer Credit . Bank Income"
            title="Verify income from bank transactions"
            subtitle="When payroll data is not available, verify income by connecting to the applicant's bank account. Truv analyzes transaction history and generates an income insights report."
            diagram={DIAGRAM}
            actions={<button onClick={() => setShowForm(true)} class="w-full py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover text-center">Get started</button>}
          />
        )}

        {screen === 'select' && showForm && (
          <ApplicationForm sessionId={sessionId} onSubmit={handleFormSubmit} submitting={loading} productType="income" employerLabel="Financial institution" dataSource="financial_accounts" />
        )}

        {screen === 'waiting' && <WaitingScreen webhooks={panel.webhooks} />}

        {screen === 'review' && (
          <div>
            <h2 class="text-2xl font-bold tracking-tight mb-1.5">Verification Report</h2>
            <p class="text-sm text-gray-500 mb-7">Bank income verification</p>
            {reports?.income_insights && !reportLoading ? (
              <div>
                <IncomeInsightsReport report={reports.income_insights} />
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
