import { Section, Row, StatusBadge } from './shared.jsx';
import { $ } from '../../utils/formatters.js';

export function DDSReport({ report }) {
  if (!report) return null;

  const ds = report.deposit_switch || report;
  const accounts = ds.bank_accounts || report.bank_accounts || [];
  const status = ds.status || report.status;

  return (
    <div>
      <Section title="Deposit Switch">
        {status && <Row label="Status" value={<StatusBadge status={status} />} />}
        {report.user_id && <Row label="User ID" value={report.user_id} />}
        {report.created_at && <Row label="Created" value={report.created_at} />}
        {report.updated_at && <Row label="Updated" value={report.updated_at} />}
      </Section>

      {accounts.length > 0 && (
        <Section title="Bank Accounts">
          {accounts.map((acct, i) => (
            <div key={i} class={i > 0 ? 'mt-4 pt-4 border-t border-[#f5f5f7]' : ''}>
              {acct.bank_name && <Row label="Bank" value={acct.bank_name} />}
              {acct.account_type && <Row label="Account Type" value={acct.account_type} />}
              {acct.account_number && <Row label="Account Number" value={`••••${String(acct.account_number).slice(-4)}`} />}
              {acct.routing_number && <Row label="Routing Number" value={acct.routing_number} />}
              {acct.deposit_type && <Row label="Deposit Type" value={acct.deposit_type} />}
              {acct.deposit_value && (
                <Row label="Deposit Value" value={
                  acct.deposit_type === 'percent' ? `${acct.deposit_value}%`
                    : acct.deposit_type === 'amount' ? $(parseFloat(acct.deposit_value))
                    : acct.deposit_value
                } />
              )}
              {acct.bank_address && <Row label="Bank Address" value={acct.bank_address} />}
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}
