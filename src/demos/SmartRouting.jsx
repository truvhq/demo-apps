import { useState, useEffect, useRef } from 'preact/hooks';
import { Layout, WaitingScreen, parsePayload, usePanel, API_BASE, IntroSlide } from '../components/index.js';
import { ApplicationForm } from '../components/ApplicationForm.jsx';
import { VoieReport } from '../components/reports/VoieReport.jsx';
import { IncomeInsightsReport } from '../components/reports/IncomeInsightsReport.jsx';
import { Icons } from '../components/Icons.jsx';

const STEPS = [
  { title: 'Collect applicant info', guide: '<p>The form collects applicant details and employer. Employers are searched via:</p><pre>GET /v1/company-mappings-search/?query=...</pre><p>For financial institutions use:</p><pre>GET /v1/providers/?data_source=financial_accounts</pre><p>The employer is used to determine the recommended verification method.</p>' },
  {
    title: 'Choose verification method',
    guide: '<p>Company search checks payroll coverage:</p>'
      + '<pre>GET /v1/company-mappings-search/?query=employer</pre>'
      + '<p>Based on <code>success_rate</code>:</p>'
      + '<ul><li><b>high</b> → Payroll recommended</li>'
      + '<li><b>low</b> → Bank recommended</li>'
      + '<li><b>unsupported/null</b> → Documents recommended</li></ul>'
      + '<p>The user can override and pick any method.</p>',
  },
  { title: 'Connect via Bridge', guide: '<p>Bridge opens as a popup with the selected data source.</p><p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p>' },
  { title: 'Webhook processing', guide: '<p>Truv sends webhooks as the verification progresses. Wait for <code>task-status-updated</code> with status <code>done</code>.</p>' },
  { title: 'Review results', guide: '<p>The public token is exchanged for a link report:</p><pre>POST /v1/link-access-tokens/\nGET /v1/links/{link_id}/{product}/report</pre>' },
];

const DIAGRAM = `sequenceDiagram
  participant App as Your App
  participant Truv as Truv API
  participant Bridge as Truv Bridge
  App->>Truv: GET /v1/company-mappings-search/?query=employer
  Truv-->>App: results with success_rate
  App->>App: Recommend method based on success_rate
  App->>App: User confirms or overrides
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
  App->>Truv: GET /v1/links/{link_id}/income/report
  Truv-->>App: Verification report`;

const METHODS = [
  { id: 'payroll', name: 'Payroll Income', desc: 'Connect to payroll provider for verified income and employment data', Icon: Icons.briefcase, color: 'icon-box-blue', dataSources: ['payroll'], reportType: 'income' },
  { id: 'bank', name: 'Bank Transactions', desc: 'Connect bank account for transaction-based income insights', Icon: Icons.bankBuilding, color: 'icon-box-emerald', dataSources: ['financial_accounts'], reportType: 'income' },
  { id: 'documents', name: 'Upload Documents', desc: 'Upload pay stubs, W-2s, or tax returns for document-based verification', Icon: Icons.upload, color: 'icon-box-amber', dataSources: ['docs'], reportType: 'income' },
];

