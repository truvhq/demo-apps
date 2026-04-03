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
  Note right of Truv: data_sources: [financial_accounts]
  Truv-->>App: bridge_token, user_id
  App->>Bridge: TruvBridge.init({ bridgeToken })
  Bridge-->>App: User connects bank account
  Truv->>App: Webhook: order-status-updated
  App->>Truv: POST /v1/users/{user_id}/income_insights/reports/
  Truv-->>App: Income Insights Report`;

const STEPS = [
  {
    title: 'Collect applicant info',
    guide: '<p>The form collects applicant PII and financial institution. An order is created with:</p>'
      + '<pre>POST /v1/orders/</pre>'
      + '<p>The order uses <code>data_sources: ["financial_accounts"]</code> to route through bank account verification.</p>'
      + '<p><a href="https://docs.truv.com/reference/create-an-order" target="_blank">Orders API</a></p>',
  },
  { title: 'Bridge verification', guide: '<p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p><p><a href="https://docs.truv.com/docs/bridge-overview" target="_blank">Bridge Docs →</a></p>' },
  { title: 'Webhook processing', guide: '<p>Truv sends webhooks as the verification progresses.</p><p><a href="https://docs.truv.com/docs/webhooks" target="_blank">Webhooks Docs →</a></p>' },
  { title: 'Retrieve results', guide: '<p>Fetch the income insights report:</p><pre>POST /v1/users/{user_id}/income_insights/reports/</pre><p><a href="https://docs.truv.com/reference/users_reports" target="_blank">Reports API →</a></p>' },
];

export function BankIncomeDemo({ screen, param }) {
  const [introStep, setIntroStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const { panel, setCurrentStep, startPolling, addBridgeEvent, reset } = usePanel();

  useEffect(() => {
    const stepMap = { '': 0, 'bridge': 1, 'waiting': 2, 'results': 3 };
    setCurrentStep(stepMap[screen] ?? 0);
  }, [screen]);

  async function handleSubmit(formData) {
    setSubmitting(true);
    try {
      const resp = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, demo_id: 'bank-income', data_sources: ['financial_accounts'] }),
      });
      const data = await resp.json();
      if (!resp.ok) { alert('Error: ' + (data.error || 'Unknown')); setSubmitting(false); return; }
      navigate(`consumer-credit/bank-income/bridge/${data.order_id}`);
    } catch (e) { console.error(e); }
    setSubmitting(false);
  }

  const isBridge = screen === 'bridge';
  const isIntro = !screen && introStep <= 2;
  const [orderId] = (param || '').split('/');

  return (
    <Layout title="Truv Quickstart" badge="Bank Income" steps={STEPS} panel={panel} flush={isBridge} hidePanel={isIntro}>
      {screen === 'bridge' && (
        <BridgeScreen orderId={orderId} demoPath="consumer-credit/bank-income" addBridgeEvent={addBridgeEvent} startPolling={startPolling} />
      )}
      {screen === 'waiting' && (
        <OrderWaitingScreen orderId={param} demoPath="consumer-credit/bank-income" webhooks={panel.webhooks} startPolling={startPolling} />
      )}
      {screen === 'results' && (
        <OrderResultsScreen orderId={param} onBack={() => { reset(); setIntroStep(1); navigate('consumer-credit/bank-income'); }} backLabel="New Verification" />
      )}
      {!screen && (
        introStep === 1 ? (
          <div class="intro-slide">
            <div class="relative z-10 w-full max-w-2xl mx-auto px-4">
              <div class="animate-slideUp">
                <div class="text-[12px] font-medium uppercase tracking-[0.08em] text-primary mb-4">Bank Income Verification</div>
                <h2 class="text-[36px] font-semibold tracking-[-0.03em] leading-[1.1] text-[#1d1d1f] mb-4">Verify income from bank transactions</h2>
                <p class="text-[17px] text-[#86868b] leading-[1.5] max-w-[440px] mx-auto mb-7">
                  Connect to a bank account and generate an income insights report from transaction data.
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
            label="Bank Income Verification"
            title="Architecture"
            subtitle="How the bank income verification flow works end-to-end."
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
            <ApplicationForm onSubmit={handleSubmit} submitting={submitting} productType="income" employerLabel="Financial institution" />
          </div>
        )
      )}
    </Layout>
  );
}
