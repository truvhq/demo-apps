/**
 * FILE SUMMARY: Public Sector page - the DemoHub with the public-sector demos,
 * ordered and labelled by use case. Route: #public-sector
 */
import { DemoHub } from './DemoHub.jsx';

// Use-case label on each demo card, and the display order (self-service first,
// then caseworker-led, then renewals, then documents). Ids match the registry in
// App.jsx; a demo missing here still shows, last and unlabelled. Demos flagged
// `guide` in the registry (Batching) are listed under Guides instead.
const USE_CASE = {
  'customer-portal': 'Applicant self-service',
  'verifier-portal': 'Caseworker request',
  'renewals-refresh': 'Renewals and recertification',
  'documents': 'Documents already collected',
};
const ORDER = Object.keys(USE_CASE);

export function PublicSectorHub({ industry, section }) {
  const rank = id => (ORDER.indexOf(id) < 0 ? 99 : ORDER.indexOf(id));
  const items = industry.demos.filter(d => !d.guide).sort((a, b) => rank(a.id) - rank(b.id)).map(d => ({
    key: d.id, demo: d, industryId: industry.id, label: USE_CASE[d.id],
  }));
  return (
    <DemoHub
      trail={[{ label: industry.name, href: `#${industry.id}` }]}
      back={{ href: '#', label: 'Home' }}
      eyebrow="Public Sector"
      title="Verify income and employment for benefits"
      lead={industry.desc}
      items={items}
      section={section}
    />
  );
}
