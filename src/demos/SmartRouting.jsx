/**
 * FILE SUMMARY: Consumer Credit: Smart Routing demo.
 * INTEGRATION PATTERN: Bridge flow (User+Token) with routing recommendation.
 *
 * DATA FLOW:
 *   1. GET /api/companies?q=...              : check employer success_rate for routing
 *   2. POST /api/bridge-token                : create user + bridge token with data_sources
 *   3. TruvBridge.init().open()              : Bridge popup (deeplinked for payroll)
 *   4. Webhook: task-status-updated with status "done"
 *   5. GET /api/users/:userId/reports/:type  : fetch verification report
 *
 * This is the canonical example for Consumer Credit demos using the Bridge flow.
 * The system checks employer payroll coverage and recommends the fastest path:
 * payroll, bank transactions, or document upload. The applicant can override.
 *
 * Scaffolding: ./scaffolding/smart-routing.jsx
 * Diagrams:    ../diagrams/smart-routing.js
 *
 * WHAT TO COPY (for your own Truv integration):
 *   - handleFormSubmit()    : checks employer coverage via GET /api/companies for routing
 *   - handleMethodSelect()  : creates a bridge token via POST /api/bridge-token
 *   - TruvBridge.init()     : opens the Bridge widget with data_sources
 *   - useReportFetch()      : watches webhooks and fetches reports
 */

// --- Imports: Preact hooks ---
import { useState, useEffect } from 'preact/hooks';

// --- Imports: shared layout, components, hooks, and API base URL ---
import { Layout, WaitingScreen, usePanel, API_BASE, IntroSlide, useReportFetch } from '../components/index.js';

// --- Imports: reusable form component ---
import { ApplicationForm } from '../components/ApplicationForm.jsx';

// --- Imports: report display components ---
import { VoieReport } from '../components/reports/VoieReport.jsx';
import { IncomeInsightsReport } from '../components/reports/IncomeInsightsReport.jsx';

// --- Imports: Mermaid diagram for intro slide ---
import { DIAGRAM } from '../diagrams/smart-routing.js';

// --- Imports: scaffolding (steps, method definitions, intro config, picker components) ---
import { STEPS, METHODS, INTRO_SLIDE_CONFIG, MethodCards, MethodPicker } from './scaffolding/smart-routing.jsx';

