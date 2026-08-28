# Truv Developer Playground

A local, working simulation of a mortgage **POS** (borrower-facing loan application) and **LOS**
(back-office loan origination system), both integrated with the real Truv API. Built to:

- Demo how much of a 1003 (URLA) loan application Truv's direct-source data can auto-fill vs. what
  a borrower must type by hand — including sections (property, loan terms, declarations,
  demographics) that are genuinely 0%-fillable.
- Toggle between Truv's integration methods (Embedded Orders, Hosted Orders, Bridge Token) and
  the full Orders API parameter surface live.
- Simulate a realistic POS → LOS handoff, including LOS-initiated refreshes that propagate back to POS.
- Manage the document lifecycle: Truv verification reports, invoices, OCR'd paystub/W-2 uploads,
  and locally-fabricated GSE (D1C/AIM) report artifacts.
- Switch between sandbox and production Truv credentials at runtime, per app, via a Settings screen.

## Architecture

Two independent Django + DRF + React projects — `pos/` and `los/` — each simulating a
separately-owned real-world vendor system with its own SQLite database. Shared logic lives in
`libs/truv_integration` (the Truv API client + credential/webhook handling) and `libs/urla` (the
1003 data model + Truv-fillability catalog + POS↔LOS sync payload shape), both installed editable
into both projects. `libs/design-system` is a shared React component package built on Truv's brand
tokens, consumed by both frontends via npm workspaces.

```
pos/   :8000 backend, :5183 frontend  — borrower-facing application wizard + Truv verification
los/   :8001 backend, :5184 frontend  — loan file, underwriting support, documents, activity log
```

Only LOS gets an ngrok tunnel (it's the longer-lived system of record); it relays webhooks to POS
over a local HTTP call so a single tunnel serves both apps.

## Setup

1. **Python deps** (from repo root):
   ```
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
2. **JS deps** (from repo root — installs both frontends + the design system via npm workspaces):
   ```
   npm install
   ```
3. **Environment**: copy `.env.example` to `.env` and fill in `TRUV_CREDENTIAL_ENCRYPTION_KEY`:
   ```
   cp .env.example .env
   cd pos && python manage.py generate_truv_key   # paste the printed key into .env
   ```
   The other `.env` defaults (ports, internal sync key) work as-is for local use.
4. **Databases** (each project migrates independently):
   ```
   cd pos && python manage.py migrate && python manage.py createsuperuser
   cd ../los && python manage.py migrate && python manage.py createsuperuser
   ```

## Running

```
./scripts/dev.sh            # boots both backends, both frontends, ngrok, and webhook registration
./scripts/dev.sh --no-ngrok # skip ngrok — Embedded Orders and manual refresh/apply still work fully
```

Then open **http://localhost:5183** (POS) and **http://localhost:5184** (LOS).

Each app's left rail carries a **"← Back to Demo Apps"** link, for returning to the parent
`demo-apps` app this playground was folded into. When reached via one of the Mortgage demos' "Dev
Playground" panel button, it returns to that exact demo; opened directly, it falls back to the
demo-apps home page. Defaults to `http://localhost:5173`; override per-frontend with
`VITE_DEMO_APPS_URL` in `pos/frontend/.env` / `los/frontend/.env` if demo-apps runs elsewhere.

**Adding Truv credentials**: open Settings in *both* apps and add the same sandbox and/or
production `client_id`/`secret`/`base_url` to each (POS and LOS each call Truv independently, so
each needs its own credential-set row). Use "Activate" to switch which one is live — no restart
required. Sandbox test login inside Bridge: employer "Home Depot", username `goodlogin`, password
`goodpassword`.

## Walkthrough

1. **POS** → New Application → fill the wizard (Borrower through Demographics) manually, or —
2. On the Employment & Income or Assets step, click **Verify with Truv** → pick an integration
   method → configure products/data sources in the request console → run it. Embedded Orders opens
   Bridge inline; Hosted Orders emails/texts a link.
3. **Review & Coverage** shows the auto-fill percentage, honestly 0% for sections Truv has no
   product for. **Submit to LOS** pushes the full application over.
4. **LOS** → the loan file appears in the list. **Refresh from Truv** re-pulls the order and pushes
   the update back to POS automatically. The **Documents**, **Underwriting Support Data**, and
   **Activity Log** tabs fill in as verifications/refreshes/uploads happen.

## Known limitations (disclosed, not hidden)

- **Refresh is synchronous in this build**: Truv's order refresh is asynchronous; LOS calls
  `refresh_order` then immediately `get_order`, which may still return the pre-refresh snapshot.
  The webhook receiver narrows this gap but doesn't fully close it.
- **`urla/catalog.py`'s `truv_source_path` values** are best-effort based on documented field
  names, not yet validated against a live sandbox order response — a wrong path just leaves that
  field unfilled (fails soft) rather than crashing.
- **GSE report artifacts** ("Generate GSE Report" in LOS Documents) are locally fabricated demo
  data, clearly labeled — Truv has no endpoint that returns a GSE acceptance summary.
- **"EPC"**, as referenced in early requirements for this project, does not appear anywhere in
  Truv's documentation. This build treats AIM Check (Truv's real document-based income product) as
  the underlying capability the requirement was referring to.
- **Webhook field names** in `register_truv_webhook` (`url`, `events`) are assumed, not confirmed
  against a live API response — adjust in that one file if registration errors on a field name.
