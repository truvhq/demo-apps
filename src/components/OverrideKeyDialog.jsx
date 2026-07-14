/**
 * FILE SUMMARY: In-session "Override key" modal
 * DATA FLOW: user clicks "Override key" -> form -> useSession.override(client_id, secret)
 *            -> PUT /api/session/keys -> swap creds + webhook in place
 *
 * Distinct from "Update API keys" (which destroys the session and returns to
 * the Configure screen). Override preserves the session id and demo state,
 * just swaps the underlying Truv account.
 */
import { useEffect, useState } from 'preact/hooks';

const ERROR_COPY = {
  invalid_credentials: 'Those credentials were rejected by Truv. Double-check on the dashboard.',
  invalid_input: 'Both fields are required and must be at least 8 characters.',
  truv_unreachable: 'Truv could not be reached. Try again in a few seconds.',
  webhook_registration_failed: 'Truv accepted the keys but a webhook could not be registered.',
  rate_limited: 'Too many attempts. Try again in a few minutes.',
  session_required: 'Your session expired. Please reconfigure.',
};

function describeError(status, error, retryAfter) {
  if (status === 429) {
    return ERROR_COPY.rate_limited;
  }
  return ERROR_COPY[error] || 'Something went wrong. Please try again.';
}

export function OverrideKeyDialog({ open, onClose, onSubmit }) {
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Reset state whenever the dialog reopens — never leave secrets around.
  useEffect(() => {
    if (open) {
      setClientId('');
      setSecret('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    const result = await onSubmit(clientId.trim(), secret.trim());
    setBusy(false);
    if (result.ok) {
      setClientId('');
      setSecret('');
      onClose?.();
      return;
    }
    setError(describeError(result.status, result.error, result.retryAfter));
  }

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center px-6 bg-black/30 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose?.(); }}
    >
      <div class="w-full max-w-[420px] bg-white border border-[#e8e8ed] rounded-[16px] shadow-[0_8px_32px_rgba(16,24,40,0.16)] px-7 py-6 animate-slideUp">
        <div class="flex items-start justify-between gap-4 mb-7">
          <div>
            <h2 class="text-[24px] font-semibold tracking-[-0.015em] text-[#000000]">Use a different API key</h2>
            <p class="text-[13px] text-[#808080] leading-[1.5] mt-1">
              Swap in keys from a different Truv account without losing your demo session.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            class="text-[#808080] hover:text-[#000000] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} class="space-y-3">
          <label class="block">
            <span class="block text-[15px] font-medium text-[#000000] mb-1.5">API client ID</span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              required
              minLength={8}
              maxLength={256}
              value={clientId}
              onInput={(e) => setClientId(e.currentTarget.value)}
              placeholder="cid_..."
              disabled={busy}
              class="w-full px-3 py-2 text-[14px] border border-[#d2d2d7] rounded-[10px] bg-white focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/12 font-mono disabled:bg-[#fafafa]"
            />
          </label>

          <label class="block">
            <span class="block text-[15px] font-medium text-[#000000] mb-1.5">API secret</span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              required
              minLength={8}
              maxLength={256}
              value={secret}
              onInput={(e) => setSecret(e.currentTarget.value)}
              placeholder="sec_..."
              disabled={busy}
              class="w-full px-3 py-2 text-[14px] border border-[#d2d2d7] rounded-[10px] bg-white focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/12 font-mono disabled:bg-[#fafafa]"
            />
          </label>

          {error && (
            <div class="text-[13px] text-[#b42318] bg-[#fef3f2] border border-[#fda29b]/60 rounded-[10px] px-3 py-2">
              {error}
            </div>
          )}

          <div class="flex items-center justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              class="px-3 py-2 text-[13px] font-medium text-[#808080] hover:text-[#000000] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !clientId || !secret}
              class="px-4 py-2 text-[13px] font-medium text-white bg-primary rounded-lg hover:bg-primary-hover active:bg-primary-active disabled:bg-[#c7c7cc] disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
            >
              {busy && <span class="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              {busy ? 'Saving…' : 'Save keys'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
