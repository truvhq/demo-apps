import { useState, useEffect, useRef } from 'preact/hooks';
import { Layout, WaitingScreen, parsePayload, usePanel, API_BASE, IntroSlide } from '../components/index.js';
import { VoieReport } from '../components/reports/VoieReport.jsx';
import { DDSReport } from '../components/reports/DDSReport.jsx';
import { ApplicationForm } from '../components/ApplicationForm.jsx';

const STEPS = [
  { title: 'Collect applicant info', guide: '<p>The form collects applicant details. Employers are searched via:</p><pre>GET /v1/company-mappings-search/?query=...</pre><p>Then a user and bridge token are created:</p><pre>POST /v1/users/\nPOST /v1/users/{id}/tokens/</pre><p>Token uses <code>product_type: pll</code> with account details for payroll deductions.</p>' },
  { title: 'Connect via Bridge', guide: '<p>Bridge opens as a popup. The user selects their employer and confirms the payroll deduction.</p><p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p>' },
  { title: 'Webhook processing', guide: '<p>Truv sends webhooks as the verification progresses. Wait for <code>task-status-updated</code> with status <code>done</code>.</p>' },
  { title: 'Review results', guide: '<p>The public token is exchanged for a link report:</p><pre>POST /v1/link-access-tokens/\nGET /v1/links/{link_id}/pll/report</pre><p>Confirms the payroll deduction was set up.</p>' },
];

const DIAGRAM = `sequenceDiagram
  participant App as Your App
  participant Truv as Truv API
  participant Bridge as Truv Bridge
  App->>Truv: POST /v1/users/
  Truv-->>App: user_id
  App->>Truv: POST /v1/users/{user_id}/tokens/
  Note right of Truv: { product_type: pll, account details }
  Truv-->>App: bridge_token
  App->>Bridge: TruvBridge.init({ bridgeToken })
  Bridge-->>App: onSuccess(public_token)
  Truv->>App: Webhook: task-status-updated (done)
  App->>Truv: POST /v1/link-access-tokens/
  Truv-->>App: link_id
  App->>Truv: GET /v1/links/{link_id}/pll/report
  Truv-->>App: Payroll deduction confirmed`;

