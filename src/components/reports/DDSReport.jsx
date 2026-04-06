import { $ } from '../../utils/formatters.js';
import { Section, Row } from './shared.jsx';

export function DDSReport({ report }) {
  if (!report) return null;

  const links = report.links || [];

  return (
    <div>
      <Section title="Deposit Switch">
        {report.completed_at && <Row label="Completed" value={report.completed_at} />}
      </Section>

      {links.map((link, i) => {
        const dd = link.deposit_details || {};
        return (
          <Section key={i} title={link.employer?.name || `Link ${i + 1}`}>
            {link.provider?.name && <Row label="Provider" value={link.provider.name} />}
            {dd.bank_name && <Row label="Bank" value={dd.bank_name} />}
            {dd.account_type && <Row label="Account Type" value={dd.account_type} />}
            {dd.account_number && <Row label="Account Number" value={`••••${String(dd.account_number).slice(-4)}`} />}
            {dd.routing_number && <Row label="Routing Number" value={dd.routing_number} />}
            {dd.deposit_type && <Row label="Deposit Type" value={dd.deposit_type} />}
            {dd.deposit_value && (
              <Row label="Deposit Value" value={
                dd.deposit_type === 'percent' ? `${dd.deposit_value}%`
                  : dd.deposit_type === 'amount' ? $(parseFloat(dd.deposit_value))
                  : dd.deposit_value
              } />
            )}
          </Section>
        );
      })}
    </div>
  );
}
