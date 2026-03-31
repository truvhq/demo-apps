import { useState, useEffect } from 'preact/hooks';
import { Layout, usePanel, API_BASE, IntroSlide } from '../components/index.js';
import { CompanySearch } from '../components/CompanySearch.jsx';
import { BridgeScreen, OrderWaitingScreen, OrderResultsScreen } from '../components/screens/index.js';
import { navigate } from '../App.jsx';

const STEPS = [
  {
    title: 'Collect applicant info',
    guide: '<p>The form collects applicant PII and employer. Companies are searched via:</p>'
      + '<pre>GET /v1/company-mappings-search/?query=...</pre>'
      + '<p>Then an order is created:</p><pre>POST /v1/orders/</pre>'
      + '<p><a href="https://docs.truv.com/reference/company_autocomplete_search" target="_blank">Company Search →</a> • <a href="https://docs.truv.com/reference/create-an-order" target="_blank">Orders →</a></p>',
  },
  { title: 'Bridge verification', guide: '<p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p><p><a href="https://docs.truv.com/docs/bridge-overview" target="_blank">Bridge Docs →</a></p>' },
  { title: 'Webhook processing', guide: '<p>Truv sends webhooks as the verification progresses.</p><p><a href="https://docs.truv.com/docs/webhooks" target="_blank">Webhooks Docs →</a></p>' },
  { title: 'Retrieve results', guide: '<p>Fetch reports:</p><pre>POST /v1/users/{user_id}/reports/</pre><p><a href="https://docs.truv.com/reference/users_reports" target="_blank">Reports API →</a></p>' },
];


export function ApplicationDemo({ screen, param }) {
  const [productType, setProductType] = useState(null);
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
        body: JSON.stringify({ ...formData, demo_id: 'application' }),
      });
      const data = await resp.json();
      if (!resp.ok) { alert('Error: ' + (data.error || 'Unknown')); setSubmitting(false); return; }
      const cmid = formData.company_mapping_id;
      navigate(`application/bridge/${data.order_id}${cmid ? '/' + cmid : ''}`);
    } catch (e) { console.error(e); }
    setSubmitting(false);
  }

  const isBridge = screen === 'bridge';
  const isIntro = !screen && !productType;
  const [orderId, companyMappingId] = (param || '').split('/');

  return (
    <Layout title="Truv Quickstart" badge="New Application" steps={STEPS} panel={panel} flush={isBridge} hidePanel={isIntro}>
      {screen === 'bridge' && (
        <BridgeScreen orderId={orderId} demoPath="application" companyMappingId={companyMappingId} addBridgeEvent={addBridgeEvent} startPolling={startPolling} />
      )}
      {screen === 'waiting' && (
        <OrderWaitingScreen orderId={param} demoPath="application" webhooks={panel.webhooks} startPolling={startPolling} />
      )}
      {screen === 'results' && (
        <OrderResultsScreen orderId={param} onBack={() => { reset(); setProductType(null); navigate('application'); }} backLabel="New Application" />
      )}
      {!screen && (
        productType ? (
          <div class="max-w-lg mx-auto">
            <ApplicationForm onSubmit={handleSubmit} submitting={submitting} productType={productType} />
          </div>
        ) : (
          <IntroScreen onStart={setProductType} />
        )
      )}
    </Layout>
  );
}

const PRODUCTS = [
  {
    id: 'income',
    name: 'Income Verification',
    desc: 'Verify pay history, earnings, and employment income from payroll data.',
    useCase: 'Loan underwriting, rental applications, benefits eligibility',
    report: 'VOIE Report',
  },
  {
    id: 'employment',
    name: 'Employment Verification',
    desc: 'Verify job title, employer, employment status, and tenure.',
    useCase: 'Background checks, mortgage pre-approval, I-9 compliance',
    report: 'VOE Report',
  },
  {
    id: 'assets',
    name: 'Assets Verification',
    desc: 'Verify bank account balances, transactions, and deposit history.',
    useCase: 'Mortgage qualification, proof of funds, account ownership',
    report: 'VOA + Income Insights',
  },
];

