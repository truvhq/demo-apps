/**
 * FILE SUMMARY: BYO API credentials entry screen
 * DATA FLOW:
 *   SSO path:   click "Sign in with Truv" -> Auth0 PKCE -> callback in App.jsx
 *               -> useSession.submitSso -> POST /api/session/sso
 *   Paste path: "Use a key instead" -> form -> useSession.submit -> POST /api/session
 *
 * SSO is the primary CTA when configured; paste collapses behind a link.
 * The raw secret stays in this component's local state until submit; on success
 * the input value is cleared and the rest of the app loads.
 */
import { useState } from 'preact/hooks';
import { Icons } from './Icons.jsx';
import { signIn, isSsoConfigured } from '../auth/auth0Client.js';

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
      <span class="block text-[12px] font-medium text-[#171717] mb-1.5 tracking-[-0.005em]">{label}</span>
      <div class="relative group">
        <input
          type={revealed ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          required
          minLength={8}
          maxLength={256}
          value={value}
          onInput={onInput}
          class="w-full px-3.5 py-2.5 pr-11 text-[14px] border border-[#e8e8ed] rounded-[10px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)] placeholder:text-[#c7c7cc] focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/12 hover:border-[#d1d1d6] transition-all font-mono disabled:bg-[#fafafa] disabled:cursor-not-allowed"
          placeholder={placeholder}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={() => setRevealed(r => !r)}
          aria-label={revealed ? `Hide ${label}` : `Show ${label}`}
          tabIndex={-1}
          class="absolute inset-y-0 right-0 px-3 flex items-center text-[#a0a0a8] hover:text-[#171717] transition-colors"
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
  sso_disabled: 'Sign in with Truv is not enabled on this demo. Use a key instead.',
};

function describeError(status, error, retryAfter) {
  if (status === 429) {
    const mins = retryAfter ? Math.ceil(Number(retryAfter) / 60) : null;
    return mins ? `Too many attempts. Try again in ~${mins} minute${mins === 1 ? '' : 's'}.` : ERROR_COPY.rate_limited;
  }
  return ERROR_COPY[error] || 'Something went wrong. Please try again.';
}

// Empty-state card: shown when SSO succeeds but the user has no API keys.
function NoKeysState({ dashboardUrl, onPasteInstead }) {
  return (
    <div class="space-y-4 text-center">
      <div class="flex items-center justify-center w-11 h-11 rounded-full bg-[#fffbeb] border border-[#fde68a] mx-auto">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b45309" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        </svg>
      </div>
      <div>
        <h2 class="text-[16px] font-semibold tracking-[-0.015em] text-[#171717]">You don't have any API keys yet</h2>
        <p class="text-[13px] text-[#6e6e73] leading-[1.55] mt-1">
          Create one in the Truv dashboard to start running the demos with your account.
        </p>
      </div>
      <div class="space-y-2.5">
        <a
          href={dashboardUrl || 'https://dashboard.truv.com/app/development/keys'}
          target="_blank"
          rel="noreferrer"
          class="block w-full py-2.5 text-[14px] font-medium text-white bg-primary rounded-[10px] hover:bg-primary/90 transition-colors"
        >
          Create your first API key
        </a>
        <button
          type="button"
          onClick={onPasteInstead}
          class="block w-full py-2 text-[13px] font-medium text-[#6e6e73] hover:text-[#171717] transition-colors"
        >
          Or paste a key now
        </button>
      </div>
    </div>
  );
}

