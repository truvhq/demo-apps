/**
 * FILE SUMMARY: BYO API credentials entry screen, Public Sector (Truv by Checkr) version.
 * Shown instead of ConfigureScreen when the visitor opens a #public-sector link while signed out.
 * The form, SSO and error handling match ConfigureScreen; only the look and the proof panel differ.
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
import { BrandLogo } from './BrandLogo.jsx';
import { DotField } from './DotField.jsx';
import { PhosphorIcons as Icons } from './PhosphorIcons.jsx';
import { signIn, isSsoConfigured } from '../auth/auth0Client.js';
import { DASHBOARD_KEYS_URL } from '../config.js';

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
      <span class="block text-[13px] font-medium text-[#000000] mb-1.5 tracking-[-0.005em]">{label}</span>
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
          class="w-full px-3.5 py-2.5 pr-11 text-[14px] border border-[#d2d2d7] rounded-[10px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)] placeholder:text-[#c7c7cc] focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/12 hover:border-[#d1d1d6] transition-all font-mono disabled:bg-[#fafafa] disabled:cursor-not-allowed"
          placeholder={placeholder}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={() => setRevealed(r => !r)}
          aria-label={revealed ? `Hide ${label}` : `Show ${label}`}
          tabIndex={-1}
          class="absolute inset-y-0 right-0 px-3 flex items-center text-[#808080] hover:text-[#000000] transition-colors"
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
  sso_callback_failed: 'Sign-in did not complete. Try again or use a key instead.',
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
      <div class="flex items-center justify-center w-11 h-11 rounded-full bg-[#fffbeb] mx-auto">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b45309" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        </svg>
      </div>
      <div>
        <h2 class="text-[16px] font-semibold tracking-[-0.015em] text-[#000000]">You don't have any API keys yet</h2>
        <p class="text-[13px] text-[#808080] leading-[1.55] mt-1">
          Create one in the Truv dashboard to start running the demos with your account.
        </p>
      </div>
      <div class="space-y-2.5">
        <a
          href={dashboardUrl || DASHBOARD_KEYS_URL}
          target="_blank"
          rel="noreferrer"
          class="block w-full py-2.5 text-[14px] font-medium text-white bg-primary rounded-lg hover:bg-primary-hover active:bg-primary-active transition-colors"
        >
          Create your first API key
        </a>
        <button
          type="button"
          onClick={onPasteInstead}
          class="block w-full py-2 text-[13px] font-medium text-[#808080] hover:text-[#000000] transition-colors"
        >
          Or paste a key now
        </button>
      </div>
    </div>
  );
}

export function PublicSectorSignIn({ onSubmit, ssoError }) {
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

  // Any other SSO error gets surfaced as a banner above the buttons.
  const ssoBannerError = ssoError && ssoError.error !== 'no_keys_available'
    ? describeError(ssoError.status, ssoError.error, ssoError.retryAfter)
    : null;

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
    <div class="ck-theme ck-signin min-h-screen relative grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] bg-white">
      {/* Soft background ambience: pastel radial blooms drifting behind the card. */}
      <div aria-hidden="true" class="pointer-events-none absolute inset-0">
        <div class="config-bloom-a absolute -top-32 left-1/2 w-[640px] h-[640px] rounded-full bg-[radial-gradient(circle_at_center,rgba(94,92,230,0.13),transparent_60%)]" />
        <div class="config-bloom-b absolute -bottom-40 left-[60%] w-[520px] h-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(10,132,255,0.10),transparent_60%)]" />
      </div>

      {/* Contact sales CTA — always reachable from the entry screen. */}
      <a
        href="https://truv.com/contact-sales"
        target="_blank"
        rel="noreferrer"
        class="absolute top-5 right-6 z-10 text-[13px] font-medium text-[#1b1c1f] bg-white border border-[#d8dee5] rounded-[6px] px-3.5 py-1.5 hover:bg-[#23deff] hover:border-[#23deff] transition-colors duration-[400ms]"
      >
        Contact sales
      </a>

      {/* Left: sign-in */}
      <div class="relative flex items-center justify-center px-6 py-16">
      <div class="relative w-full max-w-[420px] animate-slideUp">
        <div class="gradient-ring relative bg-white border border-[#e8e8ed]/80 rounded-[20px] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_40px_rgba(16,24,40,0.10)] px-8 py-9">
          {/* Header */}
          <div class="flex flex-col items-center gap-3 mb-6">
            <BrandLogo height={44} />
            <h1 class="text-[22px] font-semibold tracking-[-0.025em] text-[#000000]">Personalize your demo</h1>
            <p class="text-[13px] text-[#808080] text-center leading-[1.55] max-w-[340px]">
              Add your Truv keys to run the demos on your own account. Real users, real API calls, live reports in your dashboard.
            </p>
          </div>

          {noKeysState ? (
            <NoKeysState dashboardUrl={noKeysState.dashboard_url} onPasteInstead={() => setMode('paste')} />
          ) : mode === 'sso' ? (
            <div class="space-y-3">
              {(error || ssoBannerError) && (
                <div class="text-[13px] text-[#b42318] bg-[#fef3f2] border border-[#fda29b]/60 rounded-[10px] px-3 py-2 animate-fadeIn">
                  {error || ssoBannerError}
                </div>
              )}

              <button
                type="button"
                onClick={handleSsoClick}
                disabled={ssoBusy}
                class="w-full py-2.5 text-[14px] font-medium text-white bg-primary rounded-lg shadow-[0_1px_2px_rgba(16,24,40,0.05),inset_0_-1px_0_rgba(0,0,0,0.08)] hover:bg-primary-hover active:bg-primary-active hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(27,28,31,0.15)] active:translate-y-0 disabled:bg-[#d1d1d6] disabled:shadow-none disabled:translate-y-0 disabled:cursor-not-allowed transition-all duration-150 inline-flex items-center justify-center gap-2"
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
                class="w-full py-2 text-[13px] font-medium text-[#808080] hover:text-[#000000] transition-colors"
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
                  class="w-full py-2.5 text-[14px] font-medium text-white bg-primary rounded-lg shadow-[0_1px_2px_rgba(16,24,40,0.05),inset_0_-1px_0_rgba(0,0,0,0.08)] hover:bg-primary-hover active:bg-primary-active hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(27,28,31,0.15)] active:translate-y-0 disabled:bg-[#d1d1d6] disabled:shadow-none disabled:translate-y-0 disabled:cursor-not-allowed transition-all duration-150"
                >
                  {busy ? (
                    <span class="inline-flex items-center gap-2">
                      <span class="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Validating
                    </span>
                  ) : 'Start demo'}
                </button>

                <a
                  href={DASHBOARD_KEYS_URL}
                  target="_blank"
                  rel="noreferrer"
                  class="w-full py-2.5 text-[14px] font-medium text-[#000000] bg-white border border-[#e8e8ed] rounded-lg hover:border-[#c0c0c5] active:bg-[#e8e8ed] transition-colors flex items-center justify-center gap-1.5"
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
                    class="w-full py-2 text-[13px] font-medium text-[#808080] hover:text-[#000000] transition-colors"
                  >
                    Back to Sign in with Truv
                  </button>
                )}
              </div>
            </form>
          )}
        </div>

        {/* Trust footer below the card */}
        <div class="flex items-center justify-center gap-1.5 mt-5 text-[13px] text-[#808080] whitespace-nowrap">
          <Icons.shieldCheck size={12} />
          <span>Kept in memory for this session. Never saved or logged.</span>
        </div>

        {/* What you'll verify — a quiet preview of what the demos surface. */}
        <div class="flex items-center justify-center gap-2 mt-4">
          {[
            { label: 'Income', dot: '#23DEFF' },
            { label: 'Employment', dot: '#1B1C1F' },
            { label: 'Assets', dot: '#7A828C' },
          ].map((chip, i) => (
            <span
              key={chip.label}
              class={`animate-chipIn delay-${i + 1} inline-flex items-center gap-1.5 rounded-full bg-white/70 border border-[#e8e8ed] px-2.5 py-1 text-[11px] font-medium text-[#808080] backdrop-blur-sm`}
            >
              <span class="w-1.5 h-1.5 rounded-full" style={{ background: chip.dot }} />
              {chip.label}
            </span>
          ))}
        </div>
      </div>
      </div>

      {/* Right: product and proof panel (wide screens only) */}
      <ProofPanel />
    </div>
  );
}

