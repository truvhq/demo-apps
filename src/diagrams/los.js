export const VERIFIER_DIAGRAM = `sequenceDiagram
  participant BE as Your Backend
  participant Truv as Truv API
  participant User as Borrower
  BE->>Truv: POST /v1/orders/
  Note right of Truv: PII + email + phone + products
  Truv-->>BE: order_id, share_url
  Truv->>User: Email/SMS with share_url
  User->>Truv: Opens share_url, completes Bridge
  Truv->>BE: Webhook: order-status-updated
  BE->>Truv: POST /v1/users/{user_id}/reports/
  Truv-->>BE: Verification report`;
