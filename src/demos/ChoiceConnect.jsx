import { useState, useEffect } from 'preact/hooks';
import { Layout, usePanel, API_BASE, IntroSlide } from '../components/index.js';
import { ApplicationForm } from '../components/ApplicationForm.jsx';
import { BridgeScreen, OrderWaitingScreen, OrderResultsScreen } from '../components/screens/index.js';
import { navigate } from '../App.jsx';

const STEPS = [
  {
    title: 'Collect applicant info',
    guide: '<p>The form collects applicant PII and employer.</p><pre>POST /v1/orders/</pre>'
      + '<p>Order creation is deferred until the user selects a verification method.</p>',
  },
  {
    title: 'Choose verification method',
    guide: '<p>The user picks how to verify their income:</p>'
      + '<ul><li><b>Payroll</b> — connect to payroll provider</li>'
      + '<li><b>Bank</b> — connect bank for transaction-based income</li>'
      + '<li><b>Documents</b> — upload pay stubs or tax forms</li></ul>'
      + '<p>The selected method determines the <code>data_sources</code> parameter on the order.</p>',
  },
  { title: 'Bridge verification', guide: '<p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p><p><a href="https://docs.truv.com/docs/bridge-overview" target="_blank">Bridge Docs</a></p>' },
  { title: 'Webhook processing', guide: '<p>Truv sends webhooks as the verification progresses.</p><p><a href="https://docs.truv.com/docs/webhooks" target="_blank">Webhooks Docs</a></p>' },
  { title: 'Retrieve results', guide: '<p>Fetch reports based on the chosen method.</p><p><a href="https://docs.truv.com/reference/users_reports" target="_blank">Reports API</a></p>' },
];

const DIAGRAM = `sequenceDiagram
  participant App as Your App
  participant Truv as Truv API
  participant Bridge as Truv Bridge
  App->>App: User fills application
  App->>App: User selects verification method
  alt Payroll
    App->>Truv: POST /v1/orders/ (data_sources: [payroll])
    App->>Bridge: TruvBridge.init({ bridgeToken })
    Bridge-->>App: User connects payroll
  else Bank (transactions)
    App->>Truv: POST /v1/orders/ (data_sources: [financial_accounts])
    App->>Bridge: TruvBridge.init({ bridgeToken })
    Bridge-->>App: User connects bank
  else Documents
    App->>Truv: POST /v1/documents/collections/
    Truv-->>App: Parsed income data
  end
  Truv->>App: Webhook: completion
  App->>Truv: GET report
  Truv-->>App: Verification report`;

const METHODS = [
  { id: 'payroll', name: 'Payroll Income', desc: 'Connect to payroll provider for verified income and employment data', icon: '💼', dataSources: ['payroll'] },
  { id: 'bank', name: 'Bank Transactions', desc: 'Connect bank account for transaction-based income insights', icon: '🏦', dataSources: ['financial_accounts'] },
  { id: 'documents', name: 'Upload Documents', desc: 'Upload pay stubs, W-2s, or tax returns for document-based verification', icon: '📄', dataSources: ['docs'] },
];

export function ChoiceConnectDemo({ screen, param }) {
  const [introStep, setIntroStep] = useState(1);
  const [formData, setFormData] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const { panel, setCurrentStep, startPolling, addBridgeEvent, reset } = usePanel();

  useEffect(() => {
    const stepMap = { '': formData ? 1 : 0, 'bridge': 2, 'waiting': 3, 'results': 4 };
    setCurrentStep(stepMap[screen] ?? 0);
  }, [screen, formData]);

  function handleFormSubmit(data) {
    setFormData(data);
    setCurrentStep(1);
  }

  async function handleMethodSelect(method) {
    setSelectedMethod(method.id);
    setSubmitting(true);
    try {
      const resp = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          demo_id: 'choice-connect',
          data_sources: method.dataSources,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) { alert('Error: ' + (data.error || 'Unknown')); setSubmitting(false); return; }
      const cmid = formData.company_mapping_id;
      navigate(`consumer-credit/choice-connect/bridge/${data.order_id}${cmid ? '/' + cmid : ''}`);
    } catch (e) { console.error(e); }
    setSubmitting(false);
  }

  function resetDemo() {
    reset();
    setIntroStep(1);
    setFormData(null);
    setSelectedMethod(null);
    setSubmitting(false);
  }

  const isIntro = !screen && !formData;
  const isChoice = !screen && formData && !selectedMethod;
  const isBridge = screen === 'bridge';
  const [orderId, companyMappingId] = (param || '').split('/');

  return (
    <Layout title="Truv Quickstart" badge="Choice Connect" steps={STEPS} panel={panel} flush={isBridge} hidePanel={isIntro}>
      {screen === 'bridge' && (
        <BridgeScreen orderId={orderId} demoPath="consumer-credit/choice-connect" companyMappingId={companyMappingId} addBridgeEvent={addBridgeEvent} startPolling={startPolling} />
      )}
      {screen === 'waiting' && (
        <OrderWaitingScreen orderId={param} demoPath="consumer-credit/choice-connect" webhooks={panel.webhooks} startPolling={startPolling} />
      )}
      {screen === 'results' && (
        <OrderResultsScreen orderId={param} onBack={resetDemo} backLabel="Start Over" />
      )}

      {/* Intro step 1 */}
      {isIntro && introStep === 1 && (
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
      {isIntro && introStep === 2 && (
        <IntroSlide
          label="Choice Connect → Architecture"
          title="User-driven routing"
          subtitle="The user selects their preferred verification method. The order is created with the corresponding data_sources."
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
          <ApplicationForm onSubmit={handleFormSubmit} submitting={false} productType="income" />
        </div>
      )}

      {/* Method choice screen */}
      {isChoice && !screen && (
        <div class="max-w-lg mx-auto px-8 py-10">
          <h2 class="text-2xl font-bold tracking-tight mb-1.5">Choose verification method</h2>
          <p class="text-sm text-gray-500 leading-relaxed mb-7">Select how you'd like to verify your income.</p>
          <div class="grid gap-3">
            {METHODS.map(m => (
              <button
                key={m.id}
                onClick={() => handleMethodSelect(m)}
                disabled={submitting}
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
          <button onClick={() => setFormData(null)} class="mt-6 text-sm text-[#86868b] hover:text-primary">
            &larr; Back to application
          </button>
        </div>
      )}
    </Layout>
  );
}
