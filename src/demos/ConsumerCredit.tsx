import { useState } from 'preact/hooks';
import { Layout, OrderResults, usePanel, API_BASE, IntroSlide } from '../components/index';

interface DemoProps {
  screen: string;
  param: string;
}

const STEPS = [
  { title: 'Select verification method', guide: '<p>Choose the verification type. The backend creates a user and generates a Bridge token:</p><pre>POST /v1/users/\nPOST /v1/users/{id}/tokens/</pre><p>Each type unlocks different data (employment, income, deposit routing, etc.).</p>' },
  { title: 'Connect via Bridge', guide: '<p>Bridge opens as a popup. The user selects their employer and logs in.</p><p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p><p>On success, Bridge returns a <code>public_token</code> that gets exchanged for an access token.</p>' },
  { title: 'Review results', guide: '<p>The public token is exchanged for a link report:</p><pre>POST /v1/link-access-tokens/\nGET /v1/links/{link_id}/{product}/report</pre><p>The report contains the full verification data.</p>' },
];

const PRODUCTS = [
  { id: 'income', name: 'Income', desc: 'Verify earnings and pay history', useCase: 'Loan underwriting, benefits' },
  { id: 'deposit_switch', name: 'Direct Deposit', desc: 'Switch direct deposit routing', useCase: 'Neobanks, payroll cards' },
  { id: 'pll', name: 'Paycheck-Linked Lending', desc: 'Set up payroll deductions', useCase: 'Earned wage access, lending' },
];

const CC_DIAGRAM = `sequenceDiagram
  participant App as Your App
  participant Truv as Truv API
  participant Bridge as Truv Bridge
  App->>Truv: POST /v1/users/
  Truv-->>App: user_id
  App->>Truv: POST /v1/users/{user_id}/tokens/
  Note right of Truv: { product_type, client_name }
  Truv-->>App: bridge_token
  App->>Bridge: TruvBridge.init({ bridgeToken })
  Bridge-->>App: onSuccess(public_token)
  App->>Truv: POST /v1/link-access-tokens/
  Note right of Truv: { public_token }
  Truv-->>App: link_id
  App->>Truv: GET /v1/links/{link_id}/{product}/report
  Truv-->>App: Verification report`;

