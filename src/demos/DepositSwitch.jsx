import { useState, useEffect, useRef } from 'preact/hooks';
import { Layout, WaitingScreen, parsePayload, usePanel, API_BASE, IntroSlide } from '../components/index.js';
import { ApplicationForm } from '../components/ApplicationForm.jsx';
import { DDSReport } from '../components/reports/DDSReport.jsx';

const STEPS = [
  { title: 'Collect applicant info', guide: '<p>The form collects applicant details. Employers are searched via:</p><pre>GET /v1/company-mappings-search/?query=...</pre><p>Then a user and bridge token are created:</p><pre>POST /v1/users/\nPOST /v1/users/{id}/tokens/</pre><p>Token uses <code>product_type: deposit_switch</code> with target account details.</p>' },
  { title: 'Connect via Bridge', guide: '<p>Bridge opens as a popup. The user selects their employer and confirms the deposit switch.</p><p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p>' },
  { title: 'Webhook processing', guide: '<p>Truv sends webhooks as the verification progresses. Wait for <code>task-status-updated</code> with status <code>done</code>.</p>' },
  { title: 'Review results', guide: '<p>The public token is exchanged for a link report:</p><pre>POST /v1/link-access-tokens/\nGET /v1/links/{link_id}/deposit_switch/report</pre><p>Confirms the direct deposit was switched.</p>' },
];

const DIAGRAM = `sequenceDiagram
  participant App as Your App
  participant Truv as Truv API
  participant Bridge as Truv Bridge
  App->>Truv: POST /v1/users/
  Truv-->>App: user_id
  App->>Truv: POST /v1/users/{user_id}/tokens/
  Note right of Truv: { product_type: deposit_switch, account details }
  Truv-->>App: bridge_token
  App->>Bridge: TruvBridge.init({ bridgeToken })
  Bridge-->>App: onSuccess(public_token)
  Truv->>App: Webhook: task-status-updated (done)
  App->>Truv: POST /v1/link-access-tokens/
  Truv-->>App: link_id
  App->>Truv: GET /v1/links/{link_id}/deposit_switch/report
  Truv-->>App: Deposit switch confirmed`;

export function DepositSwitchDemo() {
  const [screen, setScreen] = useState('select');
  const [introStep, setIntroStep] = useState(1);
  const [formData, setFormData] = useState(null);
  const [userId, setUserId] = useState(null);
  const [publicToken, setPublicToken] = useState(null);
  const [reportData, setReportData] = useState(null);
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
        body: JSON.stringify({ product_type: 'deposit_switch', company_mapping_id: data.company_mapping_id }),
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
        try {
          const resp = await fetch(`${API_BASE}/api/link-report/${encodeURIComponent(publicToken)}/deposit_switch?user_id=${userId}`);
          setReportData(await resp.json());
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
    setReportData(null);
  }

  const isIntro = screen === 'select' && introStep <= 2;

  return (
    <Layout title="Truv Quickstart" badge="Direct Deposit Switch" steps={STEPS} panel={panel} hidePanel={isIntro}>
      <div class={isIntro ? 'flex-1 flex flex-col' : 'max-w-lg mx-auto px-8 py-10'}>
        {screen === 'select' && introStep === 1 && (
          <div class="intro-slide">
            <div class="relative z-10 w-full max-w-2xl mx-auto px-4">
              <div class="animate-slideUp">
                <div class="text-[12px] font-medium uppercase tracking-[0.08em] text-primary mb-4">Direct Deposit Switch</div>
                <h2 class="text-[36px] font-semibold tracking-[-0.03em] leading-[1.1] text-[#1d1d1f] mb-4">Switch direct deposit<br />routing</h2>
                <p class="text-[17px] text-[#86868b] leading-[1.5] max-w-[440px] mx-auto mb-7">
                  Connect to a payroll provider and switch the direct deposit destination to a new account.
                </p>
              </div>
              <div class="animate-slideUp delay-2">
                <button onClick={() => setIntroStep(2)} class="w-full max-w-xs mx-auto block py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover">Get started →</button>
              </div>
            </div>
          </div>
        )}

        {screen === 'select' && introStep === 2 && (
          <IntroSlide label="Deposit Switch → Architecture" title="Direct deposit switch flow" subtitle="Uses the User + Bridge Token flow with product_type: deposit_switch and target account details." diagram={DIAGRAM}>
            <div class="w-full max-w-xs mx-auto flex gap-3">
              <button onClick={() => setIntroStep(1)} class="flex-1 py-3 border border-[#d2d2d7] text-[#1d1d1f] font-semibold rounded-full hover:bg-[#f5f5f7]">Back</button>
              <button onClick={() => setIntroStep(3)} class="flex-1 py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover">Continue</button>
            </div>
          </IntroSlide>
        )}

        {screen === 'select' && introStep === 3 && (
          <div class="max-w-lg mx-auto px-8 py-10">
            <ApplicationForm onSubmit={handleFormSubmit} submitting={loading} productType="deposit_switch" />
          </div>
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
