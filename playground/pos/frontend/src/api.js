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
  // Applications
  listApplications: () => request('GET', '/applications/'),
  createApplication: (body) => request('POST', '/applications/', body),
  getApplication: (id) => request('GET', `/applications/${id}/`),
  patchApplication: (id, body) => request('PATCH', `/applications/${id}/`, body),
  getCoverage: (id) => request('GET', `/applications/${id}/coverage/`),
  getFieldFillStates: (id) => request('GET', `/applications/${id}/field-fill-states/`),
  submitToLos: (id) => request('POST', `/applications/${id}/submit/`, {}),
  getSyncStatus: (id) => request('GET', `/sync/${id}/status/`),
  getLoanProperty: (id) => request('GET', `/applications/${id}/loan-property/`),
  patchLoanProperty: (id, body) => request('PATCH', `/applications/${id}/loan-property/`, body),

  // Borrower
  getBorrower: (appId, bId) => request('GET', `/applications/${appId}/borrowers/${bId}/`),
  patchBorrower: (appId, bId, body) => request('PATCH', `/applications/${appId}/borrowers/${bId}/`, body),

  // Sections (list/create + detail/patch/delete)
  section: (name) => ({
    list: (appId, bId) => request('GET', `/applications/${appId}/borrowers/${bId}/${name}/`),
    create: (appId, bId, body) => request('POST', `/applications/${appId}/borrowers/${bId}/${name}/`, body),
    patch: (appId, bId, itemId, body) => request('PATCH', `/applications/${appId}/borrowers/${bId}/${name}/${itemId}/`, body),
    remove: (appId, bId, itemId) => request('DELETE', `/applications/${appId}/borrowers/${bId}/${name}/${itemId}/`),
  }),

  // One-to-one sections
  getDeclaration: (appId, bId) => request('GET', `/applications/${appId}/borrowers/${bId}/declarations/`),
  patchDeclaration: (appId, bId, body) => request('PATCH', `/applications/${appId}/borrowers/${bId}/declarations/`, body),
  getDemographics: (appId, bId) => request('GET', `/applications/${appId}/borrowers/${bId}/demographics/`),
  patchDemographics: (appId, bId, body) => request('PATCH', `/applications/${appId}/borrowers/${bId}/demographics/`, body),

  // Verification (wired up in a later step)
  createVerificationRequest: (body) => request('POST', '/verification/requests/', body),
  getVerificationRequest: (id) => request('GET', `/verification/requests/${id}/`),
  applyVerificationRequest: (id) => request('POST', `/verification/requests/${id}/apply/`, {}),
  uploadDocuments: (id, documents) => request('POST', `/verification/requests/${id}/documents/upload/`, { documents }),
  finalizeDocuments: (id) => request('POST', `/verification/requests/${id}/documents/finalize/`, {}),
  getDocumentResults: (id) => request('GET', `/verification/requests/${id}/documents/results/`),
  searchEmployers: (q) => request('GET', `/verification/employers/search/?q=${encodeURIComponent(q)}`),
  searchProviders: (q) => request('GET', `/verification/providers/search/?q=${encodeURIComponent(q)}`),

  // Per-step saved Truv configuration ("Configure Truv")
  listStepConfigs: () => request('GET', '/verification/step-configs/'),
  getStepConfig: (stepKey) => request('GET', `/verification/step-configs/${stepKey}/`),
  saveStepConfig: (stepKey, body) => request('PUT', `/verification/step-configs/${stepKey}/`, body),

  // Credentials (Settings screen)
  listCredentialSets: () => request('GET', '/truv/credential-sets/'),
  createCredentialSet: (body) => request('POST', '/truv/credential-sets/', body),
  patchCredentialSet: (id, body) => request('PATCH', `/truv/credential-sets/${id}/`, body),
  deleteCredentialSet: (id) => request('DELETE', `/truv/credential-sets/${id}/`),
  activateCredentialSet: (id) => request('POST', `/truv/credential-sets/${id}/activate/`, {}),
  testCredentialSet: (id) => request('POST', `/truv/credential-sets/${id}/test/`, {}),
  getActiveCredentialSet: () => request('GET', '/truv/credential-sets/active/'),
  listApiLogs: () => request('GET', '/truv/api-logs/'),
  listWebhookEvents: () => request('GET', '/truv/webhook-events/'),

  // AIM Check configuration (shared truv_integration app)
  getAimCheckConfig: () => request('GET', '/truv/aim-check-config/'),
  patchAimCheckConfig: (body) => request('PATCH', '/truv/aim-check-config/', body),

  // Order defaults (shared truv_integration app)
  getOrderDefaultsConfig: () => request('GET', '/truv/order-defaults-config/'),
  patchOrderDefaultsConfig: (body) => request('PATCH', '/truv/order-defaults-config/', body),
};

export const EMPLOYMENT = api.section('employment');
export const OTHER_INCOME = api.section('other-income');
export const ASSETS = api.section('assets');
export const LIABILITIES = api.section('liabilities');
export const REO = api.section('reo');