export function ConfigureScreen({ onSubmit, ssoError }) {
  const ssoConfigured = isSsoConfigured();

  // Default to SSO mode when Auth0 is configured; otherwise show paste directly.
  const [mode, setMode] = useState(ssoConfigured ? 'sso' : 'paste');
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState(null);
  const [ssoBusy, setSsoBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  // Treat an upstream "no_keys_available" signal as a state, not just an error.
  const noKeysState = ssoError?.error === 'no_keys_available' ? ssoError : null;

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
      return;
    }
    setError(describeError(result.status, result.error, result.retryAfter));
  }

  async function handleSsoClick() {
    if (ssoBusy) return;
    setError(null);
    setSsoBusy(true);
    try {
      await signIn();
      // signIn() redirects, so we never resume here on the happy path.
    } catch (err) {
      console.error('Sign-in failed:', err.message);
      setError('Could not start sign-in. Try again or use a key instead.');
      setSsoBusy(false);
    }
  }

  return (
    <div class="min-h-screen relative flex items-center justify-center px-6 overflow-hidden bg-[#fafafa]">
      {/* Soft background ambience: two pastel radial blooms behind the card. */}
      <div aria-hidden="true" class="pointer-events-none absolute inset-0">
        <div class="absolute -top-32 left-1/2 -translate-x-1/2 w-[640px] h-[640px] rounded-full bg-[radial-gradient(circle_at_center,rgba(94,92,230,0.10),transparent_60%)]" />
        <div class="absolute -bottom-40 left-[60%] w-[520px] h-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(10,132,255,0.08),transparent_60%)]" />
      </div>

      {/* Contact sales CTA — always reachable from the entry screen. */}
      <a
        href="https://truv.com/contact-sales"
        target="_blank"
        rel="noreferrer"
        class="absolute top-5 right-6 z-10 text-[13px] font-medium text-white bg-primary rounded-md px-3.5 py-1.5 shadow-[0_1px_2px_rgba(16,24,40,0.06)] hover:bg-primary/90 hover:shadow-[0_2px_6px_rgba(94,92,230,0.25)] transition-all"
      >
        Contact sales
      </a>

      <div class="relative w-full max-w-[420px] animate-slideUp">
        <div class="bg-white border border-[#e8e8ed]/80 rounded-[20px] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_rgba(16,24,40,0.06)] px-8 py-9">
          {/* Header */}
          <div class="flex flex-col items-center gap-3 mb-6">
            <Icons.truvLogo height={22} className="text-text" />
            <h1 class="text-[22px] font-semibold tracking-[-0.025em] text-[#171717]">Personalize your demo</h1>
            <p class="text-[13.5px] text-[#6e6e73] text-center leading-[1.55] max-w-[340px]">
              Add your Truv API keys to try the demos on your own account.
              The demo will create users, send requests, and pull reports. You can watch all of it show up in your Truv dashboard.
            </p>
          </div>

          {noKeysState ? (
            <NoKeysState dashboardUrl={noKeysState.dashboard_url} onPasteInstead={() => setMode('paste')} />
          ) : mode === 'sso' ? (
            <div class="space-y-3">
              {error && (
                <div class="text-[13px] text-[#b42318] bg-[#fef3f2] border border-[#fda29b]/60 rounded-[10px] px-3 py-2 animate-fadeIn">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={handleSsoClick}
                disabled={ssoBusy}
                class="w-full py-2.5 text-[14px] font-medium text-white bg-primary rounded-[10px] shadow-[0_1px_2px_rgba(16,24,40,0.05),inset_0_-1px_0_rgba(0,0,0,0.08)] hover:bg-primary/90 hover:shadow-[0_2px_6px_rgba(94,92,230,0.25)] disabled:bg-[#d1d1d6] disabled:shadow-none disabled:cursor-not-allowed transition-all duration-150 inline-flex items-center justify-center gap-2"
              >
                {ssoBusy ? (
                  <>
                    <span class="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Redirecting…
                  </>
                ) : (
                  <>Sign in with Truv</>
                )}
              </button>

              <button
                type="button"
                onClick={() => { setError(null); setMode('paste'); }}
                class="w-full py-2 text-[13px] font-medium text-[#6e6e73] hover:text-[#171717] transition-colors"
              >
                Use a key instead
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} class="space-y-3.5">
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
                <div class="text-[13px] text-[#b42318] bg-[#fef3f2] border border-[#fda29b]/60 rounded-[10px] px-3 py-2 animate-fadeIn">
                  {error}
                </div>
              )}

              <div class="pt-1.5 space-y-2.5">
                <button
                  type="submit"
                  disabled={busy || !clientId || !secret}
                  class="w-full py-2.5 text-[14px] font-medium text-white bg-primary rounded-[10px] shadow-[0_1px_2px_rgba(16,24,40,0.05),inset_0_-1px_0_rgba(0,0,0,0.08)] hover:bg-primary/90 hover:shadow-[0_2px_6px_rgba(94,92,230,0.25)] disabled:bg-[#d1d1d6] disabled:shadow-none disabled:cursor-not-allowed transition-all duration-150"
                >
                  {busy ? (
                    <span class="inline-flex items-center gap-2">
                      <span class="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Validating
                    </span>
                  ) : 'Start demo'}
                </button>

                <a
                  href="https://dashboard.truv.com/app/development/keys"
                  target="_blank"
                  rel="noreferrer"
                  class="w-full py-2.5 text-[14px] font-medium text-[#171717] bg-white border border-[#e8e8ed] rounded-[10px] hover:bg-[#f5f5f7] hover:border-[#d1d1d6] transition-colors flex items-center justify-center gap-1.5"
                >
                  Sign up to get API keys
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>

                {ssoConfigured && (
                  <button
                    type="button"
                    onClick={() => { setError(null); setMode('sso'); }}
                    class="w-full py-2 text-[13px] font-medium text-[#6e6e73] hover:text-[#171717] transition-colors"
                  >
                    Back to Sign in with Truv
                  </button>
                )}
              </div>
            </form>
          )}
        </div>

        {/* Trust footer below the card */}
        <div class="flex items-center justify-center gap-1.5 mt-5 text-[12px] text-[#8E8E93] whitespace-nowrap">
          <Icons.shieldCheck size={12} />
          <span>Kept in memory for this session. Never saved or logged.</span>
        </div>
      </div>
    </div>
  );
}
