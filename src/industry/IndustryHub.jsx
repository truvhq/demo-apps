/**
 * FILE SUMMARY: Industry page for every industry without a custom page - the
 * shared DemoHub with that industry's demos and the placeholder guides.
 * Route: #<industry-id>
 */
import { DemoHub } from './DemoHub.jsx';

export function IndustryHub({ industry, section }) {
  const items = industry.demos.filter(d => !d.guide).map(d => ({
    key: d.id, demo: d, industryId: industry.id, industryName: industry.name,
  }));
  return (
    <DemoHub
      trail={[{ label: industry.name, href: `#${industry.id}` }]}
      back={{ href: '#', label: 'All demos' }}
      eyebrow="Industry"
      title={industry.name}
      lead={industry.desc}
      items={items}
      industryId={industry.id}
      section={section}
    />
  );
}
