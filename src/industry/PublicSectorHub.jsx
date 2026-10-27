/**
 * FILE SUMMARY: Public Sector page - the DemoHub with the public-sector demos,
 * in a fixed order. Route: #public-sector
 */
import { DemoHub } from './DemoHub.jsx';

// Card text for each demo, in display order (self-service first, then
// caseworker-led, then renewals, then documents). Ids match the registry in
// App.jsx; a demo missing here still shows, last, with its registry text. Demos
// flagged `guide` in the registry (Batching) are listed under Guides instead; the
// coverage tools are listed under Tools (see DemoHub.jsx).
const CARD_TEXT = {
  'customer-portal': 'An applicant applies for benefits in a self-service portal. Their answers decide whether income, assets, or both get verified.',
  'verifier-portal': 'A case worker creates verification orders from applicant data on file and sends the link by email or SMS.',
  'renewals-refresh': 'Recertify without asking for documents again. Refresh the connections applicants already made, and contact only those who need to act.',
  'documents': 'Verify income from pay stubs, W-2s, and tax returns you have already collected.',
};
const ORDER = Object.keys(CARD_TEXT);

export function PublicSectorHub({ industry, section }) {
  const rank = id => (ORDER.indexOf(id) < 0 ? 99 : ORDER.indexOf(id));
  const items = industry.demos.filter(d => !d.guide).sort((a, b) => rank(a.id) - rank(b.id)).map(d => ({
    key: d.id, demo: d, industryId: industry.id, desc: CARD_TEXT[d.id] || d.desc,
  }));
  return (
    <DemoHub
      trail={[{ label: industry.name, href: `#${industry.id}` }]}
      back={{ href: '#', label: 'Home' }}
      title="Verify income and employment for benefits"
      lead="Run the applicant, case worker, and renewal flows, then use the guides to build them into your own systems."
      items={items}
      section={section}
    />
  );
}
