/**
 * FILE SUMMARY: Renders Direct Deposit Switch report data
 * DATA FLOW: Receives report object via props from the Retail Banking demo screen
 * INTEGRATION PATTERN: Bridge flow (Retail Banking)
 *
 * Displays a completion timestamp and per-link deposit details including bank
 * name, account info, routing number, and deposit allocation (percent or amount).
 */

// Imports
import { $ } from '../../utils/formatters.js';
import { Section, Row } from './shared.jsx';

// Component: DDSReport
// Props:
//   report : DDS report object with completed_at and links[] containing deposit_details
export function DDSReport({ report }) {
  // Guard: bail if no report data
  if (!report) return null;

  const links = report.links || [];

  return (
    <div>
      {/* Completion status */}
      <Section title="Deposit Switch">
        {report.completed_at && <Row label="Completed" value={report.completed_at} />}
      </Section>

      {/* Per-link deposit details: employer, provider, bank account, allocation */}
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
            {/* Deposit value formatted as percent, dollar amount, or raw value */}
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