export function ConsumerCreditDemo(_: DemoProps) {
  const [screen, setScreen] = useState('select');
  const [introStep, setIntroStep] = useState(1);
  const [productType, setProductType] = useState<string | null>(null);
  const [bridgeToken, setBridgeToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [reportData, setReportData] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const { panel, setCurrentStep, startPolling, addBridgeEvent, reset } = usePanel();

  async function getBridgeToken() {
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/bridge-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_type: productType }),
      });
      const data = await resp.json() as { bridge_token?: string; user_id?: string; error?: string };
      if (!resp.ok) { alert('Error: ' + (data.error ?? 'Unknown')); setLoading(false); return; }

      setBridgeToken(data.bridge_token ?? null);
      setUserId(data.user_id ?? null);
      if (data.user_id) startPolling(data.user_id);
      setCurrentStep(1);
      setScreen('connect');
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function onBridgeSuccess(publicToken: string) {
    setCurrentStep(2);
    setScreen('review');
    try {
      const resp = await fetch(`${API_BASE}/api/link-report/${encodeURIComponent(publicToken)}/${productType}?user_id=${userId}`);
      setReportData(await resp.json());
    } catch (e) { console.error(e); }
  }

  function resetDemo() {
    reset();
    setScreen('select');
    setIntroStep(1);
    setProductType(null);
    setBridgeToken(null);
    setUserId(null);
    setReportData(null);
  }

  const isIntro = screen === 'select';

  return (
    <Layout title="Truv Quickstart" badge="Consumer Credit" steps={STEPS} panel={panel} hidePanel={isIntro}>
      <div class={isIntro ? '' : 'max-w-lg mx-auto px-8 py-10'}>
        {screen === 'select' && introStep === 2 && productType && (
          <IntroSlide
            label={`Consumer Credit → ${PRODUCTS.find(p => p.id === productType)?.name ?? ''}`}
            title="Architecture"
            subtitle="Uses the User + Bridge Token flow — no orders. The public token is exchanged for a link report."
            diagram={CC_DIAGRAM}
          >
            <div class="w-full max-w-xs mx-auto flex gap-3">
              <button onClick={() => setIntroStep(1)} class="flex-1 py-3 border border-[#d2d2d7] text-[#1d1d1f] font-semibold rounded-full hover:bg-[#f5f5f7]">
                Back
              </button>
              <button onClick={getBridgeToken} disabled={loading} class="flex-1 py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover disabled:opacity-40">
                {loading ? 'Creating...' : 'Continue'}
              </button>
            </div>
          </IntroSlide>
        )}

        {screen === 'select' && introStep === 1 && (
          <div class="intro-slide">
            <div class="relative z-10 w-full max-w-2xl mx-auto px-4">
              <div class="animate-slideUp">
                <div class="text-[12px] font-medium uppercase tracking-[0.08em] text-primary mb-4">Consumer Credit Application</div>
                <h2 class="text-[36px] font-semibold tracking-[-0.03em] leading-[1.1] text-[#1d1d1f] mb-4">Bundle multiple products<br />into one flow</h2>
                <p class="text-[17px] text-[#86868b] leading-[1.5] max-w-[440px] mx-auto mb-7">
                  Combine income verification, direct deposit switching, and payroll-linked lending in a single UI — no orders needed, just Bridge.
                </p>
              </div>

              <div class="grid gap-3 mb-8 text-left animate-slideUp delay-1">
                {PRODUCTS.map(p => (
                  <div
                    key={p.id}
                    onClick={() => setProductType(p.id)}
                    class={`border rounded-2xl px-6 py-5 cursor-pointer transition-all duration-200 ${
                      productType === p.id
                        ? 'border-primary bg-[#f5f8ff] shadow-sm'
                        : 'border-[#d2d2d7] hover:border-[#86868b] bg-white'
                    }`}
                  >
                    <div class="flex items-start justify-between mb-1">
                      <h3 class="text-[15px] font-semibold text-[#1d1d1f]">{p.name}</h3>
                    </div>
                    <p class="text-[14px] text-[#6e6e73] leading-[1.5] mb-2">{p.desc}</p>
                    <p class="text-[12px] text-[#86868b]">{p.useCase}</p>
                  </div>
                ))}
              </div>

              <div class="animate-slideUp delay-2">
                <button
                  onClick={() => productType && setIntroStep(2)}
                  disabled={!productType}
                  class="w-full max-w-xs mx-auto block py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover disabled:opacity-40"
                >
                  View Architecture
                </button>
              </div>
            </div>
          </div>
        )}

        {screen === 'connect' && (
          <div class="text-center py-12">
            <h2 class="text-2xl font-bold tracking-tight mb-2">Connect via Bridge</h2>
            <p class="text-sm text-gray-500 mb-8">Click below to open Bridge and connect your account.</p>
            <button onClick={() => {
              if (!bridgeToken || !window.TruvBridge) return;
              window.TruvBridge.init({ bridgeToken, onSuccess: (token) => { if (token) onBridgeSuccess(token); } }).open();
            }} class="px-8 py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover text-lg">
              Open Bridge
            </button>
          </div>
        )}

        {screen === 'review' && (
          <div>
            <h2 class="text-2xl font-bold tracking-tight mb-1.5">Verification Report</h2>
            <p class="text-sm text-gray-500 mb-7">{productType} verification</p>
            {reportData ? (
              <div>
                <pre class="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs font-mono overflow-auto max-h-96 whitespace-pre-wrap">{JSON.stringify(reportData, null, 2)}</pre>
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
