import { useState, useEffect, useRef } from 'preact/hooks';
import { Layout, WaitingScreen, parsePayload, usePanel, API_BASE, IntroSlide } from '../components/index.js';
import { VoieReport } from '../components/reports/VoieReport.jsx';
import { IncomeInsightsReport } from '../components/reports/IncomeInsightsReport.jsx';
import { ApplicationForm } from '../components/ApplicationForm.jsx';

const STEPS = [
  {
    title: 'Collect applicant info',
    guide: '<p>The form collects applicant details. The backend creates a user and generates a Bridge token:</p>'
      + '<pre>POST /v1/users/\nPOST /v1/users/{id}/tokens/</pre>'
      + '<p>Token creation is deferred until the user selects a verification method.</p>',
  },
  {
    title: 'Choose verification method',
    guide: '<p>The user picks how to verify:</p>'
      + '<ul><li><b>Payroll</b> — data_sources: [payroll]</li>'
      + '<li><b>Bank</b> — data_sources: [financial_accounts]</li>'
      + '<li><b>Documents</b> — data_sources: [docs]</li></ul>'
      + '<p>The selected method determines the <code>data_sources</code> on the bridge token.</p>',
  },
  { title: 'Connect via Bridge', guide: '<p>Bridge opens as a popup. The user selects their employer and logs in.</p><p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p>' },
  { title: 'Webhook processing', guide: '<p>Truv sends webhooks as the verification progresses. Wait for <code>task-status-updated</code> with status <code>done</code>.</p>' },
  { title: 'Review results', guide: '<p>The public token is exchanged for a link report:</p><pre>POST /v1/link-access-tokens/\nGET /v1/links/{link_id}/{product}/report</pre>' },
];

const DIAGRAM = `sequenceDiagram
  participant App as Your App
  participant Truv as Truv API
  participant Bridge as Truv Bridge
  App->>App: User fills application
  App->>App: User selects verification method
  App->>Truv: POST /v1/users/
  Truv-->>App: user_id
  App->>Truv: POST /v1/users/{user_id}/tokens/
  Note right of Truv: { product_type, data_sources }
  Truv-->>App: bridge_token
  App->>Bridge: TruvBridge.init({ bridgeToken })
  Bridge-->>App: onSuccess(public_token)
  Truv->>App: Webhook: task-status-updated (done)
  App->>Truv: POST /v1/link-access-tokens/
  Truv-->>App: link_id
  App->>Truv: GET /v1/links/{link_id}/{product}/report
  Truv-->>App: Verification report`;

const METHODS = [
  { id: 'payroll', name: 'Payroll Income', desc: 'Connect to payroll provider for verified income and employment data', icon: '💼', dataSources: ['payroll'], reportType: 'income' },
  { id: 'bank', name: 'Bank Transactions', desc: 'Connect bank account for transaction-based income insights', icon: '🏦', dataSources: ['financial_accounts'], reportType: 'income' },
  { id: 'documents', name: 'Upload Documents', desc: 'Upload pay stubs, W-2s, or tax returns for document-based verification', icon: '📄', dataSources: ['docs'], reportType: 'income' },
];

