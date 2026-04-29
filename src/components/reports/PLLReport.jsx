/**
 * FILE SUMMARY: Renders Paycheck-Linked Loan report data
 * DATA FLOW: Receives PLL report object via props from the PaycheckLinkedLoans demo
 * INTEGRATION PATTERN: Bridge flow (Consumer Credit) via GET /v1/links/{link_id}/pll/report/
 *
 * Displays deposit allocation details (bank, account, routing, deposit type/value),
 * employer and payroll provider info, and a suspicious-activity flag.
 */

// Imports
import { $ } from '../../utils/formatters.js';
import { Section, Row, ProviderHeader } from './shared.jsx';

// Component: PLLReport
// Props:
//   report : PLL detail object from GET /v1/links/{link_id}/pll/report/
export function PLLReport({ report }) {
  if (!report) return null;

  const dd = report.deposit_details || {};

  return (
    <div>
      {/* Employer and provider header */}
      <ProviderHeader
        name={report.employer?.name || 'Employer'}
        logoUrl={report.employer?.logo_url}
        meta={report.provider?.name}
        status={report.status}
      />

      {/* Deposit allocation details */}
      <Section title="Deposit Allocation">
        {dd.bank_name && <Row label="Bank" value={dd.bank_name} />}
        {dd.account_type && <Row label="Account Type" value={dd.account_type} />}
        {dd.account_number && <Row label="Account Number" value={`\u2022\u2022\u2022\u2022${String(dd.account_number).slice(-4)}`} />}
        {dd.routing_number && <Row label="Routing Number" value={dd.routing_number} />}
        {dd.deposit_type && <Row label="Deposit Type" value={dd.deposit_type} />}
        {dd.deposit_value != null && (
          <Row label="Deposit Value" value={
            dd.deposit_type === 'percent' ? `${dd.deposit_value}%`
              : dd.deposit_type === 'amount' ? $(parseFloat(dd.deposit_value))
              : dd.deposit_value
          } />
        )}
      </Section>

      {/* Verification metadata */}
      <Section title="Verification">
        {report.finished_at && <Row label="Completed" value={new Date(report.finished_at).toLocaleString()} />}
        {report.is_suspicious != null && (
          <Row label="Suspicious Activity" value={report.is_suspicious ? 'Flagged' : 'None detected'} />
        )}
        {report.tracking_info && <Row label="Tracking Info" value={report.tracking_info} />}
      </Section>

      {/* PDF report link */}
      {report.pdf_report && (
        <Section title="Documents">
          <Row label="PDF Report" value={<a href={report.pdf_report} target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">Download</a>} />
        </Section>
      )}
    </div>
  );
}
