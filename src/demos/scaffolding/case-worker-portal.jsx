/**
 * FILE SUMMARY: Scaffolding for Public Sector: Case Worker Portal demo.
 * INTEGRATION PATTERN: Orders flow (backend-initiated, no Bridge widget).
 *
 * Exports presentation-layer config consumed by CaseWorkerPortal.jsx: step
 * definitions, sample completed applicants, product mappings, intro feature
 * cards, and an AddApplicantForm component. Same structure as los.jsx scaffolding
 * but with government-specific labels.
 */

// --- Imports: Preact hooks ---
import { useState } from 'preact/hooks';

// --- Config: step definitions for the sidebar Guide tab ---
export const STEPS = [
  { title: 'Case worker creates the order', guide: '<p>The products picked in New verification decide the template. The case number goes in as <code>order_number</code>. With an email or phone, Truv sends the link.</p><pre>POST /v1/orders/\n{\n  "order_number": "40221234",\n  "first_name": "...",\n  "last_name": "...",\n  "email": "...",\n  "phone": "...",\n  "products": ["income", "assets"],\n  "template_id": "..."\n}</pre><p>The response has <code>share_url</code>: the same link, for the case worker to copy.</p>' },
  { title: 'Applicant completes the link', guide: '<p>The applicant opens the link on their own device and connects payroll, bank, or both.</p><p>Status arrives by the <code>order-status-updated</code> webhook. Refresh status reads it directly:</p><pre>GET /v1/orders/{order_id}/</pre><p><code>employers[].status</code> is the wage earner part, <code>financial_accounts[].status</code> the self-employment part.</p>' },
  { title: 'Case worker reviews the report', guide: '<p>Once a product is done, create and fetch its report:</p><pre>POST /v1/users/{user_id}/reports/\nPOST /v1/users/{user_id}/assets/reports/</pre>' },
];

// --- Config: sample completed applicants shown in the dashboard table ---
export const COMPLETED_APPLICANTS = [
  { firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com', phone: '+14155550101', products: ['income'], status: 'completed' },
  { firstName: 'Jane', lastName: 'Smith', email: 'jane.smith@example.com', phone: '+14155550102', products: ['income'], status: 'completed' },
  { firstName: 'Bob', lastName: 'Wilson', email: 'bob.wilson@example.com', phone: '+14155550103', products: ['assets'], status: 'completed' },
];

// --- Config: product select mapping. Maps form option IDs to Truv product arrays. ---
export const VP_PRODUCTS = {
  income: ['income'],
  income_assets: ['income', 'assets'],
  assets: ['assets'],
};

// --- Config: feature cards shown on the intro slide ---
export const INTRO_FEATURES = [
  { name: 'Send from the dashboard', desc: 'Pick wage earner, self-employment, or both. The template follows.' },
  { name: 'Truv delivers the link', desc: 'By email and SMS, or copy it from the case' },
  { name: 'Track each case', desc: 'Per-product status, refreshed from the order' },
  { name: 'Open the report', desc: 'Income, assets, and income insights once done' },
];

// --- Helper: form validation for AddApplicantForm ---
// Truv only genuinely requires first/last name to create an order. Email and phone are
// each optional on the backend (server/routes/orders.js): when provided, Truv sends the
// verification link via email or SMS; when omitted, the case worker shares the share_url
// shown in the dashboard manually. So missing contact info must NOT block submit — only
// the names gate the button (mirrors the Customer Portal's ApplicationForm, which doesn't
// validate email/phone either). Exported for direct unit testing.
export function canSubmitApplicant({ firstName, lastName }) {
  return Boolean(firstName.trim() && lastName.trim());
}

// --- Component: AddApplicantForm. Collects applicant PII for order creation. ---
export function AddApplicantForm({ onSubmit }) {
  // Form state: applicant name, contact info, and product selection
  const [firstName, setFirstName] = useState('John');
  const [lastName, setLastName] = useState('Doe');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [product, setProduct] = useState('income');

  // Handler: validate and submit form data to parent.
  // Requires first/last name only; email and phone are optional.
  function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmitApplicant({ firstName, lastName })) return;
    onSubmit({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      products: VP_PRODUCTS[product] || [product],
    });
  }

  return (
    <div class="intro-slide" style="justify-content: flex-start; padding-top: 3rem;">
      <div class="w-full max-w-lg mx-auto px-4 sm:px-8">
        <div class="animate-slideUp text-left mb-8">
          <h2 class="text-[28px] font-semibold tracking-[-0.02em] text-[#000000] mb-2">Add Test Applicant</h2>
          <p class="text-[15px] text-[#808080] leading-[1.5]">
            Enter applicant details. Truv will send the verification link via email and/or SMS.
          </p>
        </div>

        <form onSubmit={handleSubmit} class="animate-slideUp delay-1 text-left">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label class="text-[13px] font-medium text-[#000000] mb-1.5 block">First name</label>
              <input value={firstName} onInput={e => setFirstName(e.target.value)} class="w-full px-3.5 py-2.5 border border-[#d2d2d7] rounded-lg text-sm focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label class="text-[13px] font-medium text-[#000000] mb-1.5 block">Last name</label>
              <input value={lastName} onInput={e => setLastName(e.target.value)} class="w-full px-3.5 py-2.5 border border-[#d2d2d7] rounded-lg text-sm focus:border-primary focus:outline-none" />
            </div>
          </div>
          {/* Contact methods: email and phone are both optional. When provided, Truv
              delivers the verification link by email or SMS; otherwise the case worker
              shares the share_url shown in the dashboard. Neither gates the submit button. */}
          <div class="mb-3">
            <label class="text-[13px] font-medium text-[#000000] mb-1.5 block">Email</label>
            <input type="email" value={email} onInput={e => setEmail(e.target.value)} placeholder="john@example.com" class="w-full px-3.5 py-2.5 border border-[#d2d2d7] rounded-lg text-sm focus:border-primary focus:outline-none" />
          </div>
          <div class="mb-1">
            <label class="text-[13px] font-medium text-[#000000] mb-1.5 block">Phone</label>
            <input type="tel" value={phone} onInput={e => setPhone(e.target.value)} placeholder="+14155551234" class="w-full px-3.5 py-2.5 border border-[#d2d2d7] rounded-lg text-sm focus:border-primary focus:outline-none" />
          </div>
          <p class="text-[13px] text-[#808080] mb-3">Optional — when provided, Truv sends the verification link by email or SMS.</p>
          <div class="mb-5">
            <label class="text-[13px] font-medium text-[#000000] mb-1.5 block">Product</label>
            <select value={product} onChange={e => setProduct(e.target.value)} class="appearance-none w-full pl-3.5 pr-10 py-2.5 border border-[#d2d2d7] rounded-lg text-sm bg-white bg-no-repeat cursor-pointer focus:border-primary focus:outline-none" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23808080' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundSize: '12px' }}>
              <option value="income">Income and employment verification</option>
              <option value="income_assets">Income + Expenses</option>
              <option value="assets">Self-employment income</option>
            </select>
          </div>
          <button type="submit" disabled={!canSubmitApplicant({ firstName, lastName })} class="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-hover active:bg-primary-active transition-colors disabled:opacity-40">
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
