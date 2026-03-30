import { $, freq } from '../../utils/formatters.js';
import { Section, Row } from './shared.jsx';

export function IncomeInsightsReport({ report }) {
  if (!report) return null;
  const summary = report.bank_income_summary;

  return (
    <div>
      {summary && (
        <Section title="Income Summary">
          {summary.start_date && <Row label="Period" value={`${summary.start_date} to ${summary.end_date}`} />}
          <Row label="Income Sources" value={String(summary.income_sources_count || 0)} />
          <Row label="Income Categories" value={String(summary.income_categories_count || 0)} />
          <Row label="Total Transactions" value={String(summary.income_transactions_count || 0)} />
          {summary.total_amounts?.length > 0 && <Row label="Total Income" value={summary.total_amounts.map(a => `${$(a.amount)} ${a.iso_currency_code}`).join(', ')} />}
          {summary.historical_average_monthly_income?.length > 0 && <Row label="Avg Monthly Income" value={summary.historical_average_monthly_income.map(a => `${$(a.amount)} ${a.iso_currency_code}`).join(', ')} />}
          {summary.forecasted_average_monthly_income?.length > 0 && <Row label="Forecasted Monthly" value={summary.forecasted_average_monthly_income.map(a => `${$(a.amount)} ${a.iso_currency_code}`).join(', ')} />}
          {summary.historical_annual_income?.length > 0 && <Row label="Annual Income" value={summary.historical_annual_income.map(a => `${$(a.amount)} ${a.iso_currency_code}`).join(', ')} />}
        </Section>
      )}

      {report.links?.map((link, li) => (
        <div key={li}>
          <Section title={link.provider_name || 'Source'}>
            {(link.bank_income_sources || []).map((src, si) => (
              <div key={si} class="border border-border rounded-lg mb-3 p-4">
                <Row label="Description" value={src.income_description || '-'} />
                <Row label="Category" value={(src.income_category || '').replace(/_/g, ' ')} />
                <Row label="Frequency" value={freq(src.pay_frequency)} />
                <Row label="Total" value={$(src.total_amount)} />
                <Row label="Avg Deposit" value={$(src.avg_deposit_amount)} />
                <Row label="Transactions" value={String(src.transaction_count || 0)} />
                {src.next_payment_date && <Row label="Next Payment" value={src.next_payment_date} />}
              </div>
            ))}
          </Section>
        </div>
      ))}
    </div>
  );
}
