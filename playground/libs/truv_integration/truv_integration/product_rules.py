"""Truv Orders/Bridge-Token/Document-Processing product-combination rules —
confirmed against a live sandbox account (not just documentation) by POSTing
every combination and recording the actual accept/reject behavior. Used by
both POS's and LOS's create_verification_request views so a caller gets an
immediate, clear 400 instead of Truv's raw error (or worse, a silent
mismatch the UI never explains). The frontend mirrors this same ruleset in
screens/verification/productRules.js so the console never lets a user build
one of these requests in the first place — this module is the server-side
backstop for anyone hitting the API directly.

Confirmed findings (2026-08-07, live sandbox):
- POST /v1/orders/ with `products: ["employment", "income"]` (or assets,
  insurance, transactions, deposit_switch, pll in place of income) rejects
  with: "Only income, assets, insurance, and education can be combined;
  employment can be combined only with education." `education` isn't offered
  by this app, so in practice `employment` must be requested alone.
- The same rejection applies to `transactions`, `deposit_switch`, and `pll`
  combined with anything else (including each other) — e.g.
  `["income", "transactions"]` and `["deposit_switch", "pll"]` both hit the
  identical error. Only income/assets/insurance freely combine.
- `deposit_switch`/`pll` via Embedded/Hosted Orders (not Bridge Token) fail
  separately even when requested alone: "Number of employers for
  deposit_switch product should be at least 1," and even with an employer
  name supplied: "Account object is required for the deposit_switch
  product." Orders' `employers[]` shape has no path to supply that bank
  account object from this app; only the Bridge Token flow (which this app
  always supplies a demo account for) can request these two products.
- `POST /v1/documents/collections/{id}/finalize/` only accepts
  `product_type` of `income` or `employment` — `assets`, `insurance`, and
  `transactions` all reject with '"<value>" is not a valid choice.'
"""

# Freely combinable in any subset via Embedded/Hosted Orders.
COMBINABLE_PRODUCTS = {"income", "assets", "insurance"}

# Must be requested alone — combining with ANY other product (including each
# other) is rejected by Truv's Orders API.
SOLO_ONLY_PRODUCTS = {"employment", "transactions", "deposit_switch", "pll"}

# Only obtainable via the Bridge Token (User Token) flow — Embedded/Hosted
# Orders can't supply the required bank `account` object for these.
BRIDGE_TOKEN_ONLY_PRODUCTS = {"deposit_switch", "pll"}

# The only two product types Document Processing's finalize endpoint accepts.
DOCUMENT_UPLOAD_PRODUCTS = {"income", "employment"}


def validate_products(integration_method: str, products: list[str]) -> str | None:
    """Returns None if the combination is valid, or a user-facing error
    message describing exactly which rule it violates."""
    products = list(products or [])
    if not products:
        return "Select at least one product."

    solo_selected = [p for p in products if p in SOLO_ONLY_PRODUCTS]
    if solo_selected and len(products) > 1:
        others = [p for p in products if p != solo_selected[0]]
        return (
            f"'{solo_selected[0]}' can't be combined with {', '.join(others)} — Truv only allows "
            f"combining {', '.join(sorted(COMBINABLE_PRODUCTS))} together; every other product must "
            "be requested on its own."
        )

    if integration_method != "bridge_token":
        bad = [p for p in products if p in BRIDGE_TOKEN_ONLY_PRODUCTS]
        if bad:
            return f"'{bad[0]}' requires the Bridge Token integration method — Embedded/Hosted Orders can't request it."

    if integration_method == "document_upload":
        bad = [p for p in products if p not in DOCUMENT_UPLOAD_PRODUCTS]
        if bad:
            return f"Document Processing only supports {' or '.join(sorted(DOCUMENT_UPLOAD_PRODUCTS))}."
        if len(products) > 1:
            return "Document Processing verifies one product at a time — choose either income or employment."

    if integration_method == "bridge_token" and len(products) > 1:
        return "Bridge Token issues a single-product token — choose one product."

    return None
