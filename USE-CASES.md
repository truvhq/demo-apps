# Truv Use Cases: Developer Guide to Handling Common Issues

This guide covers the main integration use cases for Truv and how to handle the edge cases, errors, and potential issues developers are most likely to encounter.

---

## Table of Contents

- [Customer Portal](#customer-portal)
- [Caseworker Portal](#caseworker-portal)
- [Contact Center](#contact-center)
- [In-Person Verification](#in-person-verification)
- [Renewal & Re-verification](#renewal--re-verification)
- [Cross-Cutting Concerns](#cross-cutting-concerns)

---

## Customer Portal

The customer portal is the primary self-service path where applicants verify income and employment through the embedded Truv Bridge widget.

### Happy Path: New Applicant Completes Verification

1. Create an order via `POST /orders/`
2. Initialize Bridge with the returned `bridge_token`
3. Applicant searches for employer, authenticates, and connects
4. Listen for `task-status-updated` webhook with `status: done`
5. Retrieve data via `GET /orders/{order_id}/report`

### Issue: Applicant Abandons Verification

**What happens:** The applicant opens Bridge but closes it before completing authentication.

**How to detect:**
- Bridge fires an `onClose` callback without a preceding `onSuccess`
- The order remains in a non-terminal status (no `done` webhook)

**How to handle:**
- Persist the order ID so the session can be resumed later
- Use Truv's notification system to send email/SMS reminders — configure `notifications.applicant.day_0_enabled` and follow-up intervals on the order template
- If using a custom notification flow, store the `start_client_url` from the order response and send it through your own channels
- Monitor completion via the `order-status-updated` webhook

```javascript
TruvBridge.init({
  bridgeToken,
  onClose() {
    // No onSuccess fired — user abandoned
    scheduleReminder(orderId);
  },
  onSuccess(publicToken, metadata) {
    markVerificationComplete(orderId);
  },
});
```

### Issue: Partial Employer Connection

**What happens:** An applicant with multiple income sources (e.g., W-2 employment + self-employment) connects one employer but skips the others.

**How to detect:**
- The order report returns data for fewer employers than expected
- Some `link` records show a terminal error status while others show `done`

**How to handle:**
- Review the order report and compare connected employers against what was expected
- Prompt the applicant to reconnect for remaining sources
- For self-employment income that can't be verified via payroll, fall back to document upload or accept a self-certification with supporting documentation
- Consider configuring a waterfall: `data_sources: ["payroll", "docs"]` so the applicant can upload pay stubs as a fallback

### Issue: Household Member Hasn't Verified

**What happens:** In multi-applicant scenarios (e.g., government benefits), the primary applicant completes verification but a household member does not.

**How to detect:**
- Track order status per applicant; the household member's order stays non-terminal
- No `task-status-updated: done` webhook for that order

**How to handle:**
- Send targeted reminders to the household member using the order's notification settings or `start_client_url`
- Allow the caseworker to view partial case data and trigger re-sends from the dashboard
- Set a deadline and escalate to manual review if not completed

### Issue: State-Managed Communications (No Truv Emails/SMS)

**What happens:** Some organizations (especially government agencies) prohibit Truv from sending communications directly to applicants.

**How to handle:**
- Disable Truv notifications on the order template
- Use the `start_client_url` from the order response to build your own notification flow
- Send the URL via your organization's approved communication channels
- Monitor completion via webhooks as usual

---

## Caseworker Portal

Caseworkers review verification results, manage cases, and handle exceptions when applicants don't complete the process.

### Happy Path: Reviewing Completed Verifications

1. Query orders by status to populate the case queue
2. Open the order report to review income/employment data
3. If additional verification is needed, create a new order for the applicant
4. Make a determination based on the verified data

### Issue: Triggering Verification for an Unresponsive Applicant

**What happens:** An applicant was sent a verification link but never completed it.

**How to handle:**
- Create a new order from the caseworker dashboard targeting the applicant
- Send the verification link via `start_client_url` through the organization's communication system
- Track progress via the `task-status-updated` webhook
- If the applicant still doesn't respond, escalate to document-based verification or manual review

### Issue: Stale or Expired Links

**What happens:** A bridge token or verification link has expired (tokens are valid for ~6 hours).

**How to detect:**
- API returns `410 Gone` when the token is used
- Bridge fires an `ERROR` event

**How to handle:**
- Always create a fresh bridge token for each new session
- Do not cache or reuse bridge tokens across sessions
- If an applicant reports a broken link, generate a new order or refresh the existing one

---

## Contact Center

Contact center agents send verification links to callers and monitor completion in real time.

### Happy Path: Caller Completes After Receiving Link

1. Agent collects caller info and creates an order
2. Share URL is sent to the caller via email/SMS
3. Caller opens the link and completes verification on their device
4. Agent monitors progress via webhook-driven status updates
5. Once `done`, agent retrieves the report

### Issue: Caller Doesn't Complete Verification

**What happens:** The caller receives the link but never finishes — they may be distracted, confused, or have technical difficulties.

**How to handle:**
- Set up real-time monitoring using the `task-status-updated` webhook via SSE/WebSocket so the agent sees progress live
- If no activity after a few minutes, the agent can verbally guide the caller through the process
- Schedule an automated follow-up reminder
- Log the incomplete attempt for future reference

### Issue: Caller Has No Supported Payroll Provider

**What happens:** The caller's employer doesn't use a supported payroll provider.

**How to detect:**
- Bridge fires an `ERROR` event with code `NO_DATA` or the employer search returns no results

**How to handle:**
- Configure the order with a waterfall: `data_sources: ["payroll", "financial_accounts", "docs"]`
- If payroll isn't available, the caller is automatically routed to bank account verification or document upload
- The contact center agent can also initiate a manual/document-based order

---

## In-Person Verification

For in-person scenarios (e.g., government office visits), verification is initiated face-to-face using QR codes or direct links.

### Happy Path: QR Code Scan and Complete

1. Caseworker creates an order during the interview
2. QR code is generated from the `start_client_url`
3. Applicant scans the code with their phone
4. Verification completes on the applicant's device
5. Caseworker sees real-time status updates and reviews the report

### Issue: Applicant Can't Scan QR Code

**What happens:** The applicant's phone doesn't have a camera, can't read QR codes, or they didn't bring their phone.

**How to handle:**
- Fall back to sending the verification link via email or SMS using the `start_client_url`
- If no phone/email is available, consider a kiosk-mode setup where the applicant uses an office device
- As a last resort, switch to document-based verification (upload physical documents)

### Issue: Poor Connectivity During In-Person Session

**What happens:** The applicant's phone has weak cellular/Wi-Fi signal, causing Bridge to load slowly or fail.

**How to detect:**
- Bridge fires `UNSUPPORTED_BROWSER` or times out during load
- The `onLoad` callback never fires

**How to handle:**
- Provide office Wi-Fi access for the applicant's device
- If connectivity can't be resolved, send the link for the applicant to complete later
- Monitor via webhooks and schedule a follow-up if needed

---

## Renewal & Re-verification

Renewals re-verify previously verified applicants, typically on an annual or periodic basis.

### Happy Path: Silent Refresh

1. Backend triggers a refresh on the existing link: `POST /links/{link_id}/refresh`
2. Truv re-pulls data from the connected payroll provider without user interaction
3. `task-status-updated: done` fires with fresh data
4. Compare new data against previous records

### Issue: Refresh Fails — Re-Authentication Required

**What happens:** The payroll provider rejects the stored credentials (password changed, session expired, etc.).

**How to detect:**
- `task-status-updated` webhook fires with `status: login_error` or `status: account_locked`
- `order-refresh-failed` webhook fires

**How to handle:**
- Notify the applicant that re-verification is needed
- Create a new order with a fresh Bridge session so the applicant can re-authenticate
- Pre-fill known information (employer, etc.) to reduce friction
- After successful re-auth, compare the refreshed data against the prior verification

```javascript
// Attempt silent refresh first
const refreshResult = await truvClient.refreshLink(linkId);

// If refresh fails, fall back to new verification
if (refreshResult.status === "login_error") {
  const newOrder = await truvClient.createOrder({
    // pre-fill with known applicant data
  });
  sendReAuthNotification(applicant, newOrder.start_client_url);
}
```

### Issue: Employer Changed Since Last Verification

**What happens:** The applicant switched jobs — the previously connected employer is no longer relevant.

**How to detect:**
- Refresh returns data showing no recent pay periods
- `NO_DATA` status from the existing link

**How to handle:**
- Create a new order so the applicant can connect their current employer
- Retain the previous verification data for historical comparison
- Flag the case for manual review if the employment change affects eligibility

---

## Cross-Cutting Concerns

These issues apply across all use cases.

### Bridge Widget Errors

| Error Code | Meaning | Recommended Action |
|---|---|---|
| `LOGIN_ERROR` | Wrong username/password | Show a clear message; let the user retry |
| `MFA_ERROR` | Wrong MFA code | Allow retry; after 3 failures suggest an alternative method |
| `ACCOUNT_LOCKED` | Provider locked the account | Instruct user to unlock via their payroll provider, then retry |
| `NO_DATA` | Account exists but has no relevant data | Fall back to document upload or alternative data source |
| `UNAVAILABLE` | Provider is temporarily down | Retry later; offer document upload as an alternative |
| `LINK_EXISTS` | Account already connected | Skip re-connection; use the existing link |

### Webhook Reliability

**Signature verification:**
Always validate the `X-WEBHOOK-SIGN` header using HMAC-SHA256 with your Access Secret against the **raw request body** (not parsed JSON).

```javascript
import crypto from "crypto";

function verifyWebhookSignature(rawBody, signature, secret) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

**Idempotency:**
Webhooks may be delivered more than once. Use the `webhook_id` field to deduplicate:

```javascript
app.post("/webhooks", async (req, res) => {
  const { webhook_id } = req.body;
  if (await alreadyProcessed(webhook_id)) {
    return res.sendStatus(200); // Acknowledge but skip processing
  }
  await markProcessed(webhook_id);
  // Process the event...
  res.sendStatus(200);
});
```

**Ordering:**
Webhooks may arrive out of order. Use the `updated_at` timestamp to determine the true sequence of events. Discard events older than your last-processed timestamp for that resource.

**Timeouts and retries:**
- Respond within **10 seconds** with a 200 status code
- Truv retries up to **3 times** at 30-second intervals on 4xx/5xx responses
- Process webhook payloads asynchronously — acknowledge immediately, process in a background job

### Rate Limits

The API enforces **300 requests per minute** per Access Secret. On `429 Too Many Requests`:

- Read the `Retry-After` header
- Implement exponential backoff (1s, 2s, 4s)
- Queue non-urgent requests to smooth traffic

### Token Management

- **Bridge tokens** expire after ~6 hours — always generate a fresh one per session
- **Access tokens** for data retrieval can be refreshed up to 3 times in 24 hours
- Never expose your **Access Secret** to the frontend; it belongs server-side only
- The **bridge token** is the only credential safe to pass to the client

### Data Source Waterfall

Configure `data_sources` on the order to control fallback behavior:

| Configuration | Behavior |
|---|---|
| `["payroll"]` | Payroll only — fails if provider unsupported |
| `["payroll", "docs"]` | Try payroll first, fall back to document upload |
| `["payroll", "financial_accounts", "docs"]` | Full waterfall — maximum coverage |
| `["docs"]` | Document upload only |

Use the full waterfall for the highest completion rates. Use payroll-only when you need the most reliable, employer-verified data.

### Task Status Lifecycle

```
new → login → mfa (if required) → parse → full_parse → done
```

Error states can occur at any point:

```
login_error    — bad credentials
mfa_error      — wrong MFA code
account_locked — provider locked account
no_data        — no relevant data found
unavailable    — provider temporarily down
config_error   — misconfigured order
error          — unexpected failure
```

**Maximum processing time:** 20 minutes. If a task hasn't reached `done` by then, treat it as failed and offer the applicant an alternative path.

### Security Checklist

- [ ] Access Secret stored in environment variables, never in client code
- [ ] Webhook signatures validated on every request
- [ ] Bridge tokens generated server-side and passed to client
- [ ] HTTPS enforced on all webhook endpoints
- [ ] Sensitive verification data encrypted at rest
- [ ] API keys rotated on a regular schedule
- [ ] Webhook IP allowlist configured (34.212.57.93, 44.224.243.166, 52.25.14.79)
