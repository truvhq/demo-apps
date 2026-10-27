/**
 * FILE SUMMARY: What each result means and what an integration should do about it, in plain words. Taken from the
 * Truv docs (task lifecycle and webhooks pages), so the sandbox playground can answer "what do I do when I get this?".
 */
export const DOCS_BASE = 'https://docs.truv.com';
export const DOC_LINKS = {
  lifecycle: { label: 'Task lifecycle', href: `${DOCS_BASE}/api-reference/tasks/lifecycle` },
  taskEvents: { label: 'Task webhook events', href: `${DOCS_BASE}/api-reference/tasks/events#task-status-updated` },
  orderEvents: { label: 'Order webhook events', href: `${DOCS_BASE}/api-reference/orders/events#order-status-updated` },
};

// status: the task status the API reports. do: what the integration should do. fix: whether the person can fix it.
export const OUTCOMES = [
  { status: 'done', name: 'Success', means: 'All the data was downloaded and processed.', do: 'Fetch the report. The order stays "sent" until the person finishes it in Bridge.', fix: 'n/a' },
  { status: 'login_error', name: 'Wrong password', means: 'The provider rejected the sign-in.', do: 'Ask the person to sign in again (Bridge update mode).', fix: 'Person' },
  { status: 'mfa_error', name: 'Code rejected', means: 'The verification step was not completed.', do: 'Let them retry, or offer a document upload instead.', fix: 'Person' },
  { status: 'account_locked', name: 'Account locked', means: 'The payroll or bank account is locked at the provider.', do: 'Ask them to unlock it with the provider, then retry.', fix: 'Person' },
  { status: 'config_error', name: 'Setup problem', means: 'The provider connection is not set up for this request. Also raised when an uploaded document fails a fraud check.', do: 'Read the task error_message. Offer a different provider or manual steps.', fix: 'Not the person' },
  { status: 'no_data', name: 'Signs in, no records', means: 'The sign-in worked and the provider had nothing to return.', do: 'Offer a document upload. Do not treat it as verified $0 income.', fix: 'Not the person' },
  { status: 'unavailable', name: 'Provider down', means: 'The provider is temporarily out of reach.', do: 'Retry later or move to a document upload.', fix: 'Not the person' },
  { status: 'not_supported', name: 'Not supported', means: 'Truv does not support this provider or system for this product.', do: 'Tell the person and offer a document upload.', fix: 'Not the person' },
  { status: 'unable_to_reset', name: 'Reset failed', means: 'Resetting the credentials at the provider did not work.', do: 'Send them to manual verification.', fix: 'Not the person' },
  { status: 'error', name: 'Generic error', means: 'The connection failed for a reason that was not narrowed down.', do: 'Log the task id and contact Truv support if it keeps happening.', fix: 'Not the person' },
];

export const outcomeFor = (status) => OUTCOMES.find(o => o.status === status) || null;
