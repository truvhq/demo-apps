/**
 * FILE SUMMARY: Consumer Credit: Bank Income Verification demo.
 * INTEGRATION PATTERN: Bridge flow (User+Token, data_sources: financial_accounts).
 *
 * DATA FLOW:
 *   1. POST /api/bridge-token                : create user + bridge token (financial_accounts)
 *   2. TruvBridge.init().open()              : Bridge popup for bank login
 *   3. Webhook: task-status-updated with status "done"
 *   4. GET /api/users/:userId/reports/income_insights : fetch income insights report
 *
 * Follows the same Bridge flow as SmartRouting.jsx but restricted to bank connections.
 * Uses GET /v1/providers/ for financial institution search. Returns an income insights
 * report derived from bank transaction analysis.
 *
 * Scaffolding: ./scaffolding/bank-income.jsx
 * Diagrams:    ../diagrams/bank-income.js
 *
 * WHAT TO COPY (for your own Truv integration):
 *   - handleFormSubmit()  : creates a bridge token via POST /api/bridge-token
 *   - TruvBridge.init()   : opens the Bridge widget (data_sources: financial_accounts)
 *   - useReportFetch()    : watches webhooks and fetches income_insights reports
 */

// --- Imports: Preact hooks ---
import { useState } from 'preact/hooks';

// --- Imports: shared layout, components, hooks, and API base URL ---
import { Layout, WaitingScreen, usePanel, API_BASE, IntroSlide, useReportFetch } from '../components/index.js';

// --- Imports: report display component ---
import { IncomeInsightsReport } from '../components/reports/IncomeInsightsReport.jsx';

// --- Imports: reusable form component ---
import { ApplicationForm } from '../components/ApplicationForm.jsx';

// --- Imports: Mermaid diagram for intro slide ---
import { DIAGRAM } from '../diagrams/bank-income.js';

// --- Imports: scaffolding (steps, intro config, report header) ---
import { STEPS, INTRO_SLIDE_CONFIG, REPORT_HEADER } from './scaffolding/bank-income.jsx';

// --- Component: BankIncomeDemo ---
export function BankIncomeDemo() {
  // Component state: screen phase, form visibility, form data, Truv user ID, loading flag
  const [screen, setScreen] = useState('select');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(false);

  // Panel hook: sidebar state, session tracking, webhook polling, bridge events
  const { panel, sessionId, setCurrentStep, startPolling, pollOnceAndStop, addBridgeEvent, reset } = usePanel();

  // Report fetching: watches webhooks for task completion, fetches income_insights report
  const { reports, loading: reportLoading, reset: resetReports } = useReportFetch({
    userId,
    products: ['income_insights'],
    webhooks: panel.webhooks,
    pollOnceAndStop,
    webhookEvent: 'task',
    onComplete: () => { setCurrentStep(3); setScreen('review'); },
  });

  // Handler: create bridge token via POST /api/bridge-token and open TruvBridge popup.
  // Uses data_sources: ['financial_accounts'] and provider_id for bank deeplinking.
  async function handleFormSubmit(data) {
    setFormData(data);
    setLoading(true);
    setCurrentStep(1);
    try {
      const resp = await fetch(`${API_BASE}/api/bridge-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_type: 'income', data_sources: ['financial_accounts'], provider_id: data.provider_id }),
      });
      const result = await resp.json();
      if (!resp.ok) { alert('Error: ' + (result.error || 'Unknown')); setLoading(false); return; }
      setUserId(result.user_id);
      startPolling(result.user_id);

      // Open TruvBridge popup with callbacks for load, success, event, and close
      if (window.TruvBridge) {
        const opts = {
          bridgeToken: result.bridge_token,
          onLoad: () => addBridgeEvent('onLoad()', null),
          onSuccess: (publicToken, meta) => {
            addBridgeEvent('onSuccess(publicToken, meta)', [
              { label: 'publicToken', value: publicToken },
              { label: 'meta', value: meta },
            ]);
            setCurrentStep(2);
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
    setUserId(null);
  }

  // Derived state: layout flag
  const isIntro = screen === 'select' && !showForm;

  // --- Render: state-driven screen routing ---
  return (
    <Layout badge="Bank Income" steps={STEPS} panel={panel} hidePanel={isIntro}>
      <div class={isIntro ? 'flex-1 flex flex-col' : 'max-w-lg mx-auto px-8 py-10'}>
        {/* Intro slide: architecture diagram */}
        {screen === 'select' && !showForm && (
          <IntroSlide
            label={INTRO_SLIDE_CONFIG.label}
            title={INTRO_SLIDE_CONFIG.title}
            subtitle={INTRO_SLIDE_CONFIG.subtitle}
            diagram={DIAGRAM}
            actions={<button onClick={() => setShowForm(true)} class="w-full py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover text-center">Get started</button>}
          />
        )}

        {/* Application form: collects applicant PII and financial institution */}
        {screen === 'select' && showForm && (
          <ApplicationForm sessionId={sessionId} onSubmit={handleFormSubmit} submitting={loading} productType="income" employerLabel="Financial institution" dataSource="financial_accounts" />
        )}

        {/* Waiting screen: webhook polling spinner until task completes */}
        {screen === 'waiting' && <WaitingScreen webhooks={panel.webhooks} />}

        {/* Review screen: income insights report from bank transactions */}
        {screen === 'review' && (
          <div>
            <h2 class="text-2xl font-bold tracking-tight mb-1.5">{REPORT_HEADER.title}</h2>
            <p class="text-sm text-gray-500 mb-7">{REPORT_HEADER.subtitle}</p>
            {reports?.income_insights && !reportLoading ? (
              <div>
                <IncomeInsightsReport report={reports.income_insights} />
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
