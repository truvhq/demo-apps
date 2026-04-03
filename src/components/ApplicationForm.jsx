import { useState } from 'preact/hooks';
import { CompanySearch } from './CompanySearch.jsx';

export function ApplicationForm({ onSubmit, submitting, productType, showEmployer = true, employerLabel, dataSource }) {
  const [agree, setAgree] = useState(true);
  const [employer, setEmployer] = useState({ name: '', id: null });
  const isAssets = productType === 'assets';
  const label = employerLabel || (isAssets ? 'Financial institution' : 'Employer');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!agree) return;
    if (showEmployer && !isAssets && !employer.name) return;
    const fd = new FormData(e.target);
    onSubmit({
      first_name: fd.get('first_name') || undefined,
      last_name: fd.get('last_name') || undefined,
      email: fd.get('email') || undefined,
      phone: fd.get('phone') || undefined,
      ssn: fd.get('ssn') || undefined,
      product_type: productType,
      employer: employer.name || undefined,
      company_mapping_id: employer.id || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2 class="text-2xl font-bold tracking-tight mb-1.5">Your information</h2>
      <p class="text-sm text-gray-500 leading-relaxed mb-7">Enter your details to start the verification process.</p>
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div><label class="text-sm font-medium mb-1.5 block">First name</label><input name="first_name" placeholder="Joe" class="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:border-primary focus:outline-none" /></div>
        <div><label class="text-sm font-medium mb-1.5 block">Last name</label><input name="last_name" placeholder="Doe" class="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:border-primary focus:outline-none" /></div>
      </div>
      {showEmployer && (
        <div class="mb-4">
          <label class="text-sm font-medium mb-1.5 block">{label}</label>
          <CompanySearch value={employer.name} onChange={setEmployer} productType={productType} dataSource={dataSource} placeholder={`Search for ${label.toLowerCase()}...`} />
        </div>
      )}
      <div class="mb-4"><label class="text-sm font-medium mb-1.5 block">Email</label><input name="email" type="email" placeholder="joe@example.com" class="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:border-primary focus:outline-none" /></div>
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div><label class="text-sm font-medium mb-1.5 block">Phone</label><input name="phone" type="tel" placeholder="123456789" class="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:border-primary focus:outline-none" /></div>
        <div><label class="text-sm font-medium mb-1.5 block">SSN (last 4)</label><input name="ssn" placeholder="6789" class="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:border-primary focus:outline-none" /></div>
      </div>
      <label class="flex items-center gap-2.5 my-6 cursor-pointer text-sm text-gray-500">
        <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} class="w-4.5 h-4.5 accent-primary" />
        I agree to the Terms of Service
      </label>
      <button type="submit" disabled={!agree || (showEmployer && !isAssets && !employer.name) || submitting} class="w-full py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover disabled:opacity-40">
        {submitting ? <span class="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Continue'}
      </button>
    </form>
  );
}
