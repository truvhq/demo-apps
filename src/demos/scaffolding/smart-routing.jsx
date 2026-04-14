// Presentation scaffolding for SmartRouting demo.
// Extracted so the demo file contains only Truv API workflow code.

import { Icons } from '../../components/Icons.jsx';

// STEPS: sidebar Guide tab content. Each step highlights when setCurrentStep(index) is called.
export const STEPS = [
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

// METHODS: verification method cards shown on the 'choose' screen.
// The `dataSources` array is sent to POST /api/bridge-token to control what Bridge shows.
// `productType` is the Truv product_type sent when creating the bridge token.
// `reportType` determines which user report endpoint to call after verification.
export const METHODS = [
  { id: 'payroll', name: 'Payroll Income', desc: 'Connect to payroll provider for verified income and employment data', Icon: Icons.briefcase, color: 'icon-box-blue', dataSources: ['payroll'], productType: 'income', reportType: 'income' },
  { id: 'bank', name: 'Bank Transactions', desc: 'Connect bank account for transaction-based income insights', Icon: Icons.bankBuilding, color: 'icon-box-emerald', dataSources: ['financial_accounts'], productType: 'income', reportType: 'income_insights' },
  { id: 'documents', name: 'Upload Documents', desc: 'Upload pay stubs, W-2s, or tax returns for document-based verification', Icon: Icons.upload, color: 'icon-box-amber', dataSources: ['docs'], productType: 'income', reportType: 'income' },
];

export const INTRO_SLIDE_CONFIG = {
  label: 'Consumer Credit \u00b7 Smart Routing',
  title: 'Find the fastest verification path',
  subtitle: 'The system checks the applicant\'s employer payroll coverage and recommends the fastest path: payroll, bank transactions, or document upload. The applicant can accept or override.',
};

export function MethodCards() {
  return (
    <div class="grid gap-3 text-left">
      {METHODS.map(m => (
        <div key={m.id} class="rounded-xl border border-[#e8e8ed] px-5 py-4">
          <div class="flex items-center gap-3 mb-1">
            <div class={`icon-box ${m.color}`}><m.Icon size={18} /></div>
            <h3 class="text-[14px] font-semibold text-[#171717]">{m.name}</h3>
          </div>
          <p class="text-[13px] text-[#8E8E93] leading-[1.4]">{m.desc}</p>
        </div>
      ))}
    </div>
  );
}

export function MethodPicker({ methods, recommended, onSelect, loading }) {
  return (
    <div class="grid gap-3">
      {methods.map(m => {
        const isRecommended = m.id === recommended;
        return (
          <button
            key={m.id}
            onClick={() => onSelect(m)}
            disabled={loading}
            class={`rounded-xl border px-5 py-4 text-left cursor-pointer transition-all duration-150 disabled:opacity-40 ${
              isRecommended
                ? 'border-primary bg-primary/[0.04]'
                : 'border-[#e8e8ed] hover:border-[#c0c0c5]'
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
  );
}
