/**
 * FILE SUMMARY: Scaffolding for Mortgage: LOS Integration demo.
 * INTEGRATION PATTERN: Orders flow (backend-initiated, no Bridge widget).
 *
 * Exports presentation-layer config consumed by LOS.jsx: step definitions,
 * sample completed applicants for the dashboard table, intro feature cards,
 * and an AddApplicantForm component. Contains no API calls or state management.
 */

// --- Imports: Preact hooks ---
import { useState } from 'preact/hooks';

// --- Config: step definitions for the sidebar Guide tab ---
export const STEPS = [
  { title: 'Loan Processor creates order', guide: '<p>Create a verification order with borrower PII. Truv sends the share link via email/SMS.</p><pre>POST /v1/orders/\n{\n  "first_name": "...",\n  "email": "...",\n  "phone": "...",\n  "products": ["income"]\n}</pre>' },
  { title: 'Borrower receives link', guide: '<p>The user receives an email/SMS with a verification link. They complete Bridge on their own device.</p><p>Monitor webhooks for status updates.</p>' },
  { title: 'Loan Processor reviews results', guide: '<p>Once the user completes verification, fetch reports:</p><pre>POST /v1/users/{user_id}/reports/</pre>' },
];

// --- Config: sample completed applicants shown in the dashboard table ---
export const COMPLETED_APPLICANTS = [
  { firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com', phone: '+14155550101', products: ['income'], status: 'completed' },
  { firstName: 'Jane', lastName: 'Smith', email: 'jane.smith@example.com', phone: '+14155550102', products: ['income'], status: 'completed' },
  { firstName: 'Bob', lastName: 'Wilson', email: 'bob.wilson@example.com', phone: '+14155550103', products: ['assets'], status: 'completed' },
];

// --- Config: feature cards shown on the intro slide ---
export const INTRO_FEATURES = [
  { name: 'Create orders from collected data', desc: 'Use PII from the application. No user interaction needed.' },
  { name: 'Truv sends verification links', desc: 'Email and SMS sent automatically to the borrower' },
  { name: 'Track status remotely', desc: 'Monitor webhook events and order status from the dashboard' },
  { name: 'Fetch reports on completion', desc: 'Pull VOIE, VOE, or VOA reports once the user completes Bridge' },
];

// --- Component: AddApplicantForm. Collects borrower PII for order creation. ---
export function AddApplicantForm({ onSubmit }) {
  // Form state: borrower name, contact info, and product selection
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [product, setProduct] = useState('income');

  // Handler: validate and submit form data to parent
  function handleSubmit(e) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;
    onSubmit({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      products: [product],
    });
  }

  return (
    <div class="intro-slide" style="justify-content: flex-start; padding-top: 3rem;">
      <div class="w-full max-w-md mx-auto px-4">
        <div class="animate-slideUp text-center mb-8">
          <h2 class="text-[28px] font-semibold tracking-[-0.02em] text-[#171717] mb-2">Add Test Borrower</h2>
          <p class="text-[15px] text-[#8E8E93] leading-[1.5]">
            Enter borrower details. Truv will send the verification link via email and/or SMS.
          </p>
        </div>

        <form onSubmit={handleSubmit} class="animate-slideUp delay-1 text-left">
          <div class="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label class="text-[13px] font-medium text-[#171717] mb-1.5 block">First name</label>
              <input value={firstName} onInput={e => setFirstName(e.target.value)} placeholder="John" class="w-full px-3.5 py-2.5 border border-[#d2d2d7] rounded-lg text-sm focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label class="text-[13px] font-medium text-[#171717] mb-1.5 block">Last name</label>
              <input value={lastName} onInput={e => setLastName(e.target.value)} placeholder="Doe" class="w-full px-3.5 py-2.5 border border-[#d2d2d7] rounded-lg text-sm focus:border-primary focus:outline-none" />
            </div>
          </div>
          <div class="mb-3">
            <label class="text-[13px] font-medium text-[#171717] mb-1.5 block">Email</label>
            <input type="email" value={email} onInput={e => setEmail(e.target.value)} placeholder="john@example.com" class="w-full px-3.5 py-2.5 border border-[#d2d2d7] rounded-lg text-sm focus:border-primary focus:outline-none" />
            <p class="text-[11px] text-[#8E8E93] mt-1">Truv sends the verification link to this email</p>
          </div>
          <div class="mb-3">
            <label class="text-[13px] font-medium text-[#171717] mb-1.5 block">Phone</label>
            <input type="tel" value={phone} onInput={e => setPhone(e.target.value)} placeholder="+14155551234" class="w-full px-3.5 py-2.5 border border-[#d2d2d7] rounded-lg text-sm focus:border-primary focus:outline-none" />
            <p class="text-[11px] text-[#8E8E93] mt-1">Truv sends the verification link via SMS</p>
          </div>
          <div class="mb-5">
            <label class="text-[13px] font-medium text-[#171717] mb-1.5 block">Product</label>
            <select value={product} onChange={e => setProduct(e.target.value)} class="w-full px-3.5 py-2.5 border border-[#d2d2d7] rounded-lg text-sm bg-white focus:border-primary focus:outline-none">
              <option value="income">Income verification</option>
              <option value="employment">Employment verification</option>
              <option value="assets">Assets verification</option>
            </select>
          </div>
          <button type="submit" disabled={!firstName.trim() || !lastName.trim()} class="w-full py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover disabled:opacity-40">
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
