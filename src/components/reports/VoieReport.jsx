import { useState } from 'preact/hooks';
import { $, freq } from '../../utils/formatters.js';
import { Section, Row, ProviderHeader } from './shared.jsx';

function PayStatement({ st }) {
  const [open, setOpen] = useState(false);
  return (
    <div class="border border-border rounded-lg mb-3 overflow-hidden">
      <div class="flex items-center justify-between px-4 py-3 bg-border-light cursor-pointer" onClick={() => setOpen(!open)}>
        <div class="font-semibold text-sm">Pay Date: {st.pay_date}</div>
        <div class="text-sm">Gross: {$(st.gross_pay)}  Net: {$(st.net_pay)}</div>
      </div>
      {open && (
        <div class="px-4 py-3">
          <Row label="Period" value={`${st.period_start || ''} to ${st.period_end || ''}`} />
          <Row label="Hours" value={st.hours || '-'} />
          <Row label="Regular" value={st.regular ? $(st.regular) : '-'} />
          <Row label="Overtime" value={st.overtime ? $(st.overtime) : '-'} />
          {st.earnings?.length > 0 && (
            <>
              <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide my-2">Earnings</div>
              <table class="w-full text-xs"><tbody>
                {st.earnings.map((e, i) => <tr key={i} class="border-b border-border-light"><td class="py-1 px-2">{e.name}</td><td class="py-1 px-2 text-right font-medium">{$(e.amount)}</td></tr>)}
              </tbody></table>
            </>
          )}
          {st.deductions?.length > 0 && (
            <>
              <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide my-2">Deductions</div>
              <table class="w-full text-xs"><tbody>
                {st.deductions.map((d, i) => <tr key={i} class="border-b border-border-light"><td class="py-1 px-2">{d.name}</td><td class="py-1 px-2 text-right font-medium text-error">-{$(d.amount)}</td></tr>)}
              </tbody></table>
            </>
          )}
          {st.file && <a href={st.file} target="_blank" rel="noopener noreferrer" class="inline-block mt-2.5 text-xs text-primary font-medium">Download PDF</a>}
        </div>
      )}
    </div>
  );
}

