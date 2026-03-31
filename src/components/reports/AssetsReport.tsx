import { useState } from 'preact/hooks';
import { $, fmtDate } from '../../utils/formatters';
import { Section, Row, ProviderHeader } from './shared';

interface Transaction {
  posted_at?: string;
  description?: string;
  categories?: string[];
  type?: string;
  amount: number;
}

interface Balance { balance?: number; available_balance?: number }
interface Owner { full_name?: string }
interface AccountSummary { avg_30?: number; avg_60?: number }

interface Account {
  type?: string;
  mask?: string;
  balances?: Balance;
  transactions?: Transaction[];
  routing_number?: string;
  days_available?: number;
  owners?: Owner[];
  nsf?: number;
  summary?: AccountSummary;
}

function TransactionRow({ txn }: { txn: Transaction }) {
  const isCredit = txn.type === 'CREDIT';
  return (
    <tr class="border-b border-border-light text-xs">
      <td class="py-2 px-2 text-gray-500">{fmtDate(txn.posted_at)}</td>
      <td class="py-2 px-2">{txn.description}</td>
      <td class="py-2 px-2 text-gray-400">{(txn.categories ?? []).join(', ')}</td>
      <td class={`py-2 px-2 text-right font-medium ${isCredit ? 'text-green-600' : ''}`}>{isCredit ? '+' : '-'}{$(txn.amount)}</td>
    </tr>
  );
}

function AccountCard({ acct }: { acct: Account }) {
  const [showTxns, setShowTxns] = useState(false);
  const bal = acct.balances ?? {};
  const txns = acct.transactions ?? [];
  const acctType = (acct.type ?? '').charAt(0) + (acct.type ?? '').slice(1).toLowerCase();

  return (
    <div class="border border-border rounded-lg mb-4 overflow-hidden">
      <div class="flex items-center justify-between px-4 py-3 bg-border-light">
        <div class="font-semibold text-sm">{acctType} {acct.mask}</div>
        {bal.balance != null && <div class="text-sm font-semibold">{$(bal.balance)}</div>}
      </div>
      <div class="px-4 py-3">
        {bal.available_balance != null && <Row label="Available" value={$(bal.available_balance)} />}
        {acct.routing_number && <Row label="Routing" value={acct.routing_number} />}
        {acct.days_available != null && <Row label="Days of Data" value={String(acct.days_available)} />}
        {(acct.owners?.length ?? 0) > 0 && <Row label="Owner" value={acct.owners!.map(o => o.full_name ?? '').join(', ')} />}
        {acct.nsf != null && <Row label="NSF Count" value={String(acct.nsf)} />}
        {acct.summary && (
          <>
            {acct.summary.avg_30 != null && <Row label="30-Day Avg" value={$(acct.summary.avg_30)} />}
            {acct.summary.avg_60 != null && <Row label="60-Day Avg" value={$(acct.summary.avg_60)} />}
          </>
        )}
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
                  {txns.length > 20 && <tr><td colSpan={4} class="text-xs text-gray-400 px-2 py-2">+ {txns.length - 20} more</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface Borrower { first_name?: string; last_name?: string; email?: string; external_user_id?: string }
interface ReportSummary { balance?: number; avg_30?: number; avg_60?: number; avg_90?: number }
interface ReportLink { provider_name?: string; provider?: string; accounts?: Account[] }

interface AssetsReportData {
  links?: ReportLink[];
  borrower?: Borrower;
  summary?: ReportSummary;
  days_requested?: number;
  as_of_date?: string;
  large_deposit_threshold?: number;
}

export function AssetsReport({ report }: { report?: AssetsReportData }) {
  if (!report?.links?.length) return null;
  const summary = report.summary;

  return (
    <div>
      {report.borrower && (
        <Section title="Borrower">
          <Row label="Name" value={`${report.borrower.first_name} ${report.borrower.last_name}`} />
          {report.borrower.email && <Row label="Email" value={report.borrower.email} />}
          {report.borrower.external_user_id && <Row label="External ID" value={report.borrower.external_user_id} />}
        </Section>
      )}
      {summary && (
        <Section title="Balance Summary">
          {summary.balance != null && <Row label="Total Balance" value={$(summary.balance)} />}
          {summary.avg_30 != null && <Row label="30-Day Avg" value={$(summary.avg_30)} />}
          {summary.avg_60 != null && <Row label="60-Day Avg" value={$(summary.avg_60)} />}
          {summary.avg_90 != null && <Row label="90-Day Avg" value={$(summary.avg_90)} />}
        </Section>
      )}
      {report.links.map((link, li) => (
        <div key={li}>
          <ProviderHeader name={link.provider_name ?? (typeof link.provider === 'string' ? link.provider : undefined) ?? 'Bank'} />
          {link.accounts?.map((acct, ai) => <AccountCard key={ai} acct={acct} />)}
        </div>
      ))}
      <Row label="Report Period" value={`${report.days_requested} days as of ${report.as_of_date}`} />
      <Row label="Large Deposit Threshold" value={$(report.large_deposit_threshold)} />
    </div>
  );
}
