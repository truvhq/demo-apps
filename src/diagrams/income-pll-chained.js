export const DIAGRAM = `sequenceDiagram
  participant FE as Your Frontend
  participant BE as Your Backend
  participant Truv as Truv API
  FE->>BE: Submit borrower + employer
  BE->>Truv: GET /v1/company-mappings-search/?product_type=pll
  Truv-->>BE: company_mapping_id
  BE->>Truv: GET /v1/companies/{cmid}?product_type=pll
  Truv-->>BE: coverage, max_number
  Note over BE: Decision 1: coverage good?
  BE->>Truv: POST /v1/orders/ products:["income"]
  Note right of Truv: order_number = loan_id
  Truv-->>BE: voie_order, bridge_token
  FE->>Truv: TruvBridge.init({ bridgeToken })
  Note over FE: Borrower auths payroll
  Truv->>BE: Webhook: task-status-updated (done)
  BE->>Truv: GET /v1/orders/{voie_order_id}
  Truv-->>BE: bank_accounts, link_id
  BE->>Truv: GET /v1/links/{link_id}/
  Truv-->>BE: is_dds_supported
  Note over BE: Decisions 2, 3, 4: %, max, DDS
  BE->>Truv: POST /v1/orders/ products:["pll"]
  Note right of Truv: same order_number + cmid
  Truv-->>BE: pll_order, bridge_token
  FE->>Truv: TruvBridge.init({ bridgeToken })
  Note over FE: Borrower confirms (no re-auth)
  Truv->>BE: Webhook: task-status-updated (done)
  BE->>Truv: GET /v1/links/{pll_link_id}/pll/report/
  Truv-->>BE: PLL deposit-switch report`;
