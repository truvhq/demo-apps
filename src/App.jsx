/**
 * FILE SUMMARY:
 * Root router and demo registry for the Truv demo-apps frontend.
 * Defines all available demos grouped by industry, provides hash-based
 * routing, and renders the correct component for each URL.
 *
 * DATA FLOW:
 * Browser (hash change) -> App component (parseHash) -> route state ->
 *   renders Home, IndustryPage, or a specific Demo component.
 * Demo components call navigate() to transition between screens, which
 *   updates window.location.hash and triggers a re-render cycle.
 *
 * Hash URL structure:
 *   #                                        -> Home (industry picker)
 *   #consumer-credit                         -> IndustryPage (list of demos)
 *   #consumer-credit/smart-routing           -> Demo intro screen
 *   #public-sector                           -> Public Sector page (Demos + Guides cards)
 *   #public-sector/batching                  -> the Batching guide (a demo flagged `guide`)
 *   #public-sector/embedded-orders[/<id>]    -> the Embedded Orders guide, optionally at a section or rule
 *   #consumer-credit/smart-routing/bridge/id -> Demo active screen
 *
 * Each demo component receives { screen, param } props from the router.
 * See SmartRouting.jsx for the Consumer Credit pattern (Bridge flow)
 * and POSApplication.jsx for the Mortgage pattern (Orders flow).
 */

// Imports: Preact hooks, page-level components, and all demo components.
import { useState, useEffect } from 'preact/hooks';
import { Home } from './Home.jsx';
import { IndustryPage } from './IndustryPage.jsx';
import { ConfigureScreen } from './components/ConfigureScreen.jsx';
import { PublicSectorSignIn } from './components/PublicSectorSignIn.jsx';
import { useSession } from './hooks/useSession.js';
import { hasCallbackParams, handleCallback, getIdToken } from './auth/auth0Client.js';
import { POSApplicationDemo } from './demos/POSApplication.jsx';
import { POSTasksDemo } from './demos/POSTasks.jsx';
import { CaseWorkerPortalDemo } from './demos/CaseWorkerPortal.jsx';
import { RenewalsRefreshDemo } from './demos/RenewalsRefresh.jsx';
import { DocumentProcessingDemo } from './demos/DocumentProcessing.jsx';
import { LOSDemo } from './demos/LOS.jsx';
import { CustomerPortalDemo } from './demos/CustomerPortal.jsx';
import { PSDocumentProcessingDemo } from './demos/PSDocumentProcessing.jsx';
import { BatchingWalkthrough } from './demos/Batching.jsx';
import { EmbeddedOrdersGuide } from './demos/EmbeddedOrdersGuide.jsx';
import { PublicSectorHub } from './industry/PublicSectorHub.jsx';
import { CoverageHub } from './industry/CoverageHub.jsx';
import { SmartRoutingDemo } from './demos/SmartRouting.jsx';
import { BankIncomeDemo } from './demos/BankIncome.jsx';
import { PayrollIncomeDemo } from './demos/PayrollIncome.jsx';
import { PaycheckLinkedLoansDemo } from './demos/PaycheckLinkedLoans.jsx';
import { IncomePLLChainedDemo } from './demos/IncomePLLChained.jsx';
import { DirectDepositSwitchDemo } from './demos/DirectDepositSwitch.jsx';
import { PayrollCoverageDemo } from './demos/PayrollCoverage.jsx';
import { BankCoverageDemo } from './demos/BankCoverage.jsx';

