import { useState, useEffect } from 'preact/hooks';
import { Layout, usePanel, API_BASE, IntroSlide } from '../components/index.js';
import { ApplicationForm } from '../components/ApplicationForm.jsx';
import { BridgeScreen, OrderWaitingScreen, OrderResultsScreen } from '../components/screens/index.js';
import { navigate } from '../App.jsx';

const DIAGRAM = `sequenceDiagram
  participant App as Your App
  participant Truv as Truv API
  participant Bridge as Truv Bridge
  App->>Truv: POST /v1/orders/
  Note right of Truv: products: [deposit_switch]
  Truv-->>App: bridge_token, user_id
  App->>Bridge: TruvBridge.init({ bridgeToken })
  Bridge-->>App: User logs in and confirms switch
  Truv->>App: Webhook: order-status-updated
  Truv-->>App: Deposit switch completed`;

const STEPS = [
  {
    title: 'Collect applicant info',
    guide: '<p>The form collects applicant PII and employer. An order is created with the <code>deposit_switch</code> product:</p>'
      + '<pre>POST /v1/orders/</pre>'
      + '<p><a href="https://docs.truv.com/reference/create-an-order" target="_blank">Orders API</a></p>',
  },
  { title: 'Bridge verification', guide: '<p>The user connects to their payroll provider and confirms the direct deposit switch.</p><p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p><p><a href="https://docs.truv.com/docs/bridge-overview" target="_blank">Bridge Docs →</a></p>' },
  { title: 'Webhook processing', guide: '<p>Truv sends a webhook when the deposit switch is completed.</p><p><a href="https://docs.truv.com/docs/webhooks" target="_blank">Webhooks Docs →</a></p>' },
];

export function DepositSwitchDemo({ screen, param }) {
  const [introStep, setIntroStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const { panel, setCurrentStep, startPolling, addBridgeEvent, reset } = usePanel();

  useEffect(() => {
    const stepMap = { '': 0, 'bridge': 1, 'waiting': 2 };
    setCurrentStep(stepMap[screen] ?? 0);
  }, [screen]);

  async function handleSubmit(formData) {
    setSubmitting(true);
    try {
      const resp = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, product_type: 'deposit_switch', demo_id: 'deposit-switch', data_sources: ['payroll'] }),
      });
      const data = await resp.json();
      if (!resp.ok) { alert('Error: ' + (data.error || 'Unknown')); setSubmitting(false); return; }
      const cmid = formData.company_mapping_id;
      navigate(`retail-banking/deposit-switch/bridge/${data.order_id}${cmid ? '/' + cmid : ''}`);
    } catch (e) { console.error(e); }
    setSubmitting(false);
  }

  const isBridge = screen === 'bridge';
  const isIntro = !screen && introStep <= 2;
  const [orderId, companyMappingId] = (param || '').split('/');

  return (
    <Layout title="Truv Quickstart" badge="Direct Deposit Switch" steps={STEPS} panel={panel} flush={isBridge} hidePanel={isIntro}>
      {screen === 'bridge' && (
        <BridgeScreen orderId={orderId} demoPath="retail-banking/deposit-switch" companyMappingId={companyMappingId} addBridgeEvent={addBridgeEvent} startPolling={startPolling} />
      )}
      {screen === 'waiting' && (
        <OrderWaitingScreen orderId={param} demoPath="retail-banking/deposit-switch" webhooks={panel.webhooks} startPolling={startPolling} />
      )}
      {screen === 'results' && (
        <OrderResultsScreen orderId={param} onBack={() => { reset(); setIntroStep(1); navigate('retail-banking/deposit-switch'); }} backLabel="New Request" />
      )}
      {!screen && (
        introStep === 1 ? (
          <div class="intro-slide">
            <div class="relative z-10 w-full max-w-2xl mx-auto px-4">
              <div class="animate-slideUp">
                <div class="text-[12px] font-medium uppercase tracking-[0.08em] text-primary mb-4">Direct Deposit Switch</div>
                <h2 class="text-[36px] font-semibold tracking-[-0.03em] leading-[1.1] text-[#1d1d1f] mb-4">Switch direct deposit routing</h2>
                <p class="text-[17px] text-[#86868b] leading-[1.5] max-w-[440px] mx-auto mb-7">
                  Connect to a payroll provider and switch the direct deposit destination to a new account.
                </p>
              </div>
              <div class="animate-slideUp delay-2">
                <button
                  onClick={() => setIntroStep(2)}
                  class="w-full max-w-xs mx-auto block py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover"
                >
                  View Architecture
                </button>
              </div>
            </div>
          </div>
        ) : introStep === 2 ? (
          <IntroSlide
            label="Direct Deposit Switch"
            title="Architecture"
            subtitle="How the deposit switch flow works end-to-end."
            diagram={DIAGRAM}
          >
            <div class="w-full max-w-xs mx-auto flex gap-3">
              <button onClick={() => setIntroStep(1)} class="flex-1 py-3 border border-[#d2d2d7] text-[#1d1d1f] font-semibold rounded-full hover:bg-[#f5f5f7]">
                Back
              </button>
              <button onClick={() => setIntroStep(3)} class="flex-1 py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover">
                Continue
              </button>
            </div>
          </IntroSlide>
        ) : (
          <div class="max-w-lg mx-auto">
            <ApplicationForm onSubmit={handleSubmit} submitting={submitting} productType="deposit_switch" />
          </div>
        )
      )}
    </Layout>
  );
}