// Proof panel beside the sign-in card. Quotes, names, titles and agency logos
// are taken verbatim from truv.com/public-sector (approved by Marketing as the
// source). Product screens are real captures of these demos.
const QUOTES = [
  {
    quote: 'During a 3-month side-by-side evaluation of Truv against our instant database solution, Truv not only matched the data quality of the database but outperformed it with data on gig economy workers—solving a critical gap in our verifications.',
    name: 'Jake Parlett', title: 'Systems Manager, Utah DWS', photo: '/brand/people/jake-parlett.png',
  },
  {
    quote: "In our partnership with Truv, we've seen a significant financial impact on the verification with Truv. It is a significant decrease in cost per hit.",
    name: 'Wesley Merritt', title: 'Assistant Deputy Commissioner of Quality & Vendor Relations, GA DHS', photo: '/brand/people/wesley-merritt.png',
  },
];
const AGENCY_LOGOS = [
  { src: '/brand/logos/CA-Department.png', alt: 'California Department of Social Services' },
  { src: '/brand/logos/Oklahoma-DHS-logo.png', alt: 'Oklahoma DHS' },
  { src: '/brand/logos/Washington-DSHS.png', alt: 'Washington DSHS' },
  { src: '/brand/logos/UT-DWS.png', alt: 'Utah Department of Workforce Services' },
];

