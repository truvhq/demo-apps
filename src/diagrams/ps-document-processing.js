export const DOC_DIAGRAM = `sequenceDiagram
  participant FE as Your Frontend
  participant BE as Your Backend
  participant Truv as Truv API
  FE->>BE: Upload documents (base64)
  BE->>Truv: POST /v1/users/
  Truv-->>BE: user_id
  BE->>Truv: POST /v1/documents/collections/
  Note right of Truv: documents with base64 + user_id
  Truv-->>BE: collection_id
  loop Poll until files processed
    BE->>Truv: GET /v1/documents/collections/{id}/
    Truv-->>BE: status per file
  end
  BE->>Truv: POST /v1/documents/collections/{id}/finalize/
  Truv-->>BE: Finalized
  BE->>Truv: GET /v1/documents/collections/{id}/finalize/
  Truv-->>BE: Extracted income data`;
