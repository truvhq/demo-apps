/**
 * FILE SUMMARY: Public Sector page - the shared DemoHub with public-sector
 * demos, ordered and labelled by use case. Route: #public-sector
 */
import { DemoHub } from './DemoHub.jsx';

// Use-case label on each demo tile, and the display order (self-service first,
// then caseworker-led, then documents). Ids match the registry in App.jsx; a
// demo missing here still shows, last and unlabelled.
const USE_CASE = {
  'customer-portal': 'Applicant self-service',
  'verifier-portal': 'Caseworker request',
  'batching': 'Caseworker request · bulk',
  'documents': 'Documents already collected',
};
const ORDER = Object.keys(USE_CASE);

export function PublicSectorHub({ industry, section }) {
  const rank = id => (ORDER.indexOf(id) < 0 ? 99 : ORDER.indexOf(id));
  const items = [...industry.demos].sort((a, b) => rank(a.id) - rank(b.id)).map(d => ({
    key: d.id, demo: d, industryId: industry.id, industryName: industry.name, label: USE_CASE[d.id],
  }));
  return (
    <DemoHub
      trail={[{ label: industry.name, href: `#${industry.id}` }]}
      back={{ href: '#', label: 'All demos' }}
      eyebrow="Public Sector"
      title="Verify income and employment for benefits"
      lead={industry.desc}
      items={items}
      section={section}
    />
  );
}
