export const FOLLOWUP_DIAGRAM = `sequenceDiagram
  participant FE as Your Frontend
  participant BE as Your Backend
  participant Truv as Truv API
  FE->>BE: Loan Processor creates tasks
  BE->>Truv: POST /v1/orders/ (income)
  BE->>Truv: POST /v1/orders/ (employment)
  BE->>Truv: POST /v1/orders/ (assets)
  BE->>Truv: POST /v1/orders/ (income+assets)
  Note right of Truv: All share same external_user_id
  Truv-->>BE: bridge_tokens, shared user_id
  BE-->>FE: bridge_tokens
  loop For each task
    FE->>Truv: TruvBridge.init({ bridgeToken, isOrder: true })
    Note over FE: Borrower completes verification
  end
  Truv->>BE: Webhook: order-status-updated
  BE->>Truv: POST /v1/users/{user_id}/reports/
  Truv-->>BE: Report data`;
