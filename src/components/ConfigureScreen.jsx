/**
 * FILE SUMMARY: BYO API credentials entry screen
 * DATA FLOW: form -> useSession.submit -> POST /api/session
 *
 * Shown on first visit and after Reset credentials. The raw secret stays in
 * this component's local state until submit; on success the input value is
 * cleared and the rest of the app loads. Credentials never go to localStorage,
 * sessionStorage, or anywhere else in JS land.
 */
import { useState } from 'preact/hooks';
import { Icons } from './Icons.jsx';

const ERROR_COPY = {
  invalid_credentials: 'Those credentials were rejected by Truv. Double-check the client ID and secret on the dashboard.',
  invalid_input: 'Both fields are required and must be at least 8 characters.',
  truv_unreachable: 'Truv could not be reached. Try again in a few seconds.',
  webhook_registration_failed: 'Truv accepted the credentials but a webhook could not be registered. Try again or check the Truv dashboard for webhook quota.',
  rate_limited: 'Too many attempts from this address. Wait a few minutes and try again.',
};

function describeError(status, error, retryAfter) {
  if (status === 429) {
    const mins = retryAfter ? Math.ceil(Number(retryAfter) / 60) : null;
    return mins ? `Too many attempts. Try again in ~${mins} minute${mins === 1 ? '' : 's'}.` : ERROR_COPY.rate_limited;
  }
  return ERROR_COPY[error] || 'Something went wrong. Please try again.';
}

export function ConfigureScreen({ onSubmit }) {
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    const result = await onSubmit(clientId.trim(), secret.trim());
    setBusy(false);
    if (result.ok) {
      // Wipe the secret from the input state on success so it doesn't linger
      // in the DOM. The HttpOnly cookie is the only credential carrier now.
      setClientId('');
      setSecret('');
      return;
    }
    setError(describeError(result.status, result.error, result.retryAfter));
  }

  return (
    <div class="min-h-screen flex items-center justify-center bg-[#fafafa] px-6">
      <div class="w-full max-w-md">
        <div class="flex flex-col items-center gap-3 mb-8">
          <Icons.truvLogo height={20} className="text-text" />
          <h1 class="text-[22px] font-semibold tracking-[-0.02em] text-[#171717]">Configure Truv credentials</h1>
          <p class="text-[14px] text-[#8E8E93] text-center leading-[1.5]">
            Enter your sandbox or production keys to run the demos against your own Truv account.
            Credentials are kept in this browser session only and are never stored on the server.
          </p>
        </div>

        <form onSubmit={handleSubmit} class="space-y-4">
          <label class="block">
            <span class="block text-[13px] font-medium text-[#171717] mb-1.5">API client ID</span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              required
              minLength={8}
              maxLength={256}
              value={clientId}
              onInput={e => setClientId(e.currentTarget.value)}
              class="w-full px-3 py-2 text-[14px] border border-[#e8e8ed] rounded-lg bg-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 font-mono"
              placeholder="cid_..."
              disabled={busy}
            />
          </label>

          <label class="block">
            <span class="block text-[13px] font-medium text-[#171717] mb-1.5">API secret</span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              required
              minLength={8}
              maxLength={256}
              value={secret}
              onInput={e => setSecret(e.currentTarget.value)}
              class="w-full px-3 py-2 text-[14px] border border-[#e8e8ed] rounded-lg bg-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 font-mono"
              placeholder="sec_..."
              disabled={busy}
            />
          </label>

          {error && (
            <div class="text-[13px] text-[#c81e1e] bg-[#fef2f2] border border-[#fecaca] rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !clientId || !secret}
            class="w-full py-2.5 text-[14px] font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:bg-[#c7c7cc] disabled:cursor-not-allowed transition-colors"
          >
            {busy ? 'Validating…' : 'Start demo'}
          </button>

          <p class="text-[12px] text-[#8E8E93] text-center pt-2">
            Get your keys from the{' '}
            <a href="https://dashboard.truv.com/app/development/keys" target="_blank" rel="noreferrer" class="text-primary hover:underline">
              Truv dashboard
            </a>.
          </p>
        </form>
      </div>
    </div>
  );
}