// INDUSTRIES registry: each entry has an id, display name, description, and a
// demos array. Each demo object maps { id, name, component, desc, tags } so
// the router can resolve a hash URL to a component and the UI can render cards.
export const INDUSTRIES = [
  {
    id: 'mortgage',
    name: 'Mortgage',
    desc: 'Verify borrower income, employment, and assets in minutes with GSE-certified reports for Day 1 Certainty.',
    demos: [
      { id: 'pos-application', name: 'POS Application', component: POSApplicationDemo, desc: 'A borrower fills out a loan application and verifies their income or employment in real time, right inside the point-of-sale.', tags: ['Company Search', 'Orders', 'Bridge', 'Reports'] },
      { id: 'pos-tasks', name: 'POS Tasks', component: POSTasksDemo, desc: 'After submitting a loan application, the borrower returns to complete remaining verifications: income, employment, and assets.', tags: ['Orders', 'Bridge', 'VOIE', 'VOE', 'Assets'] },
      { id: 'los', name: 'LOS', component: LOSDemo, desc: 'A Loan Processor creates verification orders from the LOS using borrower data on file. Borrowers receive a link to complete verification on their own.', tags: ['Orders', 'Share URL', 'Status Tracking', 'Reports'] },
      { id: 'documents', name: 'Document Processing', component: DocumentProcessingDemo, desc: 'Process pay stubs, W-2s, and tax returns already collected. Truv validates the documents and extracts structured income data for underwriting.', tags: ['Document Collections', 'Finalize', 'Parsed Data'] },
    ],
  },
  {
    id: 'public-sector',
    name: 'Public Sector',
    desc: 'Instant income and employment verification for benefit eligibility, program enrollment, and recertification.',
    demos: [
      { id: 'customer-portal', name: 'Customer Portal', component: CustomerPortalDemo, desc: 'An applicant applies for benefits and verifies their income and employment through a self-service portal.', tags: ['Company Search', 'Orders', 'Bridge', 'Reports'] },
      { id: 'documents', name: 'Document Processing', component: PSDocumentProcessingDemo, desc: 'Process pay stubs, W-2s, and tax returns to verify income for benefit eligibility decisions.', tags: ['Document Collections', 'Finalize', 'Parsed Data'] },
      { id: 'verifier-portal', name: 'Case Worker Portal', component: CaseWorkerPortalDemo, desc: 'A Case Worker creates verification orders using applicant data on file and sends verification links via email or SMS.', tags: ['Orders', 'Share URL', 'Status Tracking', 'Reports'] },
      { id: 'batching', name: 'Batching', component: BatchingWalkthrough, guide: true, desc: 'Animated walkthrough of bulk order intake: staff drop a CSV into a folder and a scheduled job creates one order per row. Ends with the setup guides and the runnable kit to hand to a customer.', tags: ['Guided', 'Bulk', 'CSV', 'Orders', 'Webhooks'] },
      { id: 'embedded-orders', name: 'Embedded Orders Field Guide', component: EmbeddedOrdersGuide, guide: true, desc: 'For teams building a benefits application: where the order page goes, nine rules, the settings to check, and a pre-launch checklist.', tags: ['Guide'] },
      { id: 'renewals-refresh', name: 'Renewals & Data Refresh', component: RenewalsRefreshDemo, desc: 'Recertify without asking for documents again. Refresh the payroll and bank connections applicants already made, see which refreshes finish on their own and which need the applicant, and contact only those applicants.', tags: ['Guided', 'Orders', 'Refresh', 'Webhooks'] },
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
      { id: 'income-pll', name: 'Income + PLL', component: IncomePLLChainedDemo, desc: 'Chained Orders pattern that maximizes PLL conversion: pre-check coverage and DDS support, run an income order so the borrower authenticates with payroll once, then create a linked PLL order that reuses the same session — they confirm the deduction without re-authenticating.', tags: ['Orders', 'Coverage', 'is_dds_supported', 'PLL Report'] },
    ],
  },
  {
    id: 'retail-banking',
    name: 'Retail Banking',
    desc: 'Acquire deposits and enable paycheck-linked lending with direct payroll connections.',
    demos: [
      { id: 'deposit-switch', name: 'Direct Deposit Switch', component: DirectDepositSwitchDemo, desc: 'Switch a customer\'s direct deposit to your bank through their payroll provider. Changes take effect on the next pay cycle.', tags: ['deposit_switch', 'Bridge', 'Payroll'] },
    ],
  },
  {
    id: 'coverage-analysis',
    name: 'Coverage Analysis',
    desc: 'Bulk-check Truv coverage for thousands of employers or financial institutions in one upload. Rate-limited and retried so you can run an entire book of business in minutes.',
    demos: [
      { id: 'payroll-coverage', name: 'Payroll Coverage', component: PayrollCoverageDemo, desc: 'Upload a CSV of up to 10,000 employers and see which ones Truv supports for income, employment, deposit-switch, or paycheck-linked-loans.', tags: ['Bulk', 'companies', 'CSV', 'Rate-limited'] },
      { id: 'bank-coverage', name: 'Financial Accounts Coverage', component: BankCoverageDemo, desc: 'Upload a CSV of up to 10,000 financial accounts and see which ones Truv can connect to for transactions or assets data.', tags: ['Bulk', 'providers', 'financial_accounts', 'CSV'] },
    ],
  },
];

// Parse the URL hash into route segments.
// e.g. "#consumer-credit/smart-routing/bridge/abc123"
//   -> { industry: "consumer-credit", demo: "smart-routing", screen: "bridge", param: "abc123" }
// A standalone build (VITE_STANDALONE_DEMO="industry/demo") opens straight on that
// demo instead of the Home grid, so a per-branch subdomain can be handed out as a
// bare link. Unset in the normal multi-demo build, where it changes nothing.
const STANDALONE = (import.meta.env?.VITE_STANDALONE_DEMO || '').trim();

function parseHash() {
  // An empty hash in a standalone build resolves to that build's single demo, so
  // the bare subdomain is a working link.
  const hash = window.location.hash.slice(1) || STANDALONE;
  const [industry, demo, screen, ...rest] = hash.split('/');
  return { industry: industry || '', demo: demo || '', screen: screen || '', param: rest.join('/') || '' };
}

// Navigation helper: demo components call this to transition between screens.
// Updates the hash, which triggers a hashchange event and re-render.
// Example: navigate('consumer-credit/smart-routing/waiting/abc123')
export function navigate(path) {
  window.location.hash = path;
}