// --- Component: SmartRoutingDemo ---
export function SmartRoutingDemo() {
  // Component state: screen phase, form visibility, form data, routing recommendation
  const [screen, setScreen] = useState('select');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(null);
  const [recommended, setRecommended] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(false);

  // Panel hook: sidebar state, session tracking, webhook polling, bridge events
  const { panel, sessionId, setCurrentStep, startPolling, pollOnceAndStop, addBridgeEvent, reset } = usePanel();

  // Report fetching: uses reportType (not productType) because bank method needs
  // income_insights reports. The useReportFetch hook treats products as report type keys.
  const { reports, loading: reportLoading, reset: resetReports } = useReportFetch({
    userId,
    products: selectedMethod ? [selectedMethod.reportType || 'income'] : [],
    webhooks: panel.webhooks,
    pollOnceAndStop,
    webhookEvent: 'task',
    onComplete: () => { setCurrentStep(4); setScreen('review'); },
  });

  // Handler: check employer payroll coverage via GET /api/companies to determine recommendation.
  // success_rate "high" recommends payroll, otherwise bank, no results falls back to documents.
  // See: https://docs.truv.com/reference/company_autocomplete_search
  async function handleFormSubmit(data) {
    setFormData(data);
    setLoading(true);
    setCurrentStep(1);
    setScreen('choose');

    try {
      const employer = data.employer || '';
      const resp = await fetch(`${API_BASE}/api/companies?q=${encodeURIComponent(employer)}&product_type=income&session_id=${encodeURIComponent(sessionId)}`);
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

  // Handler: create bridge token via POST /api/bridge-token and open TruvBridge popup.
  // data_sources restricts which providers Bridge shows (payroll, financial_accounts, or docs).
  // See: https://docs.truv.com/reference/users_tokens
  async function handleMethodSelect(method) {
    setSelectedMethod(method);
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/bridge-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Only pass company_mapping_id for payroll methods. It deeplinks Bridge to that employer.
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

      // Open TruvBridge popup with callbacks for load, success, event, and close
      if (window.TruvBridge) {
        const opts = {
          bridgeToken: data.bridge_token,
          onLoad: () => addBridgeEvent('onLoad()', null),
          onSuccess: (publicToken, meta) => {
            addBridgeEvent('onSuccess(publicToken, meta)', [
              { label: 'publicToken', value: publicToken },
              { label: 'meta', value: meta },
            ]);
            setCurrentStep(3);
            setScreen('waiting');
          },
          onEvent: (type, payload) => {
            const payloadStr = payload ? 'payload' : 'undefined';
            addBridgeEvent(`onEvent("${type}", ${payloadStr})`, payload ? [{ label: 'payload', value: payload }] : null);
          },
          onClose: () => addBridgeEvent('onClose()', null),
        };
        window.TruvBridge.init(opts).open();
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  // Handler: reset all state to start over
  function resetDemo() {
    reset();
    resetReports();
    setScreen('select');
    setShowForm(false);
    setFormData(null);
    setRecommended(null);
    setSelectedMethod(null);
    setUserId(null);
  }

  // Derived state: layout flag
  const isIntro = screen === 'select' && !showForm;

  // --- Render: state-driven screen routing ---
  return (
    <Layout badge="Smart Routing" steps={STEPS} panel={panel} hidePanel={isIntro}>
      <div class={isIntro ? 'flex-1 flex flex-col' : 'max-w-lg mx-auto px-8 py-10'}>
        {/* Intro slide: method cards overview + architecture diagram */}
        {screen === 'select' && !showForm && (
          <IntroSlide
            label={INTRO_SLIDE_CONFIG.label}
            title={<>Find the fastest<br />verification path</>}
            subtitle={INTRO_SLIDE_CONFIG.subtitle}
            diagram={DIAGRAM}
            actions={
              <button onClick={() => setShowForm(true)} class="w-full block py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover">
                Get started
              </button>
            }
          >
            <MethodCards />
          </IntroSlide>
        )}

        {/* Application form: collects applicant PII and employer for coverage check */}
        {screen === 'select' && showForm && (
          <div class="max-w-lg mx-auto px-8 py-10">
            <ApplicationForm sessionId={sessionId} onSubmit={handleFormSubmit} submitting={loading} productType="income" />
          </div>
        )}

        {/* Method picker: shows recommended method based on employer coverage */}
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
                <MethodPicker methods={METHODS} recommended={recommended} onSelect={handleMethodSelect} loading={loading} />
                <button onClick={() => { setFormData(null); setRecommended(null); setScreen('select'); setShowForm(true); }} class="mt-6 text-sm text-[#8E8E93] hover:text-primary">
                  &larr; Back to application
                </button>
              </>
            )}
          </div>
        )}

        {/* Waiting screen: webhook polling spinner until task completes */}
        {screen === 'waiting' && <WaitingScreen webhooks={panel.webhooks} />}

        {/* Review screen: displays income or income_insights report based on method */}
        {screen === 'review' && (
          <div>
            <h2 class="text-2xl font-bold tracking-tight mb-1.5">Verification Report</h2>
            <p class="text-sm text-gray-500 mb-7">{selectedMethod?.name} verification</p>
            {reports && !reportLoading ? (
              <div>
                {reports.income_insights && <IncomeInsightsReport report={reports.income_insights} />}
                {reports.income && <VoieReport report={reports.income} />}
                <div class="flex gap-3 mt-6 pt-5 border-t border-gray-200">
                  <button class="px-5 py-2.5 text-sm font-semibold border border-[#e8e8ed] rounded-full hover:border-primary hover:text-primary" onClick={resetDemo}>Start Over</button>
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
