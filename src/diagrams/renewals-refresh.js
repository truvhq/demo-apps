/**
 * FILE SUMMARY: Mermaid diagrams for the Public Sector Renewals & Data Refresh demo.
 *
 * Two definitions:
 *   RENEWALS_DIAGRAM  - the whole recertification loop, both outcomes
 *   REFRESH_FORK_DIAGRAM - just the fork, for the walkthrough's "two paths" stage
 *
 * The load-bearing detail in both: on the failure path the ORDER status never
 * changes, so `order-status-updated` is never emitted again and the order sits at
 * `sent`. `order-refresh-failed` is the only signal. That is the whole reason this
 * demo exists.
 */

export const RENEWALS_DIAGRAM = `sequenceDiagram
  participant CW as Caseworker
  participant BE as Agency Backend
  participant Truv as Truv API
  participant P as Payroll / Bank
  participant A as Applicant
  Note over CW,BE: Recertification comes due
  BE->>Truv: POST /v1/orders/{id}/
  Note right of BE: refresh the existing connection
  Truv-->>BE: new order (own id, share_url, bridge_token)
  Truv->>P: reconnect with stored credentials
  alt Session still valid
    P-->>Truv: fresh income / balances
    Truv->>BE: order-status-updated (completed)
    Note right of BE: zero applicant action
  else Re-authorization needed
    P-->>Truv: MFA challenge / credentials changed
    Truv->>BE: order-refresh-failed (mfa_error)
    Note right of BE: order stays at sent, no further status update
    BE->>A: send the refresh order's share_url
    A->>Truv: clears MFA only (no credentials re-entered)
    Truv->>BE: order-status-updated (completed)
  end
  BE->>Truv: GET /v1/orders/{new_id}/
  Truv-->>BE: refreshed report`;

export const REFRESH_FORK_DIAGRAM = `flowchart TD
  R["POST /v1/orders/{id}/<br/>refresh requested"] --> T{"Stored session<br/>still valid?"}
  T -->|Yes| S["order-status-updated: completed<br/>fresh data, no applicant action"]
  T -->|No| F["order-refresh-failed<br/>status: mfa_error / login_error"]
  F --> W["Order stays at sent<br/>no further status update, ever"]
  W --> A["Applicant clears MFA<br/>via the refresh order's own link"]
  A --> S`;