export function ChoiceConnectDemo() {
  const [screen, setScreen] = useState('select');
  const [introStep, setIntroStep] = useState(1);
  const [formData, setFormData] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [bridgeToken, setBridgeToken] = useState(null);
  const [userId, setUserId] = useState(null);
  const [publicToken, setPublicToken] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  const { panel, setCurrentStep, startPolling, addBridgeEvent, reset } = usePanel();

  function handleFormSubmit(data) {
    setFormData(data);
    setCurrentStep(1);
    setScreen('choose');
  }

  async function handleMethodSelect(method) {
    setSelectedMethod(method);
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/bridge-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_type: method.reportType, data_sources: method.dataSources }),
      });
      const data = await resp.json();
      if (!resp.ok) { alert('Error: ' + (data.error || 'Unknown')); setLoading(false); return; }

      setUserId(data.user_id);
      startPolling(data.user_id);
      setCurrentStep(2);

      // Open Bridge immediately
      if (window.TruvBridge) {
        window.TruvBridge.init({
          bridgeToken: data.bridge_token,
          onSuccess: (token) => onBridgeSuccess(token),
          onEvent: (name, d) => addBridgeEvent(name, d),
        }).open();
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  function onBridgeSuccess(token) {
    setPublicToken(token);
    setCurrentStep(3);
    setScreen('waiting');
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
      setCurrentStep(4);
      setScreen('review');
      (async () => {
        try {
          const reportType = selectedMethod?.reportType || 'income';
          const resp = await fetch(`${API_BASE}/api/link-report/${encodeURIComponent(publicToken)}/${reportType}?user_id=${userId}`);
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
    setSelectedMethod(null);
    setBridgeToken(null);
    setUserId(null);
    setPublicToken(null);
    setReportData(null);
  }

  const isIntro = screen === 'select';

  return (
    <Layout title="Truv Quickstart" badge="Choice Connect" steps={STEPS} panel={panel} hidePanel={isIntro}>
      <div class={isIntro ? '' : 'max-w-lg mx-auto px-8 py-10'}>
        {/* Intro step 1 */}
        {screen === 'select' && introStep === 1 && (
          <div class="intro-slide">
            <div class="relative z-10 w-full max-w-2xl mx-auto px-4">
              <div class="animate-slideUp">
                <div class="text-[12px] font-medium uppercase tracking-[0.08em] text-primary mb-4">Choice Connect</div>
                <h2 class="text-[36px] font-semibold tracking-[-0.03em] leading-[1.1] text-[#1d1d1f] mb-4">Let the user choose<br />how to verify</h2>
                <p class="text-[17px] text-[#86868b] leading-[1.5] max-w-[440px] mx-auto mb-7">
                  After filling out the application, the user selects their preferred verification method — payroll, bank, or document upload.
                </p>
              </div>
              <div class="grid gap-3 mb-8 text-left max-w-lg mx-auto animate-slideUp delay-1">
                {METHODS.map(m => (
                  <div key={m.id} class="border border-[#d2d2d7] rounded-2xl px-5 py-4 bg-white">
                    <div class="flex items-center gap-3 mb-1">
                      <span class="text-lg">{m.icon}</span>
                      <h3 class="text-[14px] font-semibold text-[#1d1d1f]">{m.name}</h3>
                    </div>
                    <p class="text-[13px] text-[#6e6e73] leading-[1.4]">{m.desc}</p>
                  </div>
                ))}
              </div>
              <div class="animate-slideUp delay-2">
                <button onClick={() => setIntroStep(2)} class="w-full max-w-xs mx-auto block py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover">
                  View Architecture
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Intro step 2 — architecture */}
        {screen === 'select' && introStep === 2 && (
          <IntroSlide
            label="Choice Connect → Architecture"
            title="User-driven routing"
            subtitle="Uses the User + Bridge Token flow. The selected method determines data_sources on the bridge token."
            diagram={DIAGRAM}
          >
            <div class="w-full max-w-xs mx-auto flex gap-3">
              <button onClick={() => setIntroStep(1)} class="flex-1 py-3 border border-[#d2d2d7] text-[#1d1d1f] font-semibold rounded-full hover:bg-[#f5f5f7]">Back</button>
              <button onClick={() => setIntroStep(3)} class="flex-1 py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover">Continue</button>
            </div>
          </IntroSlide>
        )}

        {/* Application form */}
        {screen === 'select' && introStep === 3 && (
          <div class="max-w-lg mx-auto px-8 py-10">
            <ApplicationForm onSubmit={handleFormSubmit} submitting={false} productType="income" />
          </div>
        )}

        {/* Method choice screen */}
        {screen === 'choose' && (
          <>
            <h2 class="text-2xl font-bold tracking-tight mb-1.5">Choose verification method</h2>
            <p class="text-sm text-gray-500 leading-relaxed mb-7">Select how you'd like to verify your income.</p>
            <div class="grid gap-3">
              {METHODS.map(m => (
                <button
                  key={m.id}
                  onClick={() => handleMethodSelect(m)}
                  disabled={loading}
                  class="border border-[#d2d2d7] rounded-2xl px-6 py-5 text-left cursor-pointer transition-all duration-200 hover:border-primary hover:bg-[#f5f8ff] disabled:opacity-40"
                >
                  <div class="flex items-center gap-3 mb-1">
                    <span class="text-xl">{m.icon}</span>
                    <h3 class="text-[15px] font-semibold text-[#1d1d1f]">{m.name}</h3>
                  </div>
                  <p class="text-[14px] text-[#6e6e73] leading-[1.5]">{m.desc}</p>
                </button>
              ))}
            </div>
            <button onClick={() => { setFormData(null); setScreen('select'); setIntroStep(3); }} class="mt-6 text-sm text-[#86868b] hover:text-primary">
              &larr; Back to application
            </button>
          </>
        )}

        {/* Waiting for webhook */}
        {screen === 'waiting' && <WaitingScreen webhooks={panel.webhooks} />}

        {/* Review results */}
        {screen === 'review' && (
          <div>
            <h2 class="text-2xl font-bold tracking-tight mb-1.5">Verification Report</h2>
            <p class="text-sm text-gray-500 mb-7">{selectedMethod?.name} verification</p>
            {reportData ? (
              <div>
                {selectedMethod?.id === 'bank'
                  ? <IncomeInsightsReport report={reportData} />
                  : <VoieReport report={reportData} />}
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
