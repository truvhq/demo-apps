import { useState, useEffect } from 'preact/hooks';
import { Layout, usePanel, API_BASE, IntroSlide } from '../components/index.js';
import { ApplicationForm } from '../components/ApplicationForm.jsx';
import { BridgeScreen, OrderWaitingScreen, OrderResultsScreen } from '../components/screens/index.js';
import { navigate } from '../App.jsx';

const STEPS = [
  {
    title: 'Collect applicant info',
    guide: '<p>The form collects applicant PII and employer.</p><pre>GET /v1/company-mappings-search/</pre>'
      + '<p>The employer is used to determine the best verification method.</p>',
  },
  {
    title: 'Smart routing',
    guide: '<p>The system checks payroll coverage for the employer:</p>'
      + '<pre>GET /api/smart-route?q=employer</pre>'
      + '<p>Based on confidence:</p>'
      + '<ul><li><b>High</b> → Payroll verification</li>'
      + '<li><b>Low</b> → Bank transaction verification</li>'
      + '<li><b>None</b> → Document upload</li></ul>',
  },
  { title: 'Bridge verification', guide: '<p>Bridge opens with the auto-selected data source.</p><p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p>' },
  { title: 'Webhook processing', guide: '<p>Truv sends webhooks as the verification progresses.</p>' },
  { title: 'Retrieve results', guide: '<p>Fetch reports based on the routed method.</p>' },
];

const DIAGRAM = `sequenceDiagram
  participant App as Your App
  participant Truv as Truv API
  participant Bridge as Truv Bridge
  App->>Truv: GET /v1/company-mappings-search/?query=employer
  Truv-->>App: company results with coverage info
  App->>App: Evaluate payroll confidence
  alt High confidence
    App->>Truv: POST /v1/orders/ (data_sources: [payroll])
    App->>Bridge: Bridge opens — payroll only
  else Low confidence
    App->>Truv: POST /v1/orders/ (data_sources: [financial_accounts])
    App->>Bridge: Bridge opens — bank connection
  else No coverage
    Note right of App: Fallback to document upload
  end
  Bridge-->>App: Verification complete
  Truv->>App: Webhook: order-status-updated
  App->>Truv: GET report
  Truv-->>App: Verification report`;

export function SmartRoutingDemo({ screen, param }) {
  const [introStep, setIntroStep] = useState(1);
  const [formData, setFormData] = useState(null);
  const [routing, setRouting] = useState(null); // { recommendation, confidence, company }
  const [routingLoading, setRoutingLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { panel, setCurrentStep, startPolling, addBridgeEvent, reset } = usePanel();

  useEffect(() => {
    const stepMap = { '': formData ? 1 : 0, 'bridge': 2, 'waiting': 3, 'results': 4 };
    setCurrentStep(stepMap[screen] ?? 0);
  }, [screen, formData]);

  async function handleFormSubmit(data) {
    setFormData(data);
    setRoutingLoading(true);
    setCurrentStep(1);

    try {
      const employer = data.employer || '';
      const userId = panel.userId || '';
      const resp = await fetch(`${API_BASE}/api/smart-route?q=${encodeURIComponent(employer)}&product_type=income&user_id=${userId}`);
      const result = await resp.json();
      setRouting(result);
    } catch (e) {
      console.error(e);
      setRouting({ recommendation: 'documents', confidence: 0, company: null });
    }
    setRoutingLoading(false);
  }

  async function handleContinue() {
    if (!routing || !formData) return;
    setSubmitting(true);

    const dataSources = routing.recommendation === 'payroll'
      ? ['payroll']
      : routing.recommendation === 'bank'
        ? ['financial_accounts']
        : ['docs'];

    try {
      const resp = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          demo_id: 'smart-routing',
          data_sources: dataSources,
          company_mapping_id: routing.company?.company_mapping_id || formData.company_mapping_id,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) { alert('Error: ' + (data.error || 'Unknown')); setSubmitting(false); return; }
      const cmid = routing.company?.company_mapping_id || formData.company_mapping_id;
      navigate(`consumer-credit/smart-routing/bridge/${data.order_id}${cmid ? '/' + cmid : ''}`);
    } catch (e) { console.error(e); }
    setSubmitting(false);
  }

  function resetDemo() {
    reset();
    setIntroStep(1);
    setFormData(null);
    setRouting(null);
    setRoutingLoading(false);
    setSubmitting(false);
  }

  const isIntro = !screen && !formData;
  const isRouting = !screen && formData && !screen;
  const isBridge = screen === 'bridge';
  const [orderId, companyMappingId] = (param || '').split('/');

  const BADGES = {
    payroll: { label: 'Payroll verification available', color: 'text-[#34c759]', bg: 'bg-green-50', icon: '💼' },
    bank: { label: 'Using bank verification', color: 'text-[#ff9f0a]', bg: 'bg-amber-50', icon: '🏦' },
    documents: { label: 'Document upload required', color: 'text-[#86868b]', bg: 'bg-[#f5f5f7]', icon: '📄' },
  };

  return (
    <Layout title="Truv Quickstart" badge="Smart Routing" steps={STEPS} panel={panel} flush={isBridge} hidePanel={isIntro}>
      {screen === 'bridge' && (
        <BridgeScreen orderId={orderId} demoPath="consumer-credit/smart-routing" companyMappingId={companyMappingId} addBridgeEvent={addBridgeEvent} startPolling={startPolling} />
      )}
      {screen === 'waiting' && (
        <OrderWaitingScreen orderId={param} demoPath="consumer-credit/smart-routing" webhooks={panel.webhooks} startPolling={startPolling} />
      )}
      {screen === 'results' && (
        <OrderResultsScreen orderId={param} onBack={resetDemo} backLabel="Start Over" />
      )}

      {/* Intro step 1 */}
      {isIntro && introStep === 1 && (
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
              <button onClick={() => setIntroStep(2)} class="w-full max-w-xs mx-auto block py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover">
                View Architecture
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Intro step 2 — architecture */}
      {isIntro && introStep === 2 && (
        <IntroSlide
          label="Smart Routing → Architecture"
          title="Confidence-based routing"
          subtitle="Company search results determine the verification path. High-confidence employers use payroll; others fall back to bank or documents."
          diagram={DIAGRAM}
        >
          <div class="w-full max-w-xs mx-auto flex gap-3">
            <button onClick={() => setIntroStep(1)} class="flex-1 py-3 border border-[#d2d2d7] text-[#1d1d1f] font-semibold rounded-full hover:bg-[#f5f5f7]">Back</button>
            <button onClick={() => setIntroStep(3)} class="flex-1 py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover">Continue</button>
          </div>
        </IntroSlide>
      )}

      {/* Application form */}
      {isIntro && introStep === 3 && (
        <div class="max-w-lg mx-auto px-8 py-10">
          <ApplicationForm onSubmit={handleFormSubmit} submitting={routingLoading} productType="income" />
        </div>
      )}

      {/* Routing result screen */}
      {isRouting && formData && !screen && (
        <div class="max-w-lg mx-auto px-8 py-10">
          {routingLoading ? (
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
                <button onClick={() => { setFormData(null); setRouting(null); }} class="flex-1 py-3 border border-[#d2d2d7] text-[#1d1d1f] font-semibold rounded-full hover:bg-[#f5f5f7]">
                  Back
                </button>
                <button onClick={handleContinue} disabled={submitting} class="flex-1 py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover disabled:opacity-40">
                  {submitting ? 'Creating order...' : 'Continue'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Layout>
  );
}
