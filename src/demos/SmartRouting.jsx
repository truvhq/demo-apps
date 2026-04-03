// SmartRouting.jsx — Consumer Credit demo: Smart Routing
//
// This is the CANONICAL example for Consumer Credit demos using the Bridge
// (User+Token) flow. Other demos (BankIncome, PayrollIncome, etc.) follow
// the same pattern with fewer screens.
//
// SCREEN STATE MACHINE:
//   'select' (!showForm)   → Intro slide with method cards + architecture diagram (fullscreen, no panel)
//   'select' (showForm)    → Application form (with panel)
//   'choose'               → Method picker with "Recommended" tag (with panel)
//   'waiting'              → Webhook waiting spinner (with panel)
//   'review'               → Report results (with panel)
//
// API FLOW:
//   1. GET /api/companies?q=... → check success_rate for routing recommendation
//   2. POST /api/bridge-token   → create user + bridge token with data_sources
//   3. TruvBridge.init().open() → Bridge popup (employer deeplinked via server-side company_mapping_id)
//   4. Wait for task-status-updated webhook with status "done"
//   5. GET /api/users/:userId/reports/:reportType → fetch verification report

import { useState, useEffect, useRef } from 'preact/hooks';
import { Layout, WaitingScreen, parsePayload, usePanel, API_BASE, IntroSlide } from '../components/index.js';
import { ApplicationForm } from '../components/ApplicationForm.jsx';
import { VoieReport } from '../components/reports/VoieReport.jsx';
import { IncomeInsightsReport } from '../components/reports/IncomeInsightsReport.jsx';
import { Icons } from '../components/Icons.jsx';

// STEPS: sidebar Guide tab content. Each step highlights when setCurrentStep(index) is called.
const STEPS = [
  { title: 'Applicant submits information', guide: '<p>The form collects applicant details and employer. Employers are searched via:</p><pre>GET /v1/company-mappings-search/?query=...</pre><p>For financial institutions (banks) use:</p><pre>GET /v1/providers/?data_source=financial_accounts</pre><p><b>Key distinction:</b> Payroll employers return <code>company_mapping_id</code>. Banks return <code>provider_id</code>. Pass the correct one when creating a bridge token to deeplink Bridge to that institution.</p><p>The employer is used to determine the recommended verification method.</p>' },
  {
    title: 'System recommends method',
    guide: '<p>Company search checks payroll coverage:</p>'
      + '<pre>GET /v1/company-mappings-search/?query=employer</pre>'
      + '<p>Based on <code>success_rate</code>:</p>'
      + '<ul><li><b>high</b> → Payroll recommended</li>'
      + '<li><b>low / medium / other</b> → Bank recommended</li>'
      + '<li><b>no results</b> → Documents (fallback)</li></ul>'
      + '<p>The applicant can override and pick any method.</p>',
  },
  { title: 'Applicant connects via Bridge', guide: '<p>Bridge opens as a popup with the selected data source.</p><p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p>' },
  { title: 'Truv processes verification', guide: '<p>Truv sends webhooks as the verification progresses. Wait for <code>task-status-updated</code> with status <code>done</code>.</p>' },
  { title: 'Team Member reviews report', guide: '<p>The report is fetched via the user reports endpoint:</p><pre>POST /v1/users/{user_id}/reports/\nor\nPOST /v1/users/{user_id}/income_insights/reports/</pre>' },
];

const DIAGRAM = `sequenceDiagram
  participant App as Lending Platform
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
  App->>Truv: POST /v1/link-access-tokens/
  Truv-->>App: access_token
  Truv->>App: Webhook: task-status-updated (done)
  App->>Truv: POST /v1/users/{user_id}/reports/
  Truv-->>App: Verification report`;

// METHODS: verification method cards shown on the 'choose' screen.
// The `dataSources` array is sent to POST /api/bridge-token to control what Bridge shows.
// `productType` is the Truv product_type sent when creating the bridge token.
// `reportType` determines which user report endpoint to call after verification.
const METHODS = [
  { id: 'payroll', name: 'Payroll Income', desc: 'Connect to payroll provider for verified income and employment data', Icon: Icons.briefcase, color: 'icon-box-blue', dataSources: ['payroll'], productType: 'income', reportType: 'income' },
  { id: 'bank', name: 'Bank Transactions', desc: 'Connect bank account for transaction-based income insights', Icon: Icons.bankBuilding, color: 'icon-box-emerald', dataSources: ['financial_accounts'], productType: 'income', reportType: 'income_insights' },
  { id: 'documents', name: 'Upload Documents', desc: 'Upload pay stubs, W-2s, or tax returns for document-based verification', Icon: Icons.upload, color: 'icon-box-amber', dataSources: ['docs'], productType: 'income', reportType: 'income' },
];

