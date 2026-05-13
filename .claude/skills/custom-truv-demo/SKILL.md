---
name: custom-truv-demo
description: Build a partner-branded Truv API demo using this repo as the foundation. Use when the user asks to "build a custom demo", "spin up a demo for <use case>", "make a branded demo for <integrator>", "fork this for <company>", provides a Figma/brand assets and wants the Truv embed wired into it, or has a Truv sandbox client_id + secret and wants a runnable end-to-end demo. Walks through picking the right reference pattern in this repo, scaffolding the new demo, wiring Bridge, and smoke-testing.
---

# Custom Truv Demo

This skill turns this `demo-apps` repo into a branded, integrator-specific demo of the Truv API. The repo already implements every major Truv integration pattern; the work is picking the right one and reskinning it.

## When to use this skill

Trigger when the user:

- Says "build a custom demo", "spin up a demo for <use case>", "branded demo for <integrator>"
- Provides a Figma URL, brand assets, or screenshots of a target portal and wants Truv embedded inside it
- Has a Truv sandbox client_id + secret and wants a runnable demo for a specific integration scenario
- Asks to fork or strip this repo down to a single industry or flow

Don't trigger for: questions about a specific Truv endpoint (use the [Truv docs MCP](https://docs.truv.com/mcp) or [docs.truv.com](https://docs.truv.com)), edits to an existing demo in this repo (just modify it inline), or pure code reviews.

## What this skill does not do

- **Create the Bridge template in the Truv dashboard.** The user must do this themselves.
- **Produce production-fidelity branding.** Screenshots and Figma references inform a "looks like," not "is." For a customer-facing handoff, expect a hand-tuning pass after.
- **Touch production credentials or real applicant data.** Sandbox only.
- **Modify shared infrastructure** (`server/`, shared screens, hooks) unless the user explicitly asks.

## Checkpoint — collect from the user before wiring

Stop and confirm the three things only the user can provide. Do not invent or guess these.

