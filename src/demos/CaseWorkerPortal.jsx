/**
 * FILE SUMMARY: Public Sector: Case Worker Portal demo.
 * INTEGRATION PATTERN: Orders flow (backend-initiated, no Bridge widget).
 *
 * DATA FLOW:
 *   1. POST /api/orders           : create order with applicant PII + email/phone
 *   2. Truv sends email/SMS with share_url to applicant
 *   3. Webhook polling for order-status-updated with status "completed"
 *   4. GET /api/users/:userId/reports/:type : fetch verification report
 *
 * Same backend-initiated pattern as LOS.jsx but with government-specific labels
 * (case worker, applicant). A case worker enters applicant PII and Truv sends a
 * verification link. The applicant completes Bridge on their own device.
 *
 * Scaffolding: ./scaffolding/case-worker-portal.jsx
 * Diagrams:    ../diagrams/case-worker-portal.js
 *
 * WHAT TO COPY (for your own Truv integration):
 *   - handleRequest()    : creates an order via POST /api/orders with PII + email/phone
 *   - useReportFetch()   : watches webhooks and fetches reports when order completes
 *   - share_url display  : shows the Truv verification link sent to the applicant
 *   - startPolling()     : begins webhook polling for order status updates
 */

// --- Imports: Preact hooks ---
import { useState } from 'preact/hooks';

// --- Imports: shared layout, components, hooks, and API base URL ---
import { Layout, WebhookFeed, usePanel, API_BASE, IntroSlide, useReportFetch } from '../components/index.js';

// --- Imports: report display components ---
import { VoieReport } from '../components/reports/VoieReport.jsx';
import { AssetsReport } from '../components/reports/AssetsReport.jsx';
import { IncomeInsightsReport } from '../components/reports/IncomeInsightsReport.jsx';

// --- Imports: Mermaid diagram for intro slide ---
import { VERIFIER_DIAGRAM } from '../diagrams/case-worker-portal.js';

// --- Imports: scaffolding (steps, sample data, intro features, form) ---
import { STEPS, COMPLETED_APPLICANTS, INTRO_FEATURES, AddApplicantForm } from './scaffolding/case-worker-portal.jsx';

