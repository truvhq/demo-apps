/**
 * FILE SUMMARY: "this part is yours, not the applicant's" callout.
 *
 * The demos deliberately mix two audiences on one screen: what the applicant sees,
 * and the integrator-side logic that decides what happens next. This is the marker
 * for the second kind, so nobody watching mistakes a backend decision screen for
 * something a real borrower or claimant would ever be shown.
 *
 * Extracted from IncomePLLChained.jsx, where it was a private prop-less component
 * with its coverage-check copy hardcoded. Default children preserve that original
 * wording so the Income+PLL screens read exactly as before.
 */

export default function InternalCallout({ label = 'Internal-only step.', children }) {
  return (
    <div class="bg-[#f5f5f7] border border-[#e8e8ed] rounded-2xl p-4 mb-6 flex gap-3 items-start">
      <svg class="w-4 h-4 text-[#808080] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      <div class="text-[13px] text-gray-600 leading-relaxed">
        <span class="font-semibold text-gray-700">{label}</span>{' '}
        {children || "The borrower wouldn't see this in production. It represents the backend coverage pre-check that decides whether to create a Truv order or route to a manual path."}
      </div>
    </div>
  );
}