export function VoieReport({ report }) {
  if (!report?.links?.length) return null;

  return report.links.map((link, li) => {
    const meta = [link.provider_name || link.provider?.name, link.data_source].filter(Boolean).join(' • ');
    const suspicious = link.is_suspicious;
    return (link.employments || []).map((emp, ei) => {
      const profile = emp.profile || {};
      const company = emp.company || {};
      const stmts = emp.statements || [];
      const annualSummary = emp.annual_income_summary || [];
      const bankAccounts = emp.bank_accounts || [];
      const w2s = emp.w2s || [];

      return (
        <div key={`${li}-${ei}`}>
          <ProviderHeader name={company.name || link.provider_name || link.provider?.name || 'Employer'} logoUrl={link.provider?.logo_url} meta={meta} status="completed" />

          {suspicious !== undefined && (
            <div class={`flex items-center gap-2 px-4 py-3 rounded-lg mb-5 ${suspicious ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
              <span class={`text-sm font-semibold ${suspicious ? 'text-error' : 'text-success'}`}>{suspicious ? 'Suspicious Activity Detected' : 'No Suspicious Activity'}</span>
              <span class={`text-xs ${suspicious ? 'text-red-400' : 'text-green-500'}`}>is_suspicious: {String(suspicious)}</span>
            </div>
          )}

          {profile.first_name && (
            <Section title="Profile">
              <Row label="Full Name" value={profile.full_name || `${profile.first_name} ${profile.last_name}`} />
              {profile.email && <Row label="Email" value={profile.email} />}
              {profile.date_of_birth && <Row label="Date of Birth" value={profile.date_of_birth} />}
              {profile.ssn && <Row label="SSN" value={`***-**-${profile.ssn.slice(-4)}`} />}
              {profile.home_address && <Row label="Address" value={[profile.home_address.street, profile.home_address.city, profile.home_address.state, profile.home_address.zip].filter(Boolean).join(', ')} />}
            </Section>
          )}

          {emp.job_title && (
            <Section title="Employment">
              <Row label="Job Title" value={emp.job_title} />
              <Row label="Job Type" value={emp.job_type === 'F' ? 'Full-time' : emp.job_type === 'P' ? 'Part-time' : emp.job_type || '-'} />
              <Row label="Status" value={emp.is_active ? 'Active' : 'Inactive'} />
              <Row label="Start Date" value={emp.start_date || '-'} />
              {emp.end_date && <Row label="End Date" value={emp.end_date} />}
              {emp.original_hire_date && <Row label="Original Hire Date" value={emp.original_hire_date} />}
              {emp.manager_name && <Row label="Manager" value={emp.manager_name} />}
              {emp.income && <Row label="Annual Income" value={$(emp.income)} />}
              {emp.pay_rate && <Row label="Pay Rate" value={`${$(emp.pay_rate)} ${freq(emp.pay_frequency)}`} />}
              {company.phone && <Row label="Company Phone" value={company.phone} />}
              {company.address && <Row label="Company Address" value={[company.address.street, company.address.city, company.address.state, company.address.zip].filter(Boolean).join(', ')} />}
            </Section>
          )}

          {annualSummary.length > 0 && (
            <Section title="Annual Income Summary">
              <table class="w-full text-sm border-collapse">
                <thead><tr class="border-b-2 border-border">
                  {['Year', 'Gross Pay', 'Net Pay', 'Regular', 'Overtime', 'Other'].map(h => <th key={h} class="text-left px-3 py-2 font-semibold text-gray-500">{h}</th>)}
                </tr></thead>
                <tbody>
                  {annualSummary.map((yr, i) => (
                    <tr key={i} class="border-b border-border-light">
                      <td class="px-3 py-2 font-semibold">{yr.year}</td>
                      <td class="px-3 py-2">{$(yr.gross_pay)}</td>
                      <td class="px-3 py-2">{$(yr.net_pay)}</td>
                      <td class="px-3 py-2">{yr.regular ? $(yr.regular) : '-'}</td>
                      <td class="px-3 py-2">{yr.overtime ? $(yr.overtime) : '-'}</td>
                      <td class="px-3 py-2">{yr.other_pay ? $(yr.other_pay) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {stmts.length > 0 && (
            <Section title={`Pay Statements (${stmts.length})`}>
              {stmts.slice(0, 3).map((st, i) => <PayStatement key={i} st={st} />)}
              {stmts.length > 3 && <p class="text-xs text-gray-400">+ {stmts.length - 3} more</p>}
            </Section>
          )}

          {w2s.length > 0 && (
            <Section title="W-2 Forms">
              <table class="w-full text-sm border-collapse">
                <thead><tr class="border-b-2 border-border">
                  {['Year', 'Wages', 'Federal Tax', 'SS Tax', 'Medicare Tax', ''].map(h => <th key={h} class="text-left px-3 py-2 font-semibold text-gray-500">{h}</th>)}
                </tr></thead>
                <tbody>
                  {w2s.map((w, i) => (
                    <tr key={i} class="border-b border-border-light">
                      <td class="px-3 py-2 font-semibold">{w.year}</td>
                      <td class="px-3 py-2">{w.wages ? $(w.wages) : '-'}</td>
                      <td class="px-3 py-2">{w.federal_tax ? $(w.federal_tax) : '-'}</td>
                      <td class="px-3 py-2">{w.social_security_tax ? $(w.social_security_tax) : '-'}</td>
                      <td class="px-3 py-2">{w.medicare_tax ? $(w.medicare_tax) : '-'}</td>
                      <td class="px-3 py-2">{w.file && <a href={w.file} target="_blank" rel="noopener noreferrer" class="text-primary font-medium text-xs">PDF</a>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {bankAccounts.length > 0 && (
            <Section title="Bank Accounts">
              {bankAccounts.map((ba, i) => (
                <div key={i}>
                  <Row label={`Account ${i + 1}`} value={`${ba.bank_name || ''} • ${ba.account_type === 'C' ? 'Checking' : 'Savings'} • ...${(ba.account_number || '').slice(-4)}`} />
                  <Row label="Deposit" value={`${ba.deposit_type === 'A' ? 'Amount: ' : 'Percent: '}${$(ba.deposit_value)}`} />
                </div>
              ))}
            </Section>
          )}
        </div>
      );
    });
  });
}
