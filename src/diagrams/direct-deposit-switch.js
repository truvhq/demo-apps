export const DIAGRAM = `sequenceDiagram
  participant FE as Your Frontend
  participant BE as Your Backend
  participant Truv as Truv API
  FE->>BE: Customer submits information
  BE->>Truv: POST /v1/users/
  Truv-->>BE: user_id
  BE->>Truv: POST /v1/users/{user_id}/tokens/
  Note right of Truv: { product_type: deposit_switch, account details }
  Truv-->>BE: bridge_token
  BE-->>FE: bridge_token
  FE->>Truv: TruvBridge.init({ bridgeToken })
  Note over FE: Customer connects payroll
  BE->>Truv: POST /v1/link-access-tokens/
  Truv-->>BE: access_token
  Truv->>BE: Webhook: task-status-updated (done)
  BE->>Truv: GET /v1/users/{user_id}/deposit_switch/report/
  Truv-->>BE: Deposit switch confirmed`;
