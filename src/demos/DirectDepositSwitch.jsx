/**
 * FILE SUMMARY: Retail Banking: Direct Deposit Switch demo.
 * INTEGRATION PATTERN: Bridge flow (User+Token, product_type: deposit_switch).
 *
 * DATA FLOW:
 *   1. POST /api/bridge-token                             : create user + bridge token (deposit_switch)
 *   2. TruvBridge.init().open()                           : Bridge popup for payroll login + switch
 *   3. Webhook: task-status-updated with status "done"
 *   4. GET /api/users/:userId/reports/deposit_switch       : fetch deposit switch confirmation
 *
 * A new customer connects their payroll provider and switches direct deposit routing
 * to your bank. Follows the same Bridge flow as SmartRouting.jsx but uses product_type
 * "deposit_switch". The report confirms the deposit was switched.
 *
 * Scaffolding: ./scaffolding/direct-deposit-switch.jsx
 * Diagrams:    ../diagrams/direct-deposit-switch.js
 *
 * WHAT TO COPY (for your own Truv integration):
 *   - handleFormSubmit()  : creates a bridge token via POST /api/bridge-token (product_type: deposit_switch)
 *   - TruvBridge.init()   : opens the Bridge widget for direct deposit switching
 *   - useReportFetch()    : watches webhooks and fetches deposit_switch reports
 */

// --- Imports: Preact hooks ---
import { useState } from 'preact/hooks';

// --- Imports: shared layout, components, hooks, and API base URL ---
import { Layout, WaitingScreen, usePanel, API_BASE, IntroSlide, useReportFetch } from '../components/index.js';

// --- Imports: reusable form component ---
import { ApplicationForm } from '../components/ApplicationForm.jsx';

// --- Imports: report display component ---
import { DDSReport } from '../components/reports/DDSReport.jsx';

// --- Imports: Mermaid diagram for intro slide ---
import { DIAGRAM } from '../diagrams/direct-deposit-switch.js';

// --- Imports: scaffolding (steps, intro config, report header) ---
import { STEPS, INTRO_SLIDE_CONFIG, REPORT_HEADER } from './scaffolding/direct-deposit-switch.jsx';

// --- Component: DirectDepositSwitchDemo ---
export function DirectDepositSwitchDemo() {
  // Component state: screen phase, form visibility, form data, Truv user ID, loading flag
  const [screen, setScreen] = useState('select');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(false);

  // Panel hook: sidebar state, session tracking, webhook polling, bridge events
  const { panel, sessionId, setCurrentStep, startPolling, pollOnceAndStop, addBridgeEvent, reset } = usePanel();

  // Report fetching: watches webhooks for task completion, fetches deposit_switch report
  const { reports, loading: reportLoading, reset: resetReports } = useReportFetch({
    userId,
    products: ['deposit_switch'],
    webhooks: panel.webhooks,
    pollOnceAndStop,
    webhookEvent: 'task',
    onComplete: () => { setCurrentStep(3); setScreen('review'); },
  });

  // Handler: create bridge token via POST /api/bridge-token (deposit_switch) and open TruvBridge.
  // Uses company_mapping_id for employer deeplinking.
  async function handleFormSubmit(data) {
    setFormData(data);
    setLoading(true);
    setCurrentStep(1);
    try {
      const resp = await fetch(`${API_BASE}/api/bridge-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_type: 'deposit_switch', company_mapping_id: data.company_mapping_id, first_name: data.first_name, last_name: data.last_name }),
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
    <Layout badge="Retail Banking . Deposit Switch" steps={STEPS} panel={panel} hidePanel={isIntro}>
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

        {/* Application form: collects customer PII and employer */}
        {screen === 'select' && showForm && (
          <ApplicationForm sessionId={sessionId} onSubmit={handleFormSubmit} submitting={loading} productType="deposit_switch" />
        )}

        {/* Waiting screen: webhook polling spinner until task completes */}
        {screen === 'waiting' && <WaitingScreen webhooks={panel.webhooks} />}

        {/* Review screen: deposit switch confirmation report */}
        {screen === 'review' && (
          <div>
            <h2 class="text-2xl font-bold tracking-tight mb-1.5">{REPORT_HEADER.title}</h2>
            <p class="text-sm text-gray-500 mb-7">{REPORT_HEADER.subtitle}</p>
            {reports?.deposit_switch && !reportLoading ? (
              <div>
                <DDSReport report={reports.deposit_switch} />
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
