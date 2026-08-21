// Truv Orders/Bridge-Token/Document-Processing product-combination rules —
// confirmed against a live sandbox account by POSTing every combination and
// recording the actual accept/reject behavior (2026-08-07). Mirrors
// truv_integration/product_rules.py, which is the server-side backstop for
// the same rules — this module is what keeps the Configure Truv console from
// ever letting a user build one of these requests in the first place.
//
// Confirmed findings:
// - POST /v1/orders/ with `products: ["employment", "income"]` (or assets,
//   insurance, transactions, deposit_switch, pll in place of income) rejects
//   with: "Only income, assets, insurance, and education can be combined;
//   employment can be combined only with education." `education` isn't
//   offered by this app, so in practice `employment` must be requested alone.
// - The same rejection applies to `transactions`, `deposit_switch`, and
//   `pll` combined with anything else (including each other) — only
//   income/assets/insurance freely combine.
// - `deposit_switch`/`pll` via Embedded/Hosted Orders (not Bridge Token) fail
//   separately even when requested alone: "Number of employers ... should be
//   at least 1," and even with an employer name supplied: "Account object is
//   required for the deposit_switch product." Only the Bridge Token flow
//   (which this app always supplies a demo account for) can request these.
// - POST /v1/documents/collections/{id}/finalize/ only accepts `product_type`
//   of `income` or `employment` — assets/insurance/transactions all reject.

export const ALL_PRODUCTS = ['income', 'employment', 'assets', 'deposit_switch', 'pll', 'insurance', 'transactions'];

export const COMBINABLE_PRODUCTS = ['income', 'assets', 'insurance'];
export const SOLO_ONLY_PRODUCTS = ['employment', 'transactions', 'deposit_switch', 'pll'];
export const BRIDGE_TOKEN_ONLY_PRODUCTS = ['deposit_switch', 'pll'];
export const DOCUMENT_UPLOAD_PRODUCTS = ['income', 'employment'];

/** The selectable product list for a given integration method — the console
 * never shows a product it would go on to reject. */
export function productsForMethod(method) {
  if (method === 'bridge_token') return BRIDGE_TOKEN_ONLY_PRODUCTS;
  if (method === 'document_upload') return DOCUMENT_UPLOAD_PRODUCTS;
  // Embedded/Hosted Orders: everything except deposit_switch/pll, which need
  // the bank `account` object only the Bridge Token flow supplies.
  return ALL_PRODUCTS.filter((p) => !BRIDGE_TOKEN_ONLY_PRODUCTS.includes(p));
}

/** Bridge Token and Document Processing both take exactly one product. */
export function isSingleSelectMethod(method) {
  return method === 'bridge_token' || method === 'document_upload';
}

/** Called whenever the selected products list changes (a checkbox toggle or
 * an integration-method switch) — returns the next valid products array so
 * the console can never end up in a combination Truv would reject. */
export function nextProducts(currentProducts, toggled, method) {
  if (isSingleSelectMethod(method)) return [toggled];
  if (currentProducts.includes(toggled)) return currentProducts.filter((p) => p !== toggled);
  if (SOLO_ONLY_PRODUCTS.includes(toggled)) return [toggled];
  // Adding a combinable product drops any solo-only product already selected.
  return [...currentProducts.filter((p) => !SOLO_ONLY_PRODUCTS.includes(p)), toggled];
}

/** Called when the integration method itself changes — keeps whatever's
 * still valid, otherwise falls back to a sensible default for the new
 * method instead of silently carrying over a now-invalid selection. */
export function sanitizeProductsForMethod(currentProducts, method) {
  const allowed = productsForMethod(method);
  const kept = currentProducts.filter((p) => allowed.includes(p));
  if (isSingleSelectMethod(method)) {
    return kept.length ? [kept[0]] : [allowed[0]];
  }
  return kept.length ? kept : ['income'];
}
