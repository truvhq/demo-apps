/**
 * FILE SUMMARY: ApplicationForm
 * DATA FLOW: User fills PII form -> onSubmit -> demo page sends POST /api/orders or POST /api/bridge-token
 * INTEGRATION PATTERN: Shared by both Orders flow (Mortgage/Public Sector) and Bridge flow (Consumer Credit/Retail Banking)
 *
 * Collects applicant PII (name, email, phone, SSN) and employer/institution selection.
 * On submit, packages form data with the correct ID field (company_mapping_id for payroll
 * employers, provider_id for banks) and passes it to the parent demo via onSubmit callback.
 */

// Preact state hook and child component for employer/institution search
import { useState } from 'preact/hooks';
import { CompanySearch } from './CompanySearch.jsx';

// Props: onSubmit (callback), submitting (loading state), productType (Truv product type),
// showEmployer (toggle search field), employerLabel (custom label), dataSource, sessionId
export function ApplicationForm({ onSubmit, submitting, productType, showEmployer = true, employerLabel, dataSource, sessionId }) {
  // Form state: terms agreement checkbox and selected employer/institution
  const [agree, setAgree] = useState(true);
  const [employer, setEmployer] = useState({ name: '', id: null });
  const isAssets = productType === 'assets';
  const label = employerLabel || (isAssets ? 'Financial institution' : 'Employer');

  // Form submission handler: collects all fields from FormData, attaches the correct
  // ID type (company_mapping_id vs provider_id) based on whether this is a bank or payroll flow,
  // then calls onSubmit which triggers POST /api/orders or POST /api/bridge-token in the parent.
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!agree) return;
    const fd = new FormData(e.target);
    const isBank = isAssets || dataSource === 'financial_accounts';
    const formResult = {
      first_name: fd.get('first_name') || undefined,
      last_name: fd.get('last_name') || undefined,
      email: fd.get('email') || undefined,
      phone: fd.get('phone') || undefined,
      ssn: fd.get('ssn') || undefined,
      product_type: productType,
      employer: employer.name || undefined,
    };
    // Employers use company_mapping_id, financial institutions use provider_id
    if (employer.id) {
      if (isBank) {
        formResult.provider_id = employer.id;
      } else {
        formResult.company_mapping_id = employer.id;
      }
    }
    onSubmit(formResult);
  };

  // Render: PII collection form with name fields, employer/institution search, contact info,
  // terms checkbox, and submit button
  return (
    <form onSubmit={handleSubmit}>
      <h2 class="text-2xl font-bold tracking-tight mb-7">Tell us about yourself</h2>
      {/* Name fields: first and last name in a 2-column grid */}
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div><label class="text-sm font-medium mb-1.5 block">First name <span class="text-red-400">*</span></label><input name="first_name" defaultValue="John" class="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:border-primary focus:outline-none" /></div>
        <div><label class="text-sm font-medium mb-1.5 block">Last name <span class="text-red-400">*</span></label><input name="last_name" defaultValue="Doe" class="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:border-primary focus:outline-none" /></div>
      </div>
      {/* Employer/institution search: rendered conditionally via showEmployer prop */}
      {showEmployer && (
        <div class="mb-4">
          <label class="text-sm font-medium mb-1.5 block">{label}</label>
          <CompanySearch value={employer.name} onChange={setEmployer} productType={productType} dataSource={isAssets ? 'financial_accounts' : dataSource} placeholder={`Search for ${label.toLowerCase()}...`} sessionId={sessionId} />
        </div>
      )}
      {/* Contact fields: email, phone, and SSN */}
      <div class="mb-4"><label class="text-sm font-medium mb-1.5 block">Email</label><input name="email" type="email" placeholder="joe@example.com" class="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:border-primary focus:outline-none" /></div>
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div><label class="text-sm font-medium mb-1.5 block">Phone</label><input name="phone" type="tel" placeholder="123456789" class="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:border-primary focus:outline-none" /></div>
        <div><label class="text-sm font-medium mb-1.5 block">SSN (last 4)</label><input name="ssn" placeholder="6789" class="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:border-primary focus:outline-none" /></div>
      </div>
      {/* Terms of Service agreement checkbox */}
      <label class="flex items-center gap-2.5 my-6 cursor-pointer text-sm text-gray-500">
        <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} class="w-4.5 h-4.5 accent-primary" />
        I agree to the Terms of Service
      </label>
      {/* Submit button: disabled while submitting or if terms not accepted */}
      <button type="submit" disabled={!agree || submitting} class="w-full py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover disabled:opacity-40">
        {submitting ? <span class="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Continue'}
      </button>
    </form>
  );
}
