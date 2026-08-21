const BASE = '/api';

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (data && (data.detail || JSON.stringify(data))) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

export const api = {
  listLoanFiles: () => request('GET', '/loan-files/'),
  getLoanFile: (id) => request('GET', `/loan-files/${id}/`),
  getCoverage: (id) => request('GET', `/loan-files/${id}/coverage/`),
  getFieldFillStates: (id) => request('GET', `/loan-files/${id}/field-fill-states/`),
  patchBorrower: (appId, bId, body) => request('PATCH', `/loan-files/${appId}/borrowers/${bId}/`, body),
  refreshOrder: (id) => request('POST', `/loan-files/${id}/refresh/`, {}),

  // Documents
  listDocuments: (id) => request('GET', `/loan-files/${id}/documents/`),
  fetchInvoice: (id) => request('POST', `/loan-files/${id}/documents/fetch-invoice/`, {}),
  generateAimCheckReport: (id, body) => request('POST', `/loan-files/${id}/documents/generate-aim-check-report/`, body),
  async uploadDocument(id, file, category) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', category);
    const res = await fetch(`${BASE}/loan-files/${id}/documents/upload/`, { method: 'POST', body: formData });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && JSON.stringify(data)) || `Upload failed (${res.status})`);
    return data;
  },

  // Underwriting support
  getUnderwritingSupport: (id) => request('GET', `/loan-files/${id}/underwriting-support/`),
  getUnderwritingCalc: (id) => request('GET', `/loan-files/${id}/underwriting-calc/`),
  patchLoanProperty: (id, body) => request('PATCH', `/loan-files/${id}/loan-property/`, body),
  getUnderwritingDecision: (id) => request('GET', `/loan-files/${id}/underwriting-decision/`),
  submitUnderwritingDecision: (id, body) => request('POST', `/loan-files/${id}/underwriting-decision/`, body),
  getClosingVerification: (id) => request('GET', `/loan-files/${id}/closing-verification/`),

  // Activity
  getActivityLog: (id) => request('GET', `/loan-files/${id}/activity/`),

  // Verification ("Configure Truv" console — LOS's own, mirrors POS's)
  createVerificationRequest: (body) => request('POST', '/verification/requests/', body),
  getVerificationRequest: (id) => request('GET', `/verification/requests/${id}/`),
  applyVerificationRequest: (id) => request('POST', `/verification/requests/${id}/apply/`, {}),
  uploadDocuments: (id, documents) => request('POST', `/verification/requests/${id}/documents/upload/`, { documents }),
  finalizeDocuments: (id) => request('POST', `/verification/requests/${id}/documents/finalize/`, {}),
  getDocumentResults: (id) => request('GET', `/verification/requests/${id}/documents/results/`),
  searchEmployers: (q) => request('GET', `/verification/employers/search/?q=${encodeURIComponent(q)}`),
  searchProviders: (q) => request('GET', `/verification/providers/search/?q=${encodeURIComponent(q)}`),
  listStepConfigs: () => request('GET', '/verification/step-configs/'),
  getStepConfig: (stepKey) => request('GET', `/verification/step-configs/${stepKey}/`),
  saveStepConfig: (stepKey, body) => request('PUT', `/verification/step-configs/${stepKey}/`, body),

  // Credentials (Settings screen)
  listCredentialSets: () => request('GET', '/truv/credential-sets/'),
  createCredentialSet: (body) => request('POST', '/truv/credential-sets/', body),
  patchCredentialSet: (id, body) => request('PATCH', `/truv/credential-sets/${id}/`, body),
  activateCredentialSet: (id) => request('POST', `/truv/credential-sets/${id}/activate/`, {}),
  testCredentialSet: (id) => request('POST', `/truv/credential-sets/${id}/test/`, {}),
  deleteCredentialSet: (id) => request('DELETE', `/truv/credential-sets/${id}/`),
  listApiLogs: () => request('GET', '/truv/api-logs/'),
  listWebhookEvents: () => request('GET', '/truv/webhook-events/'),

  // AIM Check configuration (shared truv_integration app)
  getAimCheckConfig: () => request('GET', '/truv/aim-check-config/'),
  patchAimCheckConfig: (body) => request('PATCH', '/truv/aim-check-config/', body),

  // Order defaults (shared truv_integration app)
  getOrderDefaultsConfig: () => request('GET', '/truv/order-defaults-config/'),
  patchOrderDefaultsConfig: (body) => request('PATCH', '/truv/order-defaults-config/', body),
};