1. **Template ID** — from the Truv dashboard (Bridge Templates section).
2. **Sandbox credentials** — `API_CLIENT_ID` and `API_SECRET` from [Dashboard → Development → API Keys](https://dashboard.truv.com/app/development/keys). These belong in `.env`.
3. **Brand assets** — Figma URL, screenshots, or both. Without these the demo ends up generic.

If the user has not provided all three, ask before proceeding. Do not fall back to placeholders.

## Step 1 — Pick the starting pattern

Every demo in this repo uses one of two integration patterns. Pick whichever matches the use case:

### Orders API (PII collected upfront)

The demo collects applicant name/DOB/SSN on a form, posts it to `/v1/orders/` server-side, and Truv returns a `bridge_token` that mounts inline. Reports are fetched by user_id once the `order-status-updated` webhook arrives.

Reference demos in this repo:
- **`src/demos/Application.jsx`** — Mortgage POS application; cleanest reference for the Orders flow.
- **`src/demos/CustomerPortal.jsx`** — Public-sector benefits portal; same pattern with a government-portal chrome.
- **`src/demos/LOS.jsx`** / **`src/demos/EmployeePortal.jsx`** — Agent-side variants where a loan officer or case worker creates the order on behalf of an applicant.

Key files: `server/routes/orders.js`, `server/routes/user-reports.js`, `src/components/screens/BridgeScreen.jsx`.

### Bridge / User+Token (direct-to-Bridge)

The demo creates a user, generates a bridge token with explicit `product_type` + `data_sources`, and the applicant lands in Bridge without a separate form.

Reference demos:
- **`src/demos/SmartRouting.jsx`** — Consumer Credit; best fit for "show all available verification methods and let the user pick."
- **`src/demos/PayrollIncome.jsx`** / **`src/demos/BankIncome.jsx`** — Single-data-source variants.
- **`src/demos/DepositSwitch.jsx`** — Retail banking direct-deposit-switch flow.

Key files: `server/routes/bridge.js`, `server/routes/user-reports.js`, `src/demos/SmartRouting.jsx`.

**Heuristic:** form-first flow (mortgage application, benefits enrollment) → Orders. Direct-to-Bridge (sign-up widget, in-app verification) → Bridge/User+Token.

## Step 2 — Decide on layout

### Path A — Add a new demo to this repo's registry

- Keeps the new demo discoverable on the existing Home page alongside the built-in ones.
- Right choice when you want the demo browsable as one option among several.
- How:
  1. Clone the closest reference demo from Step 1 into a new file under `src/demos/<YourDemo>.jsx`.
  2. Register it in the `INDUSTRIES` config in `src/App.jsx`.
  3. Re-use the shared chrome (`src/components/Header.jsx`, `src/components/Layout.jsx`, `src/components/Panel.jsx`).
  4. Tweak the demo file for the new flow, copy, branding.

### Path B — Fork into a standalone branded app

- Strips the multi-demo selector out so the deliverable is a single, fully reskinned application.
- Right choice when the partner needs a standalone runnable artifact that looks like their product end-to-end.
- How:
  1. Simplify `src/App.jsx` to render one route.
  2. Replace `src/components/Header.jsx` / `src/components/Layout.jsx` with partner-branded chrome.
  3. Keep `server/` verbatim — it's pattern-agnostic.
  4. Update `index.html` (title, fonts, favicon) and the Tailwind theme tokens.

Quick test: if the partner provided a full-page Figma of their portal, Path B. If they want to see Truv inside their flow alongside other reference demos, Path A.

## Step 3 — Reskin the chrome

For Path B (or the per-demo chrome on Path A), replace per partner; everything else stays:

| File | What changes |
|---|---|
| `index.html` | Title, Google Fonts link, favicon |
| `src/styles.css` / Tailwind theme | Color tokens, typeface variables |
| `src/components/Header.jsx` | Partner logo + brand mark |
| `src/components/Layout.jsx` | Top bar, breadcrumb (if their portal has one), footer |
| New step components under `src/demos/` | Step labels, copy, form fields |

If a Figma is provided:
- Use the figma MCP (`mcp__figma__get_design_context`) with the node id from the URL — it's the canonical way to pull both the rendered screenshot and a React+Tailwind reference snippet.
- Extract: top-bar tagline, header logo, breadcrumb step labels + active-indicator style, footer contents, color tokens, typeface choices.
- The Figma's reference output is just that — a reference. Adapt to this repo's existing component structure; don't introduce new component libraries.

## Step 4 — Wire the Truv embed (inline)

Use the inline pattern from `src/components/screens/BridgeScreen.jsx`. The key options:

```js
window.TruvBridge.init({
  bridgeToken,
  isOrder: true,                                        // Orders flow only
  position: { type: 'inline', container: containerRef.current },
  onLoad,
  onEvent: (type, payload, source) => {
    if (type === 'COMPLETED' && source === 'order') {
      // Order flow done — start polling /api/orders/:id
    }
  },
  onSuccess,
  onClose,
});
```

Notes:
- **One init per bridge_token.** Capture callbacks via refs so re-renders don't tear down and re-init the iframe.
- **Combined income + assets:** pass `products: ['income', 'assets']` when creating the order to capture both in one Bridge session.
- **Follow-up orders for the same applicant:** reuse the same `external_user_id` so every order hangs off one Truv `user_id`.
- **Polling the order:** stop when each sub-order's status is anything other than `new`, `sent`, or `pending` — typically `completed` or `error`. Note that an `error` status often still ships valid `employments` / `financial_accounts` data alongside.

## Step 5 — Smoke test

```sh
npm install
cp .env.example .env
# Fill API_CLIENT_ID + API_SECRET from your Truv sandbox dashboard.
npm start        # backend on :3000
npm run dev      # frontend on :5173
```

Inside Bridge: search any employer (e.g. *Home Depot*, *Walmart*) and use the sandbox credentials `goodlogin` / `goodpassword`.

Verify the activity panel on the right shows:
- The `POST /v1/orders/` call under **API** returning a `bridge_token` + `user_id`
- `onLoad`, `onEvent(COMPLETED, "order")`, `onSuccess`, `onClose` under **Bridge**
- An inbound `order-status-updated` event under **Webhooks** (only when `NGROK_URL` is set in `.env`)

If the embed never appears: confirm `https://cdn.truv.com/bridge.js` loaded in the Network panel and that the inline container has non-zero height.

## Before reporting done

- [ ] `npm install` + `npm start` + `npm run dev` all run cleanly
- [ ] The new demo is reachable (registry entry or standalone route)
- [ ] Bridge mounts inline and the activity panel shows `POST /v1/orders/` + `bridge_token` returned
- [ ] `onLoad`, `onEvent(COMPLETED, "order")`, `onSuccess`, `onClose` all fire under the Bridge panel
- [ ] Branding reflects the screenshots or Figma provided
- [ ] No `.env` contents, real customer logos, or PII in any committed file

## Output

Tell the user, in one short paragraph:

- The reference demo used as the starting point (`src/demos/X.jsx`)
- Where the new demo lives (registry entry + new file path, or standalone-app structure)
- What's wired against the live Truv sandbox vs. mocked locally
- The two commands to run (`npm start` + `npm run dev`) and the deep link or click path to the embed step

## Reference material

- [docs.truv.com](https://docs.truv.com) — Full API and concept docs
- [Truv docs MCP](https://docs.truv.com/mcp) — Already wired in this repo's `.mcp.json`; reload your editor after cloning to pick it up
- [llms.txt](https://truv.com/docs/llms.txt) — Plain-text docs index for AI assistants without MCP support
- Topic-specific: [Bridge overview](https://docs.truv.com/docs/truv-bridge) · [Webhooks](https://docs.truv.com/docs/webhooks) · [User Reports](https://docs.truv.com/reference/users_reports) · [Company Search](https://docs.truv.com/reference/company_autocomplete_search) · [Providers](https://docs.truv.com/reference/list_providers)