export function SmartRoutingDemo() {
  const [screen, setScreen] = useState('select');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(null);
  const [recommended, setRecommended] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [userId, setUserId] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  const { panel, sessionId, setCurrentStep, startPolling, addBridgeEvent, reset } = usePanel();

  // After the application form is submitted, check the employer's payroll coverage
  // using the company search API. The success_rate field determines the recommendation.
  // See: https://docs.truv.com/reference/company_autocomplete_search
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

      if (!top) {
        setRecommended('documents');
      } else if (top.success_rate === 'high') {
        setRecommended('payroll');
      } else {
        setRecommended('bank');
      }
    } catch (e) {
      console.error(e);
      setRecommended('documents');
    }
    setLoading(false);
  }

  // When the user picks a method, create a bridge token and open Bridge immediately.
  // The data_sources param restricts which providers Bridge shows (payroll, financial_accounts, or docs).
  // See: https://docs.truv.com/reference/users_tokens
  async function handleMethodSelect(method) {
    setSelectedMethod(method);
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/bridge-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Only pass company_mapping_id for payroll methods — it deeplinks Bridge to that employer.
        // Bank and document methods don't use it (Bridge shows its own provider search).
        body: JSON.stringify({
          product_type: method.productType,
          data_sources: method.dataSources,
          ...(method.id === 'payroll' && formData?.company_mapping_id ? { company_mapping_id: formData.company_mapping_id } : {}),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) { alert('Error: ' + (data.error || 'Unknown')); setLoading(false); return; }

      setUserId(data.user_id);
      startPolling(data.user_id);
      setCurrentStep(2);

      if (window.TruvBridge) {
        const opts = {
          bridgeToken: data.bridge_token,
          onSuccess: () => { setCurrentStep(3); setScreen('waiting'); },
          onEvent: (name, d) => addBridgeEvent(name, d),
        };
        window.TruvBridge.init(opts).open();
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  // Watch for the task-status-updated webhook with status "done".
  // Once it arrives, fetch the report via the user reports endpoint.
  // fetchedRef prevents double-fetching when webhooks array updates multiple times.
  useEffect(() => {
    if (screen !== 'waiting' || !userId || fetchedRef.current) return;
    const done = panel.webhooks.some(w => {
      const p = parsePayload(w.payload);
      return (p.event_type === 'task-status-updated' && p.status === 'done')
        || (w.event_type === 'task-status-updated' && w.status === 'done');
    });
    if (done) {
      setCurrentStep(4);
      setScreen('review');
      (async () => {
        try {
          const rt = selectedMethod?.reportType || 'income';
          const resp = await fetch(`${API_BASE}/api/users/${encodeURIComponent(userId)}/reports/${rt}`);
          if (resp.ok) { fetchedRef.current = true; setReportData(await resp.json()); }
        } catch (e) { console.error(e); }
      })();
    }
  }, [panel.webhooks, screen, userId]);

  function resetDemo() {
    reset();
    fetchedRef.current = false;
    setScreen('select');
    setShowForm(false);
    setFormData(null);
    setRecommended(null);
    setSelectedMethod(null);
    setUserId(null);
    setReportData(null);
  }

  const isIntro = screen === 'select' && !showForm;

  return (
    <Layout badge="Smart Routing" steps={STEPS} panel={panel} hidePanel={isIntro}>
      <div class={isIntro ? 'flex-1 flex flex-col' : 'max-w-lg mx-auto px-8 py-10'}>
        {/* Intro — method cards + architecture diagram */}
        {screen === 'select' && !showForm && (
          <IntroSlide
            label="Consumer Credit · Smart Routing"
            title={<>Find the fastest<br />verification path</>}
            subtitle="The system checks the applicant's employer payroll coverage and recommends the fastest path: payroll, bank transactions, or document upload. The applicant can accept or override."
            diagram={DIAGRAM}
            actions={
              <button onClick={() => setShowForm(true)} class="w-full max-w-xs block py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover">
                Get started
              </button>
            }
          >
            <div class="grid gap-3 text-left">
              {METHODS.map(m => (
                <div key={m.id} class="border border-[#d2d2d7]/60 rounded-2xl px-5 py-4 bg-white/80 backdrop-blur-sm">
                  <div class="flex items-center gap-3 mb-1">
                    <div class={`icon-box ${m.color}`}><m.Icon size={18} /></div>
                    <h3 class="text-[14px] font-semibold text-[#171717]">{m.name}</h3>
                  </div>
                  <p class="text-[13px] text-[#8E8E93] leading-[1.4]">{m.desc}</p>
                </div>
              ))}
            </div>
          </IntroSlide>
        )}

        {/* Application form */}
        {screen === 'select' && showForm && (
          <div class="max-w-lg mx-auto px-8 py-10">
            <ApplicationForm sessionId={sessionId} onSubmit={handleFormSubmit} submitting={loading} productType="income" />
          </div>
        )}

        {/* Method choice with recommendation */}
        {screen === 'choose' && (
          <div>
            {loading && !recommended ? (
              <div class="text-center py-16">
                <div class="w-12 h-12 border-[3px] border-[#d2d2d7] border-t-primary rounded-full animate-spin mx-auto mb-6" />
                <h2 class="text-2xl font-semibold tracking-tight mb-2">Checking coverage...</h2>
                <p class="text-[15px] text-[#8E8E93]">Evaluating payroll coverage for the employer</p>
              </div>
            ) : (
              <>
                <h2 class="text-2xl font-bold tracking-tight mb-1.5">Choose verification method</h2>
                <p class="text-sm text-gray-500 leading-relaxed mb-7">Based on employer coverage, we recommend a method. You can pick any.</p>
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
                          <div class="w-9 h-9 rounded-lg bg-[#f5f5f7] border border-[#e8e8ed] flex items-center justify-center text-[#8E8E93]"><m.Icon size={18} /></div>
                          <h3 class="text-[15px] font-semibold text-[#171717]">{m.name}</h3>
                          {isRecommended && (
                            <span class="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Recommended</span>
                          )}
                        </div>
                        <p class="text-[14px] text-[#8E8E93] leading-[1.5]">{m.desc}</p>
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => { setFormData(null); setRecommended(null); setScreen('select'); setShowForm(true); }} class="mt-6 text-sm text-[#8E8E93] hover:text-primary">
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
