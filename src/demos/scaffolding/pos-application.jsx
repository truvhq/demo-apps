/**
 * FILE SUMMARY: Scaffolding for Mortgage: POS Application demo.
 * INTEGRATION PATTERN: Orders flow.
 *
 * Exports presentation-layer config consumed by POSApplication.jsx: step definitions
 * for the sidebar guide, product picker options, an IntroScreen component, and a
 * ReportResults component. Contains no API calls or state management.
 */

// --- Imports: Preact hooks ---
import { useState } from 'preact/hooks';

// --- Imports: shared intro slide component ---
import { IntroSlide } from '../../components/index.js';

// --- Imports: report display components ---
import { VoieReport } from '../../components/reports/VoieReport.jsx';
import { AssetsReport } from '../../components/reports/AssetsReport.jsx';
import { IncomeInsightsReport } from '../../components/reports/IncomeInsightsReport.jsx';

// --- Imports: Mermaid diagrams (one per product type) ---
import { DIAGRAMS } from '../../diagrams/pos-application.js';

// --- Config: step definitions for the sidebar Guide tab ---
export const STEPS = [
  {
    title: 'Borrower fills out application',
    guide: '<p>The form collects borrower PII and employer/institution. Employers are searched via:</p>'
      + '<pre>GET /v1/company-mappings-search/?query=...</pre>'
      + '<p>For financial institutions (banks):</p>'
      + '<pre>GET /v1/providers/?query=...</pre>'
      + '<p>Then an order is created:</p><pre>POST /v1/orders/</pre>'
      + '<p><a href="https://docs.truv.com/reference/company_autocomplete_search" target="_blank">Company Search</a> · <a href="https://docs.truv.com/reference/providers-list" target="_blank">Providers</a> · <a href="https://docs.truv.com/reference/orders_create" target="_blank">Orders</a></p>',
  },
  { title: 'Borrower completes verification', guide: '<p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p><p><a href="https://docs.truv.com/docs/truv-bridge" target="_blank">Bridge Docs →</a></p>' },
  { title: 'Truv processes results', guide: '<p>Truv sends webhooks as the verification progresses.</p><p><a href="https://docs.truv.com/docs/webhooks" target="_blank">Webhooks Docs →</a></p>' },
  { title: 'Loan Processor reviews report', guide: '<p>Fetch reports:</p><pre>POST /v1/users/{user_id}/reports/</pre><p><a href="https://docs.truv.com/reference/users_reports" target="_blank">Reports API →</a></p>' },
];

// --- Config: product options for the intro screen picker ---
export const PRODUCTS = [
  {
    id: 'income',
    name: 'Income Verification',
    desc: 'Verify current income, pay frequency, and YTD earnings for loan qualification.',
    useCase: 'Purchase loans, refinances, HELOCs',
    report: 'VOIE Report',
  },
  {
    id: 'assets',
    name: 'Assets Verification',
    desc: 'Verify bank balances, account ownership, and deposit history.',
    useCase: 'Proof of funds, mortgage qualification',
    report: 'VOA + Income Insights',
  },
];

// --- Component: IntroScreen. Product picker with diagram. Calls onStart(productId). ---
export function IntroScreen({ onStart }) {
  const [selected, setSelected] = useState(null);

  return (
    <IntroSlide
      label="Mortgage · Point of Sale"
      title={<>Verify during the<br />loan application</>}
      subtitle="A borrower fills out a loan application and verifies their income or assets in real time. Truv creates an order, launches Bridge, and returns a GSE-ready report."
      diagram={DIAGRAMS[selected] || DIAGRAMS.income}
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
        {PRODUCTS.map(p => (
          <div
            key={p.id}
            onClick={() => setSelected(p.id)}
            class={`rounded-xl border px-5 py-4 cursor-pointer transition-all duration-150 ${
              selected === p.id
                ? 'border-primary bg-primary/[0.04]'
                : 'border-[#e8e8ed] hover:border-[#c0c0c5]'
            }`}
          >
            <div class="flex items-start justify-between mb-1">
              <h3 class="text-[15px] font-semibold text-[#171717]">{p.name}</h3>
              <span class="text-[11px] font-medium text-[#8E8E93] bg-[#f5f5f7] px-2 py-0.5 rounded-md font-mono">{p.report}</span>
            </div>
            <p class="text-[14px] text-[#8E8E93] leading-[1.5] mb-2">{p.desc}</p>
            <p class="text-[12px] text-[#8E8E93]">{p.useCase}</p>
          </div>
        ))}
      </div>
    </IntroSlide>
  );
}

// --- Component: ReportResults. Renders the appropriate report component based on product type. ---
export function ReportResults({ reportData, reportLoading, reportError, productType, onBack, backLabel = 'Back', maxWidth = 'max-w-lg' }) {
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