const DIAGRAMS = {
  income: `sequenceDiagram
  participant App as Your App
  participant Bridge as Truv Bridge
  participant Backend as Your Backend
  participant Truv as Truv Backend
  App->>Backend: Submit applicant info
  Backend->>Truv: GET /v1/company-mappings-search/
  Truv-->>Backend: company_mapping_id
  Backend->>Truv: POST /v1/orders/
  Note right of Truv: PII + employer + products: ["income"]
  Truv-->>Backend: bridge_token, user_id
  Backend-->>App: bridge_token
  App->>Bridge: TruvBridge.init({ bridgeToken })
  Bridge-->>App: User logs in with employer
  Truv->>Backend: Webhook: order-status-updated (completed)
  Backend->>Truv: POST /v1/users/{user_id}/reports/
  Note right of Truv: { is_voe: false }
  Truv-->>Backend: VOIE Report (income + employment data)`,
  employment: `sequenceDiagram
  participant App as Your App
  participant Bridge as Truv Bridge
  participant Backend as Your Backend
  participant Truv as Truv Backend
  App->>Backend: Submit applicant info
  Backend->>Truv: GET /v1/company-mappings-search/
  Truv-->>Backend: company_mapping_id
  Backend->>Truv: POST /v1/orders/
  Note right of Truv: PII + employer + products: ["employment"]
  Truv-->>Backend: bridge_token, user_id
  Backend-->>App: bridge_token
  App->>Bridge: TruvBridge.init({ bridgeToken })
  Bridge-->>App: User logs in with employer
  Truv->>Backend: Webhook: order-status-updated (completed)
  Backend->>Truv: POST /v1/users/{user_id}/reports/
  Note right of Truv: { is_voe: true }
  Truv-->>Backend: VOE Report (employment data)`,
  assets: `sequenceDiagram
  participant App as Your App
  participant Bridge as Truv Bridge
  participant Backend as Your Backend
  participant Truv as Truv Backend
  App->>Backend: Submit applicant info
  Backend->>Truv: GET /v1/company-mappings-search/
  Truv-->>Backend: company_mapping_id (bank)
  Backend->>Truv: POST /v1/orders/
  Note right of Truv: PII + products: ["assets"]
  Truv-->>Backend: bridge_token, user_id
  Backend-->>App: bridge_token
  App->>Bridge: TruvBridge.init({ bridgeToken, companyMappingId })
  Bridge-->>App: User connects bank account
  Truv->>Backend: Webhook: order-status-updated (completed)
  Backend->>Truv: POST /v1/users/{user_id}/assets/reports/
  Truv-->>Backend: VOA Report (balances + transactions)
  Backend->>Truv: POST /v1/users/{user_id}/income_insights/reports/
  Truv-->>Backend: Income Insights Report`,
};

