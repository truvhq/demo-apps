export const DIAGRAM = `sequenceDiagram
  participant FE as Your Frontend
  participant BE as Your Backend
  participant Truv as Truv API
  FE->>BE: Applicant submits information
  BE->>Truv: GET /v1/company-mappings-search/?query=employer
  Truv-->>BE: results with success_rate
  BE-->>FE: Recommend method based on success_rate
  FE->>FE: Applicant confirms or overrides
  FE->>BE: Selected method + data_sources
  BE->>Truv: POST /v1/users/
  Truv-->>BE: user_id
  BE->>Truv: POST /v1/users/{user_id}/tokens/
  Note right of Truv: { product_type, data_sources }
  Truv-->>BE: bridge_token
  BE-->>FE: bridge_token
  FE->>Truv: TruvBridge.init({ bridgeToken })
  Note over FE: Applicant connects provider
  Truv->>BE: Webhook: task-status-updated (done)
  BE->>Truv: POST /v1/users/{user_id}/reports/
  Truv-->>BE: Verification report`;
