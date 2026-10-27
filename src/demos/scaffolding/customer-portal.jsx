/**
 * FILE SUMMARY: Scaffolding for Retail Banking: Customer Portal demo.
 * INTEGRATION PATTERN: Orders flow.
 *
 * Exports presentation-layer config consumed by CustomerPortal.jsx: step definitions,
 * product bundle options (income, income+assets, self-employment), a CPIntroScreen
 * component with product picker, and a CPReportResults component. Contains no API
 * calls or state management beyond local selection state.
 */

// --- Imports: Preact hooks ---
import { useState } from 'preact/hooks';

// --- Imports: shared intro slide component ---
import { IntroSlide } from '../../components/index.js';

// --- Imports: report display components ---
import { VoieReport } from '../../components/reports/VoieReport.jsx';
import { AssetsReport } from '../../components/reports/AssetsReport.jsx';
import { IncomeInsightsReport } from '../../components/reports/IncomeInsightsReport.jsx';

// --- Imports: Mermaid diagrams (one per product bundle) ---
import { CP_DIAGRAMS } from '../../diagrams/customer-portal.js';

// --- Config: step definitions for the sidebar Guide tab ---
export const STEPS = [
  {
    title: 'Agency creates the order',
    guide: '<p>Two questions decide the products: a job adds <code>income</code>, a bank account adds <code>assets</code>. No to both creates no order.</p>'
      + '<p>The server creates one order per applicant:</p>'
      + '<pre>POST /v1/orders/\n{\n  first_name, last_name,\n  email, phone,\n  products,\n  template_id,\n  external_user_id,\n  order_number\n}</pre>'
      + '<p><code>template_id</code> depends on the products and on dialog vs inline. If the signed-in account does not own it, Truv returns 400 and the order is retried without it (account default template).</p>'
      + '<p>Only the <code>bridge_token</code> reaches the browser.</p>'
      + '<p><a href="https://docs.truv.com/api-reference/orders/orders_create" target="_blank">Orders API →</a></p>',
  },
  {
    title: 'Applicant completes verification',
    guide: '<pre>TruvBridge.init({\n  bridgeToken, isOrder: true,\n  position: { type: \'dialog\' }\n  // or { type: \'inline\', container }\n})</pre>'
      + '<p>The portal advances only on <code>onEvent(\'COMPLETED\', payload, \'order\')</code>, after self-certification where enabled, then closes the order page itself. <code>onSuccess</code> and <code>onClose</code> are logged but not used as the gate.</p>'
      + '<p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p>'
      + '<p><a href="https://docs.truv.com/developers/best-practices/embedded-orders" target="_blank">Embedded Orders best practices →</a></p>',
  },
  { title: 'Agency receives webhooks', guide: '<p>The waiting screen watches for <code>order-status-updated</code> with status <code>completed</code> before fetching reports.</p><p><a href="https://docs.truv.com/api-reference/webhooks" target="_blank">Webhooks Docs →</a></p>' },
  {
    title: 'Agency reviews reports',
    guide: '<p>One report per product, each created then retrieved:</p>'
      + '<pre>income:\nPOST /v1/users/{id}/reports/\n\nassets:\nPOST /v1/users/{id}/assets/reports/\nPOST /v1/users/{id}/income_insights/reports/</pre>'
      + '<p>Income Insights is added automatically for <code>assets</code>.</p>'
      + '<p><a href="https://docs.truv.com/api-reference/user-income-and-employment-reports/users_reports" target="_blank">Reports API →</a></p>',
  },
];

// --- Config: product bundles for the customer portal. Each maps to one or more Truv products. ---
export const CP_PRODUCTS = [
  {
    id: 'income',
    name: 'Income and employment verification',
    desc: 'Verify current income for program eligibility and benefit calculations.',
    useCase: 'SNAP, TANF, Medicaid, housing assistance',
    report: 'VOIE Report',
    products: ['income'],
  },
  {
    id: 'income_assets',
    name: 'Income + Expenses',
    desc: 'Verify income and bank balances together for full financial picture.',
    useCase: 'Housing assistance, comprehensive eligibility',
    report: 'VOIE + VOA',
    products: ['income', 'assets'],
  },
  {
    id: 'assets',
    name: 'Self-employment income',
    desc: 'Verify bank balances and account ownership for means testing.',
    useCase: 'Housing assistance, program eligibility',
    report: 'VOA + Income Insights',
    products: ['assets'],
  },
];

// --- Component: CPIntroScreen. Product bundle picker with diagram. Calls onStart(bundleId). ---
export function CPIntroScreen({ onStart }) {
  const [selected, setSelected] = useState(null);

  return (
    <IntroSlide
      theme="checkr"
      label="Public Sector · Customer Portal"
      title={<>Verify income for<br />benefit eligibility</>}
      subtitle="An applicant applies for benefits and verifies their income and employment through a self-service portal. No document uploads needed."
      diagram={CP_DIAGRAMS[selected] || CP_DIAGRAMS.income}
      actions={
        <button
          onClick={() => selected && onStart(selected)}
          disabled={!selected}
          class="w-full block py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-hover active:bg-primary-active transition-colors disabled:opacity-40"
        >
          Get started
        </button>
      }
    >
      <div class="grid gap-3 text-left">
        {CP_PRODUCTS.map(p => (
          <div
            key={p.id}
            onClick={() => setSelected(p.id)}
            class={`rounded-xl border px-5 py-4 cursor-pointer transition-all duration-150 ${
              selected === p.id
                ? 'border-primary bg-primary/[0.04]'
                : 'border-[#e8e8ed] hover:border-[#c0c0c5]'
            }`}
          >
            <div class="flex items-center justify-between">
              <h3 class="text-[14px] font-semibold text-[#000000]">{p.name}</h3>
              <span class="text-[10px] font-medium text-[#808080] font-mono">{p.report}</span>
            </div>
            <p class="text-[13px] text-[#808080] leading-[1.5] mt-0.5">{p.desc}</p>
          </div>
        ))}
      </div>
    </IntroSlide>
  );
}

// --- Component: CPReportResults. Renders the appropriate report component based on product type. ---
export function CPReportResults({ reportData, reportLoading, reportError, productType, onBack, backLabel = 'Back', maxWidth = 'max-w-lg' }) {
  if (reportError) return <div class={`${maxWidth} mx-auto text-center py-16 text-red-600`}>{reportError}</div>;
  if (reportLoading || !reportData) return <div class={`${maxWidth} mx-auto text-center py-16`}><div class="w-10 h-10 border-[3px] border-gray-200 border-t-primary rounded-full animate-spin mx-auto" /></div>;

  return (
    <div class={`${maxWidth} mx-auto`}>
      <h2 class="text-[28px] font-semibold tracking-[-0.02em] text-[#000000] mb-1.5">Verification Results</h2>
      <p class="text-[15px] text-[#808080] leading-[1.5] mb-7">{productType} verification</p>
      {reportData.income && <VoieReport report={reportData.income} />}
      {reportData.employment && <VoieReport report={reportData.employment} />}
      {reportData.assets && <AssetsReport report={reportData.assets} />}
      {reportData.income_insights && <IncomeInsightsReport report={reportData.income_insights} />}
      <div class="flex gap-3 mt-6 pt-5 border-t border-gray-200">
        <button class="px-5 py-2.5 text-sm font-semibold border border-[#e8e8ed] rounded-lg hover:border-[#c0c0c5] active:bg-[#e8e8ed] transition-colors" onClick={onBack}>{backLabel}</button>
      </div>
    </div>
  );
}