function IntroScreen({ onStart }) {
  const [selected, setSelected] = useState(null);
  const [step, setStep] = useState(1);

  if (step === 2 && selected) {
    return (
      <IntroSlide
        label={`New Application → ${PRODUCTS.find(p => p.id === selected)?.name}`}
        title="Architecture"
        subtitle={`How the ${selected} verification flow works end-to-end.`}
        diagram={DIAGRAMS[selected]}
      >
        <div class="w-full max-w-xs mx-auto flex gap-3">
          <button onClick={() => setStep(1)} class="flex-1 py-3 border border-[#d2d2d7] text-[#1d1d1f] font-semibold rounded-full hover:bg-[#f5f5f7]">
            Back
          </button>
          <button onClick={() => onStart(selected)} class="flex-1 py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover">
            Continue
          </button>
        </div>
      </IntroSlide>
    );
  }

  return (
    <div class="intro-slide">
      <div class="relative z-10 w-full max-w-2xl mx-auto px-4">
        <div class="animate-slideUp">
          <div class="text-[12px] font-medium uppercase tracking-[0.08em] text-primary mb-4">New Application Flow</div>
          <h2 class="text-[36px] font-semibold tracking-[-0.03em] leading-[1.1] text-[#1d1d1f] mb-4">Verify income, employment,<br />or assets</h2>
          <p class="text-[17px] text-[#86868b] leading-[1.5] max-w-[440px] mx-auto mb-7">
            The user fills in their details, selects their employer or bank, and completes verification through Bridge.
          </p>
        </div>

        <div class="grid gap-3 mb-8 text-left animate-slideUp delay-1">
          {PRODUCTS.map(p => (
            <div
              key={p.id}
              onClick={() => setSelected(p.id)}
              class={`border rounded-2xl px-6 py-5 cursor-pointer transition-all duration-200 ${
                selected === p.id
                  ? 'border-primary bg-[#f5f8ff] shadow-sm'
                  : 'border-[#d2d2d7] hover:border-[#86868b] bg-white'
              }`}
            >
              <div class="flex items-start justify-between mb-1">
                <h3 class="text-[15px] font-semibold text-[#1d1d1f]">{p.name}</h3>
                <span class="text-[11px] font-medium text-[#86868b] bg-[#f5f5f7] px-2 py-0.5 rounded-md font-mono">{p.report}</span>
              </div>
              <p class="text-[14px] text-[#6e6e73] leading-[1.5] mb-2">{p.desc}</p>
              <p class="text-[12px] text-[#86868b]">{p.useCase}</p>
            </div>
          ))}
        </div>

        <div class="animate-slideUp delay-2">
          <button
            onClick={() => selected && setStep(2)}
            disabled={!selected}
            class="w-full max-w-xs mx-auto block py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover disabled:opacity-40"
          >
            View Architecture
          </button>
        </div>
      </div>
    </div>
  );
}


function ApplicationForm({ onSubmit, submitting, productType }) {
  const [agree, setAgree] = useState(true);
  const [employer, setEmployer] = useState({ name: '', id: null });
  const isAssets = productType === 'assets';

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!agree) return;
    if (!isAssets && !employer.name) return;
    const fd = new FormData(e.target);
    onSubmit({
      first_name: fd.get('first_name') || undefined,
      last_name: fd.get('last_name') || undefined,
      email: fd.get('email') || undefined,
      phone: fd.get('phone') || undefined,
      ssn: fd.get('ssn') || undefined,
      product_type: productType,
      employer: employer.name || undefined,
      company_mapping_id: employer.id || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2 class="text-2xl font-bold tracking-tight mb-1.5">Your information</h2>
      <p class="text-sm text-gray-500 leading-relaxed mb-7">Enter your details to start the verification process.</p>
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div><label class="text-sm font-medium mb-1.5 block">First name</label><input name="first_name" placeholder="Joe" class="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:border-primary focus:outline-none" /></div>
        <div><label class="text-sm font-medium mb-1.5 block">Last name</label><input name="last_name" placeholder="Doe" class="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:border-primary focus:outline-none" /></div>
      </div>
      <div class="mb-4">
        <label class="text-sm font-medium mb-1.5 block">{isAssets ? 'Financial institution' : 'Employer'}</label>
        <CompanySearch value={employer.name} onChange={setEmployer} productType={productType} placeholder={isAssets ? 'Search for bank or institution...' : 'Search for employer...'} />
        <p class="text-xs text-gray-400 mt-1">Search uses <code>GET /v1/company-mappings-search/</code></p>
      </div>
      <div class="mb-4"><label class="text-sm font-medium mb-1.5 block">Email</label><input name="email" type="email" placeholder="joe@example.com" class="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:border-primary focus:outline-none" /></div>
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div><label class="text-sm font-medium mb-1.5 block">Phone</label><input name="phone" type="tel" placeholder="123456789" class="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:border-primary focus:outline-none" /></div>
        <div><label class="text-sm font-medium mb-1.5 block">SSN (last 4)</label><input name="ssn" placeholder="6789" class="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:border-primary focus:outline-none" /></div>
      </div>
      <label class="flex items-center gap-2.5 my-6 cursor-pointer text-sm text-gray-500">
        <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} class="w-4.5 h-4.5 accent-primary" />
        I agree to the Terms of Service
      </label>
      <button type="submit" disabled={!agree || (!isAssets && !employer.name) || submitting} class="w-full py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover disabled:opacity-40">
        {submitting ? <span class="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Continue'}
      </button>
    </form>
  );
}