// --- Component: CaseWorkerPortalDemo ---
export function CaseWorkerPortalDemo({ screen, param }) {
  // Component state: intro visibility, test applicant data, order response, creation flag
  const [introSeen, setIntroSeen] = useState(false);
  const [testApplicant, setTestApplicant] = useState(null);
  const [order, setOrder] = useState(null);
  const [creating, setCreating] = useState(false);

  // Panel hook: sidebar state, webhook polling
  const { panel, setCurrentStep, startPolling, pollOnceAndStop, reset: resetPanel } = usePanel();

  // Report fetching: watches webhooks for order completion, updates order status on complete
  const { reports, reset: resetReports } = useReportFetch({
    userId: order?.user_id,
    products: testApplicant?.products || [],
    webhooks: panel.webhooks,
    pollOnceAndStop,
    webhookEvent: 'order',
    onComplete: () => { setOrder(prev => ({ ...prev, status: 'completed' })); setCurrentStep(2); },
  });

  // Derived state: which screen to show based on intro and applicant state
  const showIntro = !introSeen;
  const showAddForm = introSeen && !testApplicant;
  const showTable = introSeen && testApplicant;

  // Handler: create order via POST /api/orders with applicant PII, then start polling
  async function handleRequest() {
    if (!testApplicant) return;
    setCreating(true);
    try {
      const body = {
        products: testApplicant.products,
        demo_id: 'verifier-portal',
        first_name: testApplicant.firstName,
        last_name: testApplicant.lastName,
      };
      if (testApplicant.email) body.email = testApplicant.email;
      if (testApplicant.phone) body.phone = testApplicant.phone;
      const resp = await fetch(`${API_BASE}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await resp.json();
      if (resp.ok) {
        setOrder(data);
        setCurrentStep(1);
        if (data.user_id) startPolling(data.user_id);
      }
    } catch (e) { console.error(e); }
    setCreating(false);
  }

  // Handler: reset all state to start over
  function resetDemo() {
    resetPanel();
    resetReports();
    setIntroSeen(false);
    setTestApplicant(null);
    setOrder(null);
    setCurrentStep(0);
  }

  // --- Render: state-driven screen routing ---
  return (
    <Layout badge="Public Sector · Case Worker Portal" steps={STEPS} panel={panel} hidePanel={showIntro || showAddForm}>

      {/* Intro slide: architecture diagram and feature overview */}
      {showIntro && (
        <IntroSlide
          label="Public Sector . Case Worker Portal"
          title="Verify without the applicant present"
          subtitle="A case worker creates verification orders using applicant data on file and sends verification links via email or SMS. Track completion from a dashboard."
          diagram={VERIFIER_DIAGRAM}
          actions={<button onClick={() => setIntroSeen(true)} class="w-full py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover text-center">Get started</button>}
        >
          <div class="grid gap-3">
            {INTRO_FEATURES.map(item => (
              <div key={item.name} class="rounded-xl border border-[#e8e8ed] px-5 py-4">
                <h3 class="text-[14px] font-semibold text-[#171717] mb-1">{item.name}</h3>
                <p class="text-[13px] text-[#8E8E93] leading-[1.4]">{item.desc}</p>
              </div>
            ))}
          </div>
        </IntroSlide>
      )}

      {/* Add test applicant form: collects applicant PII for order creation */}
      {showAddForm && <AddApplicantForm onSubmit={setTestApplicant} />}

      {/* Dashboard table: applicant list with order status, share URL, webhooks, and report */}
      {showTable && (
        <div class="max-w-4xl mx-auto px-8 py-10">
          <h2 class="text-xl font-semibold tracking-tight mb-1 text-[#171717]">Applicants</h2>
          <p class="text-[13px] text-[#8E8E93] mb-5">Completed applicants shown for reference. Your test applicant will receive a verification link.</p>

          <div class="border border-[#d2d2d7] rounded-xl overflow-hidden bg-white mb-6">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-[#d2d2d7] bg-[#f5f5f7] text-[#8E8E93] text-[12px] font-medium uppercase tracking-wide">
                  <th class="text-left px-4 py-3">Name</th>
                  <th class="text-left px-4 py-3">Email</th>
                  <th class="text-left px-4 py-3">Phone</th>
                  <th class="text-left px-4 py-3">Products</th>
                  <th class="text-left px-4 py-3">Status</th>
                  <th class="text-right px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {COMPLETED_APPLICANTS.map((app, i) => (
                  <tr key={i} class="border-b border-[#f5f5f7]">
                    <td class="px-4 py-3 text-[#8E8E93]">{app.firstName} {app.lastName}</td>
                    <td class="px-4 py-3 text-[#8E8E93] font-mono text-[12px]">{app.email}</td>
                    <td class="px-4 py-3 text-[#8E8E93] font-mono text-[12px]">{app.phone}</td>
                    <td class="px-4 py-3">{app.products.map(p => <span key={p} class="inline-block text-[11px] font-medium bg-[#f5f5f7] text-[#8E8E93] px-2 py-0.5 rounded mr-1">{p}</span>)}</td>
                    <td class="px-4 py-3"><span class="text-[11px] font-semibold text-[#34c759] bg-green-50 px-2 py-0.5 rounded">completed</span></td>
                    <td class="px-4 py-3 text-right text-[12px] text-[#8E8E93]">{'\u2014'}</td>
                  </tr>
                ))}

                {/* Test applicant */}
                <tr class="bg-[#fafafa]">
                  <td class="px-4 py-3 font-medium text-[#171717]">{testApplicant.firstName} {testApplicant.lastName}</td>
                  <td class="px-4 py-3 text-[#8E8E93] font-mono text-[12px]">{testApplicant.email || '\u2014'}</td>
                  <td class="px-4 py-3 text-[#8E8E93] font-mono text-[12px]">{testApplicant.phone || '\u2014'}</td>
                  <td class="px-4 py-3">{testApplicant.products.map(p => <span key={p} class="inline-block text-[11px] font-medium bg-primary-light text-primary px-2 py-0.5 rounded mr-1">{p}</span>)}</td>
                  <td class="px-4 py-3">
                    <span class={`text-[11px] font-semibold px-2 py-0.5 rounded ${order?.status === 'completed' ? 'text-[#34c759] bg-green-50' : order ? 'text-[#ff9f0a] bg-amber-50' : 'text-[#8E8E93] bg-[#f5f5f7]'}`}>
                      {order?.status || 'pending'}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-right">
                    {!order && (
                      <button class="px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-full hover:bg-primary-hover disabled:opacity-40" disabled={creating} onClick={handleRequest}>
                        {creating ? <span class="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Send Verification'}
                      </button>
                    )}
                    {order && order.status !== 'completed' && (
                      <span class="text-[11px] text-[#8E8E93]">Waiting for user...</span>
                    )}
                    {order?.status === 'completed' && (
                      <span class="text-[11px] text-[#34c759] font-medium">Done</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Share URL display */}
          {order?.share_url && (
            <div class="border border-[#d2d2d7] rounded-xl p-4 mb-6 bg-[#f5f5f7]">
              <div class="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wide mb-2">Share URL (sent to applicant)</div>
              <a href={order.share_url} target="_blank" rel="noopener noreferrer" class="text-[13px] text-primary font-mono break-all hover:underline">{order.share_url}</a>
            </div>
          )}

          {/* Webhook feed while waiting */}
          {order && order.status !== 'completed' && (
            <div class="mb-6">
              <div class="text-[13px] font-medium text-[#171717] mb-3">Waiting for verification...</div>
              <WebhookFeed webhooks={panel.webhooks} />
            </div>
          )}

          {/* Report when completed */}
          {reports && (
            <div class="border border-[#d2d2d7] rounded-xl p-6 bg-white">
              <h3 class="text-lg font-semibold text-[#171717] mb-4">Verification Report</h3>
              {reports.income && <VoieReport report={reports.income} />}
              {reports.employment && <VoieReport report={reports.employment} />}
              {reports.assets && <AssetsReport report={reports.assets} />}
              {reports.income_insights && <IncomeInsightsReport report={reports.income_insights} />}
            </div>
          )}

          <div class="mt-6 pt-5 border-t border-[#d2d2d7]">
            <button class="px-5 py-2.5 text-sm font-semibold border border-[#e8e8ed] rounded-full hover:border-primary hover:text-primary" onClick={resetDemo}>Start Over</button>
          </div>
        </div>
      )}
    </Layout>
  );
}
