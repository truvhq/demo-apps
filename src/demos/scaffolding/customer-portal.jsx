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
    title: 'Applicant submits information',
    guide: '<p>The form collects applicant PII and employer/institution. Employers are searched via:</p>'
      + '<pre>GET /v1/company-mappings-search/?query=...</pre>'
      + '<p>For financial institutions (banks):</p>'
      + '<pre>GET /v1/providers/?query=...</pre>'
      + '<p>Then an order is created:</p><pre>POST /v1/orders/</pre>'
      + '<p><a href="https://truv.com/docs/api-reference/companies/company_autocomplete_search" target="_blank">Company Search</a> · <a href="https://truv.com/docs/api-reference/data-providers/providers-list" target="_blank">Providers</a> · <a href="https://truv.com/docs/api-reference/orders/orders_create" target="_blank">Orders</a></p>',
  },
  { title: 'Applicant completes verification', guide: '<p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p><p><a href="https://truv.com/docs/developers/integration/bridge-widget/overview" target="_blank">Bridge Docs →</a></p>' },
  { title: 'Agency processes results', guide: '<p>Truv sends webhooks as the verification progresses.</p><p><a href="https://truv.com/docs/api-reference/webhook-events" target="_blank">Webhooks Docs →</a></p>' },
  { title: 'Agency reviews report', guide: '<p>Fetch reports:</p><pre>POST /v1/users/{user_id}/reports/</pre><p><a href="https://truv.com/docs/api-reference/user-income-and-employment-reports/users_reports" target="_blank">Reports API →</a></p>' },
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
      label="Public Sector · Customer Portal"
      title={<>Verify income for<br />benefit eligibility</>}
      subtitle="An applicant applies for benefits and verifies their income and employment through a self-service portal. No document uploads needed."
      diagram={CP_DIAGRAMS[selected] || CP_DIAGRAMS.income}
      actions={
        <button
          onClick={() => selected && onStart(selected)}
          disabled={!selected}
          class="w-full block py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover disabled:opacity-40"
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
              <h3 class="text-[14px] font-semibold text-[#171717]">{p.name}</h3>
              <span class="text-[10px] font-medium text-[#8E8E93] font-mono">{p.report}</span>
            </div>
            <p class="text-[13px] text-[#8E8E93] leading-[1.5] mt-0.5">{p.desc}</p>
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
      <h2 class="text-2xl font-bold tracking-tight mb-1.5">Verification Results</h2>
      <p class="text-sm text-gray-500 mb-7">{productType} verification</p>
      {reportData.income && <VoieReport report={reportData.income} />}
      {reportData.employment && <VoieReport report={reportData.employment} />}
      {reportData.assets && <AssetsReport report={reportData.assets} />}
      {reportData.income_insights && <IncomeInsightsReport report={reportData.income_insights} />}
      <div class="flex gap-3 mt-6 pt-5 border-t border-gray-200">
        <button class="px-5 py-2.5 text-sm font-semibold border border-[#e8e8ed] rounded-full hover:border-primary hover:text-primary" onClick={onBack}>{backLabel}</button>
      </div>
    </div>
  );
}
