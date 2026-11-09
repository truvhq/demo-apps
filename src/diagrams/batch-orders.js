export const BATCH_ORDERS_DIAGRAM = `sequenceDiagram
  participant Tool as Batch Tool
  participant Truv as Truv API
  participant WH as Your webhook
  Note over Tool: Build file (your fields)<br/>split into chunks of N
  loop For each chunk (concurrency C, paced)
    Tool->>Truv: POST /v1/orders/batch/
    Note right of Tool: { orders: [ ... ] }
    Truv-->>Tool: 202 { id, status: pending }
    loop Until completed
      Tool->>Truv: GET /v1/orders/batch/{id}/
      Truv-->>Tool: { status, results: [{ index, status,<br/>order_id, share_url }] }
    end
  end
  Truv-->>WH: order-batch-completed<br/>{ batch_id, created_count, failed_count }
  Note over Tool: Export results CSV`;