export function SmartRoutingDemo() {
  const [screen, setScreen] = useState('select');
  const [introStep, setIntroStep] = useState(1);
  const [formData, setFormData] = useState(null);
  const [recommended, setRecommended] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState(null);
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
    setScreen('choose');

    try {
      const employer = data.employer || '';
      const resp = await fetch(`${API_BASE}/api/companies?q=${encodeURIComponent(employer)}&product_type=income`);
      const companies = await resp.json();
      const top = Array.isArray(companies) && companies.length > 0 ? companies[0] : null;

      if (top?.success_rate === 'high') {
        setRecommended('payroll');
      } else if (top?.success_rate === 'low') {
        setRecommended('bank');
      } else {
        setRecommended('documents');
      }
    } catch (e) {
      console.error(e);
      setRecommended('documents');
    }
    setLoading(false);
  }

  async function handleMethodSelect(method) {
    setSelectedMethod(method);
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/bridge-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_type: method.reportType, data_sources: method.dataSources, company_mapping_id: formData?.company_mapping_id }),
      });
      const data = await resp.json();
      if (!resp.ok) { alert('Error: ' + (data.error || 'Unknown')); setLoading(false); return; }

      setUserId(data.user_id);
      startPolling(data.user_id);
      setCurrentStep(2);

      if (window.TruvBridge) {
        const opts = {
          bridgeToken: data.bridge_token,
          onSuccess: (t) => { setPublicToken(t); setCurrentStep(3); setScreen('waiting'); },
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
      setCurrentStep(4);
      setScreen('review');
      (async () => {
        try {
          const rt = selectedMethod?.reportType || 'income';
          const resp = await fetch(`${API_BASE}/api/link-report/${encodeURIComponent(publicToken)}/${rt}?user_id=${userId}`);
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
    setRecommended(null);
    setSelectedMethod(null);
    setUserId(null);
    setPublicToken(null);
    setReportData(null);
  }

  const isIntro = screen === 'select' && introStep <= 2;

  return (
    <Layout title="Truv Quickstart" badge="Smart Routing" steps={STEPS} panel={panel} hidePanel={isIntro}>
      <div class={isIntro ? 'flex-1 flex flex-col' : 'max-w-lg mx-auto px-8 py-10'}>
        {/* Intro step 1 */}
        {screen === 'select' && introStep === 1 && (
          <div class="intro-slide">
            <div class="relative z-10 w-full max-w-2xl mx-auto px-4">
              <div class="animate-slideUp">
                <div class="text-[12px] font-medium uppercase tracking-[0.08em] text-primary mb-4">Smart Routing</div>
                <h2 class="text-[36px] font-semibold tracking-[-0.03em] leading-[1.1] text-[#1d1d1f] mb-4">Route to the best<br />verification method</h2>
                <p class="text-[17px] text-[#86868b] leading-[1.5] max-w-[440px] mx-auto mb-7">
                  The system checks the employer's payroll coverage and recommends the best method — but the user can always choose.
                </p>
              </div>
              <div class="grid gap-3 mb-8 text-left max-w-lg mx-auto animate-slideUp delay-1">
                {METHODS.map(m => (
                  <div key={m.id} class="border border-[#d2d2d7]/60 rounded-2xl px-5 py-4 bg-white/80 backdrop-blur-sm">
                    <div class="flex items-center gap-3 mb-1">
                      <div class={`icon-box ${m.color}`}><m.Icon size={18} /></div>
                      <h3 class="text-[14px] font-semibold text-[#1d1d1f]">{m.name}</h3>
                    </div>
                    <p class="text-[13px] text-[#6e6e73] leading-[1.4]">{m.desc}</p>
                  </div>
                ))}
              </div>
              <div class="animate-slideUp delay-2">
                <button onClick={() => setIntroStep(2)} class="w-full max-w-xs mx-auto block py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover">Get started →</button>
              </div>
            </div>
          </div>
        )}

        {/* Intro step 2 — architecture */}
        {screen === 'select' && introStep === 2 && (
          <IntroSlide label="Smart Routing → Architecture" title="Confidence-based routing" subtitle="Company search determines the recommended path. The user can override the recommendation." diagram={DIAGRAM}>
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

        {/* Method choice with recommendation */}
        {screen === 'choose' && (
          <div>
            {loading && !recommended ? (
              <div class="text-center py-16">
                <div class="w-12 h-12 border-[3px] border-[#d2d2d7] border-t-primary rounded-full animate-spin mx-auto mb-6" />
                <h2 class="text-2xl font-semibold tracking-tight mb-2">Checking coverage...</h2>
                <p class="text-[15px] text-[#86868b]">Evaluating payroll coverage for the employer</p>
              </div>
            ) : (
              <>
                <h2 class="text-2xl font-bold tracking-tight mb-1.5">Choose verification method</h2>
                <p class="text-sm text-gray-500 leading-relaxed mb-7">Based on employer coverage, we recommend a method — but you can pick any.</p>
                <div class="grid gap-3">
                  {METHODS.map(m => {
                    const isRecommended = m.id === recommended;
                    return (
                      <button
                        key={m.id}
                        onClick={() => handleMethodSelect(m)}
                        disabled={loading}
                        class={`border rounded-2xl px-6 py-5 text-left cursor-pointer transition-all duration-200 disabled:opacity-40 ${
                          isRecommended
                            ? 'border-primary bg-[#f5f8ff] shadow-sm'
                            : 'border-[#d2d2d7] hover:border-primary hover:bg-[#f5f8ff]'
                        }`}
                      >
                        <div class="flex items-center gap-3 mb-1">
                          <div class="w-9 h-9 rounded-lg bg-[#f5f5f7] border border-[#e8e8ed] flex items-center justify-center text-[#6e6e73]"><m.Icon size={18} /></div>
                          <h3 class="text-[15px] font-semibold text-[#1d1d1f]">{m.name}</h3>
                          {isRecommended && (
                            <span class="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Recommended</span>
                          )}
                        </div>
                        <p class="text-[14px] text-[#6e6e73] leading-[1.5]">{m.desc}</p>
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => { setFormData(null); setRecommended(null); setScreen('select'); setIntroStep(3); }} class="mt-6 text-sm text-[#86868b] hover:text-primary">
                  &larr; Back to application
                </button>
              </>
            )}
          </div>
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
