import { useState, useEffect, useRef } from 'preact/hooks';
import { Layout, WaitingScreen, parsePayload, usePanel, API_BASE, IntroSlide } from '../components/index.js';
import { ApplicationForm } from '../components/ApplicationForm.jsx';
import { VoieReport } from '../components/reports/VoieReport.jsx';
import { IncomeInsightsReport } from '../components/reports/IncomeInsightsReport.jsx';

const STEPS = [
  { title: 'Collect applicant info', guide: '<p>The form collects applicant details and employer. The employer is used to determine the best verification method.</p>' },
  {
    title: 'Smart routing',
    guide: '<p>The system checks payroll coverage for the employer:</p>'
      + '<pre>GET /api/smart-route?q=employer</pre>'
      + '<p>Based on confidence:</p>'
      + '<ul><li><b>High</b> → Payroll (data_sources: [payroll])</li>'
      + '<li><b>Low</b> → Bank (data_sources: [financial_accounts])</li>'
      + '<li><b>None</b> → Document upload</li></ul>',
  },
  { title: 'Connect via Bridge', guide: '<p>Bridge opens as a popup with the auto-selected data source.</p><p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p>' },
  { title: 'Webhook processing', guide: '<p>Truv sends webhooks as the verification progresses. Wait for <code>task-status-updated</code> with status <code>done</code>.</p>' },
  { title: 'Review results', guide: '<p>The public token is exchanged for a link report:</p><pre>POST /v1/link-access-tokens/\nGET /v1/links/{link_id}/{product}/report</pre>' },
];

const DIAGRAM = `sequenceDiagram
  participant App as Your App
  participant Truv as Truv API
  participant Bridge as Truv Bridge
  App->>Truv: GET /v1/company-mappings-search/?query=employer
  Truv-->>App: company results with coverage info
  App->>App: Evaluate payroll confidence
  alt High confidence
    App->>Truv: POST /v1/users/ + POST tokens/ (data_sources: [payroll])
    App->>Bridge: Bridge opens — payroll only
  else Low confidence
    App->>Truv: POST /v1/users/ + POST tokens/ (data_sources: [financial_accounts])
    App->>Bridge: Bridge opens — bank connection
  else No coverage
    Note right of App: Fallback to document upload
  end
  Bridge-->>App: onSuccess(public_token)
  Truv->>App: Webhook: task-status-updated (done)
  App->>Truv: POST /v1/link-access-tokens/
  Truv-->>App: link_id
  App->>Truv: GET /v1/links/{link_id}/income/report
  Truv-->>App: Verification report`;

const BADGES = {
  payroll: { label: 'Payroll verification available', color: 'text-[#34c759]', bg: 'bg-green-50', icon: '💼' },
  bank: { label: 'Using bank verification', color: 'text-[#ff9f0a]', bg: 'bg-amber-50', icon: '🏦' },
  documents: { label: 'Document upload required', color: 'text-[#86868b]', bg: 'bg-[#f5f5f7]', icon: '📄' },
};

