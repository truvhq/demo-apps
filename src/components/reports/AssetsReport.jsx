/**
 * FILE SUMMARY: Renders VOA (Verification of Assets) report data
 * DATA FLOW: Receives report object via props from OrderResults
 * INTEGRATION PATTERN: Used by Orders flow (Mortgage) for asset verification
 *
 * Displays borrower info, balance summaries, per-provider account cards with
 * expandable transaction lists, and report-level metadata like the large
 * deposit threshold and reporting period.
 */

// Imports
import { useState } from 'preact/hooks';
import { $, fmtDate } from '../../utils/formatters.js';
import { Section, Row, ProviderHeader } from './shared.jsx';

// Sub-component: single transaction table row with credit/debit coloring
function TransactionRow({ txn }) {
  const isCredit = txn.type === 'CREDIT';
  return (
    <tr class="border-b border-border-light text-xs">
      <td class="py-2 px-2 text-gray-500">{fmtDate(txn.posted_at)}</td>
      <td class="py-2 px-2">{txn.description}</td>
      <td class="py-2 px-2 text-gray-400">{(txn.categories || []).join(', ')}</td>
      <td class={`py-2 px-2 text-right font-medium ${isCredit ? 'text-green-600' : ''}`}>{isCredit ? '+' : '-'}{$(txn.amount)}</td>
    </tr>
  );
}

// Sub-component: account card showing balances, metadata, and expandable transactions
function AccountCard({ acct }) {
  // State: toggle for showing/hiding the transaction list
  const [showTxns, setShowTxns] = useState(false);
  const bal = acct.balances || {};
  const txns = acct.transactions || [];
  const acctType = (acct.type || '').charAt(0) + (acct.type || '').slice(1).toLowerCase();

  return (
    <div class="border border-border rounded-lg mb-4 overflow-hidden">
      {/* Account header: type, mask, and current balance */}
      <div class="flex items-center justify-between px-4 py-3 bg-border-light">
        <div class="font-semibold text-sm">{acctType} {acct.mask}</div>
        {bal.balance != null && <div class="text-sm font-semibold">{$(bal.balance)}</div>}
      </div>
      {/* Account details: available balance, routing, owner, averages */}
      <div class="px-4 py-3">
        {bal.available_balance != null && <Row label="Available" value={$(bal.available_balance)} />}
        {acct.routing_number && <Row label="Routing" value={acct.routing_number} />}
        {acct.days_available && <Row label="Days of Data" value={String(acct.days_available)} />}
        {acct.owners?.length > 0 && <Row label="Owner" value={acct.owners.map(o => o.full_name || '').join(', ')} />}
        {acct.nsf != null && <Row label="NSF Count" value={String(acct.nsf)} />}
        {acct.summary && (
          <>
            {acct.summary.avg_30 && <Row label="30-Day Avg" value={$(acct.summary.avg_30)} />}
            {acct.summary.avg_60 && <Row label="60-Day Avg" value={$(acct.summary.avg_60)} />}
          </>
        )}
        {/* Expandable transaction table (capped at 20 visible rows) */}
        {txns.length > 0 && (
          <div class="mt-3">
            <button class="text-xs text-primary font-medium" onClick={() => setShowTxns(!showTxns)}>
              {showTxns ? 'Hide' : 'Show'} {txns.length} transactions
            </button>
            {showTxns && (
              <table class="w-full mt-2 border-collapse">
                <thead><tr class="border-b-2 border-border text-xs text-gray-500">
                  <th class="text-left px-2 py-1">Date</th>
                  <th class="text-left px-2 py-1">Description</th>
                  <th class="text-left px-2 py-1">Category</th>
                  <th class="text-right px-2 py-1">Amount</th>
                </tr></thead>
                <tbody>
                  {txns.slice(0, 20).map((t, ti) => <TransactionRow key={ti} txn={t} />)}
                  {txns.length > 20 && <tr><td colSpan="4" class="text-xs text-gray-400 px-2 py-2">+ {txns.length - 20} more</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Component: AssetsReport
// Props:
//   report : VOA report object with borrower, summary, and links[] containing accounts[]
export function AssetsReport({ report }) {
  // Guard: bail if no linked data
  if (!report?.links?.length) return null;
  const summary = report.summary;

  return (
    <div>
      {/* Borrower identification section */}
      {report.borrower && (
        <Section title="Borrower">
          <Row label="Name" value={`${report.borrower.first_name} ${report.borrower.last_name}`} />
          {report.borrower.email && <Row label="Email" value={report.borrower.email} />}
          {report.borrower.external_user_id && <Row label="External ID" value={report.borrower.external_user_id} />}
        </Section>
      )}
      {/* Aggregate balance summary across all accounts */}
      {summary && (
        <Section title="Balance Summary">
          {summary.balance && <Row label="Total Balance" value={$(summary.balance)} />}
          {summary.avg_30 && <Row label="30-Day Avg" value={$(summary.avg_30)} />}
          {summary.avg_60 && <Row label="60-Day Avg" value={$(summary.avg_60)} />}
          {summary.avg_90 && <Row label="90-Day Avg" value={$(summary.avg_90)} />}
        </Section>
      )}
      {/* Per-provider account cards */}
      {report.links.map((link, li) => (
        <div key={li}>
          <ProviderHeader name={link.provider_name || link.provider || 'Bank'} />
          {link.accounts?.map((acct, ai) => <AccountCard key={ai} acct={acct} />)}
        </div>
      ))}
      {/* Report-level metadata */}
      <Row label="Report Period" value={`${report.days_requested} days as of ${report.as_of_date}`} />
      <Row label="Large Deposit Threshold" value={$(report.large_deposit_threshold)} />
    </div>
  );
}
