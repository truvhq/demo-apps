export const DIAGRAMS = {
  income: `sequenceDiagram
  participant FE as Your Frontend
  participant BE as Your Backend
  participant Truv as Truv API
  FE->>BE: Borrower submits application
  BE->>Truv: GET /v1/company-mappings-search/
  Truv-->>BE: company_mapping_id
  BE->>Truv: POST /v1/orders/
  Note right of Truv: PII + employer + products: ["income"]
  Truv-->>BE: bridge_token, user_id
  BE-->>FE: bridge_token
  FE->>Truv: TruvBridge.init({ bridgeToken, isOrder: true })
  Note over FE: Borrower logs in with employer
  Truv->>BE: Webhook: order-status-updated (completed)
  BE->>Truv: POST /v1/users/{user_id}/reports/
  Truv-->>BE: VOIE Report`,
  assets: `sequenceDiagram
  participant FE as Your Frontend
  participant BE as Your Backend
  participant Truv as Truv API
  FE->>BE: Borrower submits application
  BE->>Truv: GET /v1/providers/?data_source=financial_accounts
  Truv-->>BE: provider_id
  BE->>Truv: POST /v1/orders/
  Note right of Truv: PII + financial_institutions: [{ id }] + products: ["assets"]
  Truv-->>BE: bridge_token, user_id
  BE-->>FE: bridge_token
  FE->>Truv: TruvBridge.init({ bridgeToken, isOrder: true })
  Note over FE: Borrower connects bank account
  Truv->>BE: Webhook: order-status-updated (completed)
  BE->>Truv: POST /v1/users/{user_id}/assets/reports/
  Truv-->>BE: VOA Report
  BE->>Truv: POST /v1/users/{user_id}/income_insights/reports/
  Truv-->>BE: Income Insights Report`,
};
