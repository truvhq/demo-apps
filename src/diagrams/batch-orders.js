// Batch Orders sequence diagram. Carries its own %%{init}%% theme directive so it
// renders in the Checkr look (near-black actors, soft-yellow notes) independent of the
// shared blue MermaidDiagram theme. themeVariables can be overridden per-diagram even
// under mermaid's strict securityLevel, so this needs no change to the component.
export const BATCH_ORDERS_DIAGRAM = `%%{init: {'theme':'base','themeVariables':{'actorBkg':'#1b1c1f','actorBorder':'#1b1c1f','actorTextColor':'#ffffff','actorLineColor':'#c3cbd6','signalColor':'#7a828c','signalTextColor':'#1b1c1f','labelBoxBkgColor':'#1b1c1f','labelBoxBorderColor':'#1b1c1f','labelTextColor':'#ffffff','loopTextColor':'#474c52','noteBkgColor':'#eff5a6','noteBorderColor':'#cdd65a','noteTextColor':'#1b1c1f','activationBkgColor':'#d8dee5','activationBorderColor':'#1b1c1f'}}}%%
sequenceDiagram
  participant Tool as Batch Tool
  participant Truv as Truv API
  participant WH as Your webhook

  Note over Tool: Build the file - your columns,<br/>split into batches of up to 10,000

  loop Each batch - up to C in parallel, paced
    Tool->>Truv: POST /v1/orders/batch/
    Note right of Tool: { orders: [ ... ] }
    Truv-->>Tool: 202 Accepted { id, status: pending }
  end

  Note over Tool,WH: Then learn when each batch finishes -<br/>poll for it, or let Truv call you

  alt Poll for status
    loop Until status is completed
      Tool->>Truv: GET /v1/orders/batch/{id}/
      Truv-->>Tool: { status, results: [ { index, status,<br/>order_id, share_url } ] }
    end
  else Webhook - no polling
    Truv-->>WH: order-batch-completed<br/>{ batch_id, created_count, failed_count }
  end

  Note over Tool: Read each result -<br/>open share_url, then export CSV`;
