// App.jsx — Root router and demo registry.
//
// Demos are organized by industry. Each industry lists its demos in the
// INDUSTRIES array below. The hash-based router maps URLs to components:
//
//   #                                        → Home (industry picker)
//   #consumer-credit                         → Industry page (list of demos)
//   #consumer-credit/smart-routing           → Demo intro screen
//   #consumer-credit/smart-routing/bridge/id → Demo active screen
//
// Each demo component receives { screen, param } props from the router.
// See SmartRouting.jsx for the Consumer Credit pattern (Bridge flow)
// and Application.jsx for the Mortgage pattern (Orders flow).

import { useState, useEffect } from 'preact/hooks';
import { Home } from './Home.jsx';
import { IndustryPage } from './IndustryPage.jsx';
import { ApplicationDemo } from './demos/Application.jsx';
import { FollowUpDemo } from './demos/FollowUp.jsx';
import { EmployeePortalDemo } from './demos/EmployeePortal.jsx';
import { UploadDocumentsDemo } from './demos/UploadDocuments.jsx';
import { LOSDemo } from './demos/LOS.jsx';
import { CustomerPortalDemo } from './demos/CustomerPortal.jsx';
import { PSDocumentsDemo } from './demos/PSDocuments.jsx';
import { SmartRoutingDemo } from './demos/SmartRouting.jsx';
import { BankIncomeDemo } from './demos/BankIncome.jsx';
import { PayrollIncomeDemo } from './demos/PayrollIncome.jsx';
import { PaycheckLinkedLoansDemo } from './demos/PaycheckLinkedLoans.jsx';
import { DepositSwitchDemo } from './demos/DepositSwitch.jsx';

export const INDUSTRIES = [
  {
    id: 'mortgage',
    name: 'Mortgage',
    desc: 'Verify borrower income, employment, and assets in minutes with GSE-certified reports for Day 1 Certainty.',
    demos: [
      { id: 'pos-application', name: 'POS Application', component: ApplicationDemo, desc: 'A borrower fills out a loan application and verifies their income or employment in real time, right inside the point-of-sale.', tags: ['Company Search', 'Orders', 'Bridge', 'Reports'] },
      { id: 'pos-tasks', name: 'POS Tasks', component: FollowUpDemo, desc: 'After submitting a loan application, the borrower returns to complete remaining verifications: income, employment, and assets.', tags: ['Orders', 'Bridge', 'VOIE', 'VOE', 'Assets'] },
      { id: 'los', name: 'LOS', component: LOSDemo, desc: 'A Loan Processor creates verification orders from the LOS using borrower data on file. Borrowers receive a link to complete verification on their own.', tags: ['Orders', 'Share URL', 'Status Tracking', 'Reports'] },
      { id: 'documents', name: 'Document Processing', component: UploadDocumentsDemo, desc: 'Process pay stubs, W-2s, and tax returns already collected. Truv validates the documents and extracts structured income data for underwriting.', tags: ['Document Collections', 'Finalize', 'Parsed Data'] },
    ],
  },
  {
    id: 'public-sector',
    name: 'Public Sector',
    desc: 'Instant income and employment verification for benefit eligibility, program enrollment, and recertification.',
    demos: [
      { id: 'customer-portal', name: 'Customer Portal', component: CustomerPortalDemo, desc: 'An applicant applies for benefits and verifies their income and employment through a self-service portal.', tags: ['Company Search', 'Orders', 'Bridge', 'Reports'] },
      { id: 'documents', name: 'Document Processing', component: PSDocumentsDemo, desc: 'Process pay stubs, W-2s, and tax returns to verify income for benefit eligibility decisions.', tags: ['Document Collections', 'Finalize', 'Parsed Data'] },
      { id: 'verifier-portal', name: 'Verifier Portal', component: EmployeePortalDemo, desc: 'A Case Worker creates verification orders using applicant data on file and sends verification links via email or SMS.', tags: ['Orders', 'Share URL', 'Status Tracking', 'Reports'] },
    ],
  },
  {
    id: 'consumer-credit',
    name: 'Consumer Credit',
    desc: 'Approve more borrowers with instant income and asset verification. Reduce fraud and speed up decisioning.',
    demos: [
      { id: 'smart-routing', name: 'Smart Routing', component: SmartRoutingDemo, desc: 'Check the applicant\'s employer coverage and automatically recommend the best verification method: payroll, bank, or documents.', tags: ['Company Search', 'success_rate', 'data_sources', 'Bridge'] },
      { id: 'bank-income', name: 'Bank Income', component: BankIncomeDemo, desc: 'Verify applicant income from bank transactions when payroll data isn\'t available.', tags: ['financial_accounts', 'Bridge', 'Income Insights'] },
      { id: 'payroll-income', name: 'Payroll Income', component: PayrollIncomeDemo, desc: 'Verify income and employment directly from payroll data for fast lending decisions.', tags: ['payroll', 'Bridge', 'VOIE Report'] },
      { id: 'pll', name: 'Paycheck-Linked Loans', component: PaycheckLinkedLoansDemo, desc: 'Set up automatic loan repayment through payroll deductions. Verify income and configure the deduction in one flow.', tags: ['pll', 'Bridge', 'Payroll Deductions'] },
    ],
  },
  {
    id: 'retail-banking',
    name: 'Retail Banking',
    desc: 'Acquire deposits and enable paycheck-linked lending with direct payroll connections.',
    demos: [
      { id: 'deposit-switch', name: 'Direct Deposit Switch', component: DepositSwitchDemo, desc: 'Switch a customer\'s direct deposit to your bank through their payroll provider. Changes take effect on the next pay cycle.', tags: ['deposit_switch', 'Bridge', 'Payroll'] },
    ],
  },
];

// Parse the URL hash into route segments.
// e.g. "#consumer-credit/smart-routing/bridge/abc123"
//   → { industry: "consumer-credit", demo: "smart-routing", screen: "bridge", param: "abc123" }
function parseHash() {
  const hash = window.location.hash.slice(1);
  const [industry, demo, screen, ...rest] = hash.split('/');
  return { industry: industry || '', demo: demo || '', screen: screen || '', param: rest.join('/') || '' };
}

// Navigate to a new route. Demo components call this to transition between screens.
// e.g. navigate('consumer-credit/smart-routing/waiting/abc123')
export function navigate(path) {
  window.location.hash = path;
}

export function App() {
  const [route, setRoute] = useState(parseHash);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (!route.industry) return <Home />;

  const industry = INDUSTRIES.find(i => i.id === route.industry);
  if (!industry) return <Home />;

  if (!route.demo) return <IndustryPage industry={industry} />;

  const demoConfig = industry.demos.find(d => d.id === route.demo);
  if (!demoConfig) return <IndustryPage industry={industry} />;

  const Component = demoConfig.component;
  return <Component key={`${route.industry}/${route.demo}`} screen={route.screen} param={route.param} />;
}
