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

function EyeIcon({ open }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-6.5 0-10-7-10-7a18.45 18.45 0 0 1 4.21-5.06" />
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

function SecretInput({ label, value, onInput, placeholder, disabled }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <label class="block">
      <span class="block text-[13px] font-medium text-[#171717] mb-1.5">{label}</span>
      <div class="relative">
        <input
          type={revealed ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          required
          minLength={8}
          maxLength={256}
          value={value}
          onInput={onInput}
          class="w-full px-3 py-2 pr-10 text-[14px] border border-[#e8e8ed] rounded-lg bg-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 font-mono"
          placeholder={placeholder}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={() => setRevealed(r => !r)}
          aria-label={revealed ? `Hide ${label}` : `Show ${label}`}
          tabIndex={-1}
          class="absolute inset-y-0 right-0 px-3 flex items-center text-[#8E8E93] hover:text-[#171717] transition-colors"
        >
          <EyeIcon open={revealed} />
        </button>
      </div>
    </label>
  );
}

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
          <h1 class="text-[22px] font-semibold tracking-[-0.02em] text-[#171717]">Personalize your demo</h1>
          <p class="text-[14px] text-[#8E8E93] text-center leading-[1.5]">
            Plug in your own Truv API keys to run the demos against your account — your employers, your webhooks, your data.
            Keys stay in this browser session only and never touch our server.
          </p>
        </div>

        <form onSubmit={handleSubmit} class="space-y-4">
          <SecretInput
            label="API client ID"
            value={clientId}
            onInput={e => setClientId(e.currentTarget.value)}
            placeholder="cid_..."
            disabled={busy}
          />
          <SecretInput
            label="API secret"
            value={secret}
            onInput={e => setSecret(e.currentTarget.value)}
            placeholder="sec_..."
            disabled={busy}
          />

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

          <a
            href="https://dashboard.truv.com/app/development/keys"
            target="_blank"
            rel="noreferrer"
            class="w-full py-2.5 text-[14px] font-medium text-[#171717] bg-white border border-[#e8e8ed] rounded-lg hover:bg-[#f5f5f7] hover:border-[#d1d1d6] transition-colors flex items-center justify-center gap-1.5"
          >
            Sign up to get API keys
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </form>
      </div>
    </div>
  );
}