function ProofPanel() {
  return (
    <aside class="ck-proof relative hidden lg:flex flex-col justify-center overflow-hidden px-14 py-12">
      <DotField class="absolute inset-0" />
      <div class="ck-proof-content relative z-10 max-w-[620px] w-full mx-auto">
        <div class="text-[11px] font-bold uppercase tracking-[0.16em] text-[#474c52] mb-4">Truv by Checkr · Public Sector</div>
        <h2 class="ck-proof-title text-[36px] mb-3">Income and employment verification, straight from the source</h2>
        <p class="text-[15px] leading-[1.5] text-[#474c52] mb-7 max-w-[52ch]">
          Applicants connect their payroll provider, and agencies receive income and employment data directly - no re-keying documents.
        </p>

        <div class="ck-proof-shots relative h-[250px] mb-7">
          <img src="/brand/screens/caseworker-applicants.png" alt="Case Worker Portal: applicants and verification status"
               class="absolute left-0 top-8 w-[76%] rounded-[8px] border border-[#d8dee5] bg-white shadow-[0_24px_48px_-28px_rgba(27,28,31,0.45)]" />
          <img src="/brand/screens/phone-application.png" alt="Applicant verification form on a phone"
               class="absolute right-2 top-0 h-[250px] w-auto drop-shadow-[0_20px_32px_rgba(27,28,31,0.35)]" />
        </div>

        <div class="grid grid-cols-2 gap-4 mb-7">
          {QUOTES.map(q => (
            <figure key={q.name} class="rounded-[8px] border border-[#d8dee5] bg-white/90 backdrop-blur-sm p-4">
              <blockquote class="text-[13px] leading-[1.45] text-[#1b1c1f]">“{q.quote}”</blockquote>
              <figcaption class="mt-3 flex items-center gap-2.5">
                <img src={q.photo} alt="" class="w-8 h-8 rounded-full object-cover object-top bg-[#f0f2f5]" />
                <span class="text-[12px] leading-[1.3]">
                  <span class="block font-medium text-[#1b1c1f]">{q.name}</span>
                  <span class="block text-[#474c52]">{q.title}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>

        <div class="text-[11px] font-bold uppercase tracking-[0.16em] text-[#7a828c] mb-3">Trusted by state agencies</div>
        <div class="flex items-center gap-8">
          {AGENCY_LOGOS.map(l => (
            <img key={l.src} src={l.src} alt={l.alt} class="h-9 w-auto object-contain" />
          ))}
        </div>
      </div>
    </aside>
  );
}