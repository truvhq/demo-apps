/**
 * FILE SUMMARY: Mermaid diagrams for the Public Sector Renewals & Data Refresh demo.
 *
 * Two definitions:
 *   RENEWALS_DIAGRAM  - the whole recertification loop, both outcomes
 *   REFRESH_FORK_DIAGRAM - just the fork, for the walkthrough's "two paths" stage
 *
 * The load-bearing detail in both: on the failure path that connection does not
 * complete until the applicant acts, and `order-refresh-failed` is the webhook that
 * reports it (the reason and the stable link_id are on the task).
 *
 * Note the limit of that: `order-status-updated` is emitted PER SUBORDER and carries
 * an `employer_id`. Each applicant in this demo has a single connection, so a
 * failure looks like silence. On a multi-employer order the connections that worked
 * still emit `completed` — see REFRESH-FINDINGS.md.
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
    Note right of BE: this connection does not complete until the applicant acts
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
  F --> W["This connection does not complete until the applicant acts<br/>order-refresh-failed reports the failure"]
  W --> A["Applicant clears MFA<br/>via the refresh order's own link"]
  A --> S`;
