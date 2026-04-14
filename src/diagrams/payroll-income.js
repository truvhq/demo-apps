export const DIAGRAM = `sequenceDiagram
  participant FE as Your Frontend
  participant BE as Your Backend
  participant Truv as Truv API
  FE->>BE: Applicant submits information
  BE->>Truv: POST /v1/users/
  Truv-->>BE: user_id
  BE->>Truv: POST /v1/users/{user_id}/tokens/
  Note right of Truv: { product_type: income, data_sources: [payroll] }
  Truv-->>BE: bridge_token
  BE-->>FE: bridge_token
  FE->>Truv: TruvBridge.init({ bridgeToken })
  Note over FE: Applicant connects payroll
  BE->>Truv: POST /v1/link-access-tokens/
  Truv-->>BE: access_token
  Truv->>BE: Webhook: task-status-updated (done)
  BE->>Truv: POST /v1/users/{user_id}/reports/
  Truv-->>BE: VOIE Report`;