export function PaycheckLinkedLoansDemo() {
  const [screen, setScreen] = useState('select');
  const [introStep, setIntroStep] = useState(1);
  const [formData, setFormData] = useState(null);
  const [userId, setUserId] = useState(null);
  const [publicToken, setPublicToken] = useState(null);
  const [incomeReport, setIncomeReport] = useState(null);
  const [ddsReport, setDdsReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  const { panel, setCurrentStep, startPolling, addBridgeEvent, reset } = usePanel();

  async function handleFormSubmit(data) {
    setFormData(data);
    setLoading(true);
    setCurrentStep(1);
    try {
      const resp = await fetch(`${API_BASE}/api/bridge-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_type: 'pll', company_mapping_id: data.company_mapping_id }),
      });
      const result = await resp.json();
      if (!resp.ok) { alert('Error: ' + (result.error || 'Unknown')); setLoading(false); return; }
      setUserId(result.user_id);
      startPolling(result.user_id);

      if (window.TruvBridge) {
        const opts = {
          bridgeToken: result.bridge_token,
          onSuccess: (t) => { setPublicToken(t); setCurrentStep(2); setScreen('waiting'); },
          onEvent: (name, d) => addBridgeEvent(name, d),
        };
        window.TruvBridge.init(opts).open();
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  useEffect(() => {
    if (screen !== 'waiting' || !publicToken || fetchedRef.current) return;
    const done = panel.webhooks.some(w => {
      const p = parsePayload(w.payload);
      return (p.event_type === 'task-status-updated' && p.status === 'done')
        || (w.event_type === 'task-status-updated' && w.status === 'done');
    });
    if (done) {
      fetchedRef.current = true;
      setCurrentStep(3);
      setScreen('review');
      (async () => {
        const encoded = encodeURIComponent(publicToken);
        try {
          const [incomeResp, ddsResp] = await Promise.all([
            fetch(`${API_BASE}/api/link-report/${encoded}/income?user_id=${userId}`),
            fetch(`${API_BASE}/api/link-report/${encoded}/deposit_switch?user_id=${userId}`),
          ]);
          if (incomeResp.ok) setIncomeReport(await incomeResp.json());
          if (ddsResp.ok) setDdsReport(await ddsResp.json());
        } catch (e) { console.error(e); }
      })();
    }
  }, [panel.webhooks, screen, publicToken]);

  function resetDemo() {
    reset();
    fetchedRef.current = false;
    setScreen('select');
    setIntroStep(1);
    setFormData(null);
    setUserId(null);
    setPublicToken(null);
    setIncomeReport(null);
    setDdsReport(null);
  }

  const isIntro = screen === 'select' && introStep <= 2;

  return (
    <Layout title="Truv Quickstart" badge="Paycheck-Linked Loans" steps={STEPS} panel={panel} hidePanel={isIntro}>
      <div class={isIntro ? 'flex-1 flex flex-col' : 'max-w-lg mx-auto px-8 py-10'}>
        {screen === 'select' && introStep === 1 && (
          <div class="intro-slide">
            <div class="relative z-10 w-full max-w-2xl mx-auto px-4">
              <div class="animate-slideUp">
                <div class="text-[12px] font-medium uppercase tracking-[0.08em] text-primary mb-4">Paycheck-Linked Lending</div>
                <h2 class="text-[36px] font-semibold tracking-[-0.03em] leading-[1.1] text-[#1d1d1f] mb-4">Set up payroll<br />deductions</h2>
                <p class="text-[17px] text-[#86868b] leading-[1.5] max-w-[440px] mx-auto mb-7">
                  Connect to a payroll provider and set up automatic payroll deductions for loan repayment.
                </p>
              </div>
              <div class="animate-slideUp delay-2">
                <button onClick={() => setIntroStep(2)} class="w-full max-w-xs mx-auto block py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover">Get started →</button>
              </div>
            </div>
          </div>
        )}

        {screen === 'select' && introStep === 2 && (
          <IntroSlide label="PLL → Architecture" title="Paycheck-linked lending flow" subtitle="Uses the User + Bridge Token flow with product_type: pll and account details for the deduction target." diagram={DIAGRAM}>
            <div class="w-full max-w-xs mx-auto flex gap-3">
              <button onClick={() => setIntroStep(1)} class="flex-1 py-3 border border-[#d2d2d7] text-[#1d1d1f] font-semibold rounded-full hover:bg-[#f5f5f7]">Back</button>
              <button onClick={() => setIntroStep(3)} class="flex-1 py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover">Continue</button>
            </div>
          </IntroSlide>
        )}

        {screen === 'select' && introStep === 3 && (
          <div class="max-w-lg mx-auto px-8 py-10">
            <ApplicationForm onSubmit={handleFormSubmit} submitting={loading} productType="pll" />
          </div>
        )}

        {screen === 'waiting' && <WaitingScreen webhooks={panel.webhooks} />}

        {screen === 'review' && (
          <div>
            <h2 class="text-2xl font-bold tracking-tight mb-1.5">Verification Report</h2>
            <p class="text-sm text-gray-500 mb-7">Paycheck-linked lending</p>
            {(incomeReport || ddsReport) ? (
              <div>
                {ddsReport && <DDSReport report={ddsReport} />}
                {incomeReport && <VoieReport report={incomeReport} />}
                <div class="flex gap-3 mt-6 pt-5 border-t border-gray-200">
                  <button class="px-5 py-2.5 text-sm font-semibold border border-gray-200 rounded-full hover:border-primary hover:text-primary" onClick={resetDemo}>Start Over</button>
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