// Build the breadcrumb trail for the current hash. Returns an ordered list of
// { label, href } segments (industry, then demo) resolved against INDUSTRIES.
// Callers render the final segment as the current page (not a link) and always
// prepend the Truv logo as the implicit Home root.
export function getBreadcrumbTrail() {
  const { industry, demo } = parseHash();
  const trail = [];
  const ind = INDUSTRIES.find(i => i.id === industry);
  if (!ind) return trail;
  trail.push({ label: ind.name, href: `#${ind.id}` });
  const dem = ind.demos.find(d => d.id === demo);
  if (dem) trail.push({ label: dem.name, href: `#${ind.id}/${dem.id}` });
  return trail;
}

// App component: top-level router. Listens for hashchange events, parses
// the hash into route segments, and renders the matching view.
export function App() {
  // Route state: re-parsed on every hashchange event.
  const [route, setRoute] = useState(parseHash);
  const session = useSession();
  const [ssoError, setSsoError] = useState(null);
  const [ssoCallbackBusy, setSsoCallbackBusy] = useState(hasCallbackParams);
  // Bumped when the current breadcrumb segment is clicked. Folded into the view
  // key below so the active view remounts (resetting its internal state) even
  // when the target hash is unchanged — e.g. clicking "LOS" while inside LOS,
  // whose whole flow lives at one hash, restarts it at its first screen.
  const [restartNonce, setRestartNonce] = useState(0);

  // Effect: subscribe to hashchange so navigation triggers re-renders, and to
  // the breadcrumb "restart current view" event.
  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    const onRestart = () => setRestartNonce(n => n + 1);
    window.addEventListener('hashchange', onHash);
    window.addEventListener('truv:restart-view', onRestart);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('truv:restart-view', onRestart);
    };
  }, []);

  // Effect: if the URL has ?code=&state=, complete the Auth0 callback and
  // exchange the access token for a demo session.
  useEffect(() => {
    if (!hasCallbackParams()) return;
    let cancelled = false;
    (async () => {
      try {
        await handleCallback();
        const token = await getIdToken();
        const result = await session.submitSso(token);
        if (cancelled) return;
        if (!result.ok) setSsoError(result);
      } catch (err) {
        if (!cancelled) {
          console.error('Auth callback failed:', err.message);
          setSsoError({ error: 'sso_callback_failed' });
        }
      } finally {
        if (!cancelled) setSsoCallbackBusy(false);
      }
    })();
    return () => { cancelled = true; };
    // session.submitSso is stable across renders via useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dev affordance: `?configure` forces the Configure screen even in local
  // mode (where the session is auto-authenticated), so it can be viewed and
  // styled locally. Harmless in production — it only renders the entry screen.
  const forceConfigure = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('configure');

  // Gate: BYO credentials must be configured before any demo can be reached.
  if (session.loading || ssoCallbackBusy) return null;

  // Exception: demos flagged `noSession` make no API calls at all — they are
  // static, animated explainers plus file downloads. Gating those behind
  // Configure would only get in the way of a shared hosted link, and unlike the
  // sandbox-bootstrap approach used by other hosted branches this needs no
  // credentials bundled into the build. `?configure` still wins, so the entry
  // screen stays reachable for styling.
  if (!forceConfigure && route.industry && route.demo) {
    const noSessionDemo = INDUSTRIES
      .find(i => i.id === route.industry)?.demos
      .find(d => d.id === route.demo && d.noSession);
    if (noSessionDemo) {
      const PublicDemo = noSessionDemo.component;
      return <PublicDemo key={`${route.industry}/${route.demo}/${restartNonce}`} screen={route.screen} param={route.param} />;
    }
  }

  // Sign-in: the Public Sector look for #public-sector links, the original screen
  // for everything else.
  if (forceConfigure || !session.authenticated) {
    const SignIn = route.industry === 'public-sector' ? PublicSectorSignIn : ConfigureScreen;
    return <SignIn onSubmit={session.submit} ssoError={ssoError} />;
  }

  // Routing logic: progressively resolve industry, then demo, then screen.
  // At each level, fall back to the parent view if no match is found.
  if (!route.industry) return <Home />;

  const industry = INDUSTRIES.find(i => i.id === route.industry);
  if (!industry) return <Home />;

  // Public Sector has its own Demos + Guides page; every other industry keeps IndustryPage.
  // #public-sector/demos, /guides and /tools scroll to that section of the page.
  const Landing = industry.id === 'public-sector' ? PublicSectorHub
    : industry.id === 'coverage-analysis' ? CoverageHub : IndustryPage;
  if (!route.demo) return <Landing key={`industry/${route.industry}/${restartNonce}`} industry={industry} />;
  if (route.demo === 'demos' || route.demo === 'guides' || route.demo === 'tools') {
    return <Landing key={`industry/${route.industry}/${route.demo}/${restartNonce}`} industry={industry} section={route.demo} />;
  }

  const demoConfig = industry.demos.find(d => d.id === route.demo);
  if (!demoConfig) return <Landing key={`industry/${route.industry}/${restartNonce}`} industry={industry} />;

  // Render the matched demo component with screen and param props.
  const Component = demoConfig.component;
  return <Component key={`${route.industry}/${route.demo}/${restartNonce}`} screen={route.screen} param={route.param} />;
}
