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

export const INDUSTRIES = [
  {
    id: 'mortgage',
    name: 'Mortgage',
    desc: 'Point-of-sale applications, follow-up verification tasks, LOS integration, and document processing.',
    demos: [
      { id: 'pos-application', name: 'POS Application', component: ApplicationDemo, desc: 'The user fills in their details, selects their employer, and completes income or employment verification through Bridge.', tags: ['Company Search', 'Orders', 'Bridge', 'Reports'] },
      { id: 'pos-tasks', name: 'POS Tasks', component: FollowUpDemo, desc: 'After submitting an application, the user returns to a dashboard of verification tasks and completes them one by one.', tags: ['Orders', 'Bridge', 'VOIE', 'VOE', 'Assets'] },
      { id: 'los', name: 'LOS', component: LOSDemo, desc: 'The user already submitted and left. A loan officer creates orders using collected data, sends a link with email/phone, and tracks completion.', tags: ['Orders', 'Share URL', 'Status Tracking', 'Reports'] },
      { id: 'documents', name: 'Document Processing', component: UploadDocumentsDemo, desc: 'Process pay stubs, W-2s, and tax returns already collected. Truv validates, classifies, and extracts structured data.', tags: ['Document Collections', 'Finalize', 'Parsed Data'] },
    ],
  },
  {
    id: 'public-sector',
    name: 'Public Sector',
    desc: 'Customer-facing portals, document processing, and verifier-initiated verification.',
    demos: [
      { id: 'customer-portal', name: 'Customer Portal', component: CustomerPortalDemo, desc: 'The customer fills in their details, selects their employer, and completes verification through Bridge.', tags: ['Company Search', 'Orders', 'Bridge', 'Reports'] },
      { id: 'documents', name: 'Document Processing', component: PSDocumentsDemo, desc: 'Process pay stubs, W-2s, and tax returns already collected. Truv validates, classifies, and extracts structured data.', tags: ['Document Collections', 'Finalize', 'Parsed Data'] },
      { id: 'verifier-portal', name: 'Verifier Portal', component: EmployeePortalDemo, desc: 'The user already submitted and left. A verifier creates orders using collected data, sends a link with email/phone, and tracks completion.', tags: ['Orders', 'Share URL', 'Status Tracking', 'Reports'] },
    ],
  },
  {
    id: 'consumer-credit',
    name: 'Consumer Credit',
    desc: 'Income verification, payroll-linked lending, smart routing, and choice-based verification.',
    demos: [],  // Populated in Units 5-7
  },
  {
    id: 'retail-banking',
    name: 'Retail Banking',
    desc: 'Direct deposit switching and payroll card enrollment.',
    demos: [],  // Populated in Unit 5
  },
];

function parseHash() {
  const hash = window.location.hash.slice(1);
  const [industry, demo, screen, ...rest] = hash.split('/');
  return { industry: industry || '', demo: demo || '', screen: screen || '', param: rest.join('/') || '' };
}

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