export function SmartRoutingDemo() {
  const [screen, setScreen] = useState('select');
  const [introStep, setIntroStep] = useState(1);
  const [formData, setFormData] = useState(null);
  const [routing, setRouting] = useState(null);
  const [bridgeToken, setBridgeToken] = useState(null);
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
    setScreen('routing');

    try {
      const employer = data.employer || '';
      const resp = await fetch(`${API_BASE}/api/smart-route?q=${encodeURIComponent(employer)}&product_type=income`);
      const result = await resp.json();
      setRouting(result);
    } catch (e) {
      console.error(e);
      setRouting({ recommendation: 'documents', confidence: 0, company: null });
    }
    setLoading(false);
  }

  async function handleContinue() {
    if (!routing) return;
    setLoading(true);

    const dataSources = routing.recommendation === 'payroll'
      ? ['payroll']
      : routing.recommendation === 'bank'
        ? ['financial_accounts']
        : ['docs'];

    try {
      const resp = await fetch(`${API_BASE}/api/bridge-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_type: 'income', data_sources: dataSources }),
      });
      const data = await resp.json();
      if (!resp.ok) { alert('Error: ' + (data.error || 'Unknown')); setLoading(false); return; }

      setUserId(data.user_id);
      startPolling(data.user_id);
      setCurrentStep(2);

      if (window.TruvBridge) {
        window.TruvBridge.init({
          bridgeToken: data.bridge_token,
          onSuccess: (t) => { setPublicToken(t); setCurrentStep(3); setScreen('waiting'); },
          onEvent: (name, d) => addBridgeEvent(name, d),
        }).open();
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
      setCurrentStep(4);
      setScreen('review');
      (async () => {
        try {
          const resp = await fetch(`${API_BASE}/api/link-report/${encodeURIComponent(publicToken)}/income?user_id=${userId}`);
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
    setRouting(null);
    setBridgeToken(null);
    setUserId(null);
    setPublicToken(null);
    setReportData(null);
  }

  const isIntro = screen === 'select';

  return (
    <Layout title="Truv Quickstart" badge="Smart Routing" steps={STEPS} panel={panel} hidePanel={isIntro}>
      <div class={isIntro ? '' : 'max-w-lg mx-auto px-8 py-10'}>
        {/* Intro step 1 */}
        {screen === 'select' && introStep === 1 && (
          <div class="intro-slide">
            <div class="relative z-10 w-full max-w-2xl mx-auto px-4">
              <div class="animate-slideUp">
                <div class="text-[12px] font-medium uppercase tracking-[0.08em] text-primary mb-4">Smart Routing</div>
                <h2 class="text-[36px] font-semibold tracking-[-0.03em] leading-[1.1] text-[#1d1d1f] mb-4">Automatically pick the<br />best verification method</h2>
                <p class="text-[17px] text-[#86868b] leading-[1.5] max-w-[440px] mx-auto mb-7">
                  The system checks the employer's payroll coverage and automatically routes to the best verification method — payroll, bank, or document upload.
                </p>
              </div>
              <div class="grid gap-3 mb-8 text-left max-w-lg mx-auto animate-slideUp delay-1">
                {[
                  { name: 'Company search', desc: 'Check payroll provider coverage for the employer', icon: '🔍' },
                  { name: 'Confidence scoring', desc: 'Evaluate how likely payroll verification will succeed', icon: '📊' },
                  { name: 'Automatic routing', desc: 'Route to payroll, bank, or documents based on confidence', icon: '🔀' },
                ].map(item => (
                  <div key={item.name} class="border border-[#d2d2d7] rounded-2xl px-5 py-4 bg-white">
                    <div class="flex items-center gap-3 mb-1">
                      <span class="text-lg">{item.icon}</span>
                      <h3 class="text-[14px] font-semibold text-[#1d1d1f]">{item.name}</h3>
                    </div>
                    <p class="text-[13px] text-[#6e6e73] leading-[1.4]">{item.desc}</p>
                  </div>
                ))}
              </div>
              <div class="animate-slideUp delay-2">
                <button onClick={() => setIntroStep(2)} class="w-full max-w-xs mx-auto block py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover">View Architecture</button>
              </div>
            </div>
          </div>
        )}

        {/* Intro step 2 — architecture */}
        {screen === 'select' && introStep === 2 && (
          <IntroSlide label="Smart Routing → Architecture" title="Confidence-based routing" subtitle="Company search results determine the verification path. High-confidence employers use payroll; others fall back to bank or documents." diagram={DIAGRAM}>
            <div class="w-full max-w-xs mx-auto flex gap-3">
              <button onClick={() => setIntroStep(1)} class="flex-1 py-3 border border-[#d2d2d7] text-[#1d1d1f] font-semibold rounded-full hover:bg-[#f5f5f7]">Back</button>
              <button onClick={() => setIntroStep(3)} class="flex-1 py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover">Continue</button>
            </div>
          </IntroSlide>
        )}

        {/* Application form */}
        {screen === 'select' && introStep === 3 && (
          <div class="max-w-lg mx-auto px-8 py-10">
            <ApplicationForm onSubmit={handleFormSubmit} submitting={loading} productType="income" />
          </div>
        )}

        {/* Routing result */}
        {screen === 'routing' && (
          <div>
            {loading ? (
              <div class="text-center py-16">
                <div class="w-12 h-12 border-[3px] border-[#d2d2d7] border-t-primary rounded-full animate-spin mx-auto mb-6" />
                <h2 class="text-2xl font-semibold tracking-tight mb-2">Determining best method...</h2>
                <p class="text-[15px] text-[#86868b]">Checking payroll coverage for the employer</p>
              </div>
            ) : routing ? (
              <div>
                <h2 class="text-2xl font-bold tracking-tight mb-1.5">Routing Decision</h2>
                <p class="text-sm text-gray-500 leading-relaxed mb-7">Based on employer payroll coverage analysis.</p>

                <div class={`border rounded-2xl px-6 py-5 mb-6 ${BADGES[routing.recommendation].bg}`}>
                  <div class="flex items-center gap-3 mb-2">
                    <span class="text-2xl">{BADGES[routing.recommendation].icon}</span>
                    <div>
                      <h3 class={`text-[16px] font-semibold ${BADGES[routing.recommendation].color}`}>{BADGES[routing.recommendation].label}</h3>
                      <p class="text-[13px] text-[#6e6e73]">Confidence: {Math.round((routing.confidence || 0) * 100)}%</p>
                    </div>
                  </div>
                  {routing.company?.name && (
                    <p class="text-[13px] text-[#86868b] mt-2">Matched employer: <span class="font-medium text-[#1d1d1f]">{routing.company.name}</span></p>
                  )}
                </div>

                <div class="flex gap-3">
                  <button onClick={() => { setFormData(null); setRouting(null); setScreen('select'); setIntroStep(3); }} class="flex-1 py-3 border border-[#d2d2d7] text-[#1d1d1f] font-semibold rounded-full hover:bg-[#f5f5f7]">Back</button>
                  <button onClick={handleContinue} disabled={loading} class="flex-1 py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover disabled:opacity-40">{loading ? 'Creating...' : 'Continue'}</button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Waiting for webhook */}
        {screen === 'waiting' && <WaitingScreen webhooks={panel.webhooks} />}

        {/* Review results */}
        {screen === 'review' && (
          <div>
            <h2 class="text-2xl font-bold tracking-tight mb-1.5">Verification Report</h2>
            <p class="text-sm text-gray-500 mb-7">Smart routing → {routing?.recommendation} verification</p>
            {reportData ? (
              <div>
                {routing?.recommendation === 'bank'
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
