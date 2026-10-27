/**
 * FILE SUMMARY: Small pieces the sandbox tool's screens share: copy buttons, chips, form fields,
 * dialogs, toasts. Styled by sandbox.css (everything is under `.sbx`).
 */
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { STATUSES, statusName } from './model.js';

// --- Copy ---

// How to scroll something into view: smoothly, unless the person asked for less motion.
export const scrollBehavior = () => (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

// Say something to screen readers without showing it. One shared region, kept inside the open dialog if
// there is one, because a modal dialog hides the rest of the page from them.
let announcer = null;
export function announce(text) {
  if (typeof document === 'undefined') return;
  const host = document.querySelector('dialog[open]') || document.body;
  if (!announcer) {
    announcer = document.createElement('div');
    announcer.setAttribute('role', 'status');
    announcer.setAttribute('aria-live', 'polite');
    announcer.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
  }
  if (announcer.parentNode !== host) host.appendChild(announcer);
  announcer.textContent = '';
  setTimeout(() => { announcer.textContent = text; }, 40);
}

export function CopyButton({ text, label = 'Copy', what = '', class: cls = '' }) {
  const [state, setState] = useState('idle');
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy(e) {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(text); setState('done'); announce('Copied'); } catch { setState('failed'); announce('Could not copy'); }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 1500);
  }
  return (
    <button type="button" class={`sbx-copy ${cls}`} onClick={copy} aria-label={`${label}${what ? ` ${what}` : ''}`} data-state={state}>
      {state === 'done' ? 'Copied' : state === 'failed' ? 'Could not copy' : label}
    </button>
  );
}

// A value you will want to paste: the whole chip is the button.
export function Copyable({ value, what, display }) {
  const [state, setState] = useState('idle');
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setState('done'); announce('Copied'); } catch { setState('failed'); announce('Could not copy'); }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 1500);
  }
  return (
    <button type="button" class="sbx-chipcopy" onClick={copy} aria-label={`${display ?? value} (copy ${what || 'value'})`} data-state={state} title={state === 'done' ? 'Copied' : state === 'failed' ? 'Could not copy' : 'Copy'}>
      <code>{display ?? value}</code>
      <svg class="sbx-chipcopy-ic" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        {state === 'done'
          ? <path d="M3 8.5l3.2 3.2L13 4.8" />
          : state === 'failed'
            ? <path d="M4 4l8 8M12 4l-8 8" />
            : <><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 5.5v-2a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3.5V9A1.5 1.5 0 0 0 4 10.5h1.5" /></>}
      </svg>
    </button>
  );
}

// --- Chips ---

export function Chip({ tone = 'plain', children, title }) {
  return <span class={`sbx-chip sbx-chip-${tone}`} title={title}>{children}</span>;
}

const STATUS_TONE = { done: 'good', no_data: 'warn', mfa: 'warn', parse: 'plain', full_parse: 'plain', login: 'plain', new: 'plain' };
export function StatusChip({ status }) {
  if (!status) return null;
  const known = STATUSES.find(s => s.value === status);
  const tone = STATUS_TONE[status] || (known ? 'bad' : 'plain');
  return <Chip tone={tone} title={known?.hint}>{statusName(status)}</Chip>;
}

// --- Form fields ---

let fieldSeq = 0;
export function Field({ label, hint, error, warn, children, wide, optional }) {
  const [id] = useState(() => `sbx-f${++fieldSeq}`);
  const describedBy = [hint ? `${id}-h` : '', error ? `${id}-e` : '', warn ? `${id}-w` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div class={`sbx-field${wide ? ' sbx-wide' : ''}${error ? ' has-error' : ''}`}>
      <label for={id}>{label}{optional && <span class="sbx-opt"> optional</span>}</label>
      {typeof children === 'function' ? children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? 'true' : undefined }) : children}
      {hint && <p class="sbx-hint" id={`${id}-h`}>{hint}</p>}
      {error && <p class="sbx-error" id={`${id}-e`}>{error}</p>}
      {!error && warn && <p class="sbx-warn" id={`${id}-w`}>{warn}</p>}
    </div>
  );
}

// --- Dialogs ---

export function Dialog({ open, onClose, title, children, wide, labelledBy = 'sbx-dlg-title', footer }) {
  const ref = useRef(null);
  const bodyRef = useRef(null);
  const pressedBackdrop = useRef(false);
  const latest = useRef({});
  latest.current = { open, onClose };
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // Land on the control meant to be first, not the close button.
      d.querySelector('[data-autofocus]')?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    const onCancel = (e) => { e.preventDefault(); latest.current.onClose?.(); };
    // Chrome closes a dialog whose Escape was cancelled a few times over. If that happens while the page still
    // thinks it is open, either let the page close it, or open it again when it must stay (work in progress).
    const onClosed = () => {
      if (!latest.current.open) return;
      if (latest.current.onClose) latest.current.onClose();
      else d.showModal();
    };
    // A control that disappears (a button that was pressed) leaves focus on the page behind: bring it back.
    const onFocusOut = () => setTimeout(() => {
      // Only when focus has truly fallen to the page; it may have gone to another dialog, such as Bridge's.
      if (d.open && (document.activeElement === document.body || !document.activeElement)) (d.querySelector('[data-autofocus]') || bodyRef.current)?.focus();
    }, 0);
    d?.addEventListener('cancel', onCancel);
    d?.addEventListener('close', onClosed);
    d?.addEventListener('focusout', onFocusOut);
    return () => { d?.removeEventListener('cancel', onCancel); d?.removeEventListener('close', onClosed); d?.removeEventListener('focusout', onFocusOut); };
  }, []);
  return (
    <dialog ref={ref} class={`sbx-dialog${wide ? ' sbx-dialog-wide' : ''}`} aria-labelledby={labelledBy} onMouseDown={(e) => { pressedBackdrop.current = e.target === ref.current; }} onClick={(e) => { if (e.target === ref.current && pressedBackdrop.current) onClose?.(); pressedBackdrop.current = false; }}>
      {open && (
        <div class="sbx-dialog-body" ref={bodyRef} tabIndex={-1}>
          <header>
            <h2 id={labelledBy}>{title}</h2>
            <button type="button" class="sbx-x" onClick={onClose} aria-label="Close">&times;</button>
          </header>
          <div class="sbx-dialog-content">{children}</div>
          {footer && <footer>{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({ open, title, children, confirmLabel = 'Confirm', danger, focusCancel, busy, onConfirm, onCancel }) {
  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onCancel}
      title={title}
      labelledBy="sbx-confirm-title"
      footer={(
        <>
          <button type="button" class="sbx-btn ghost" onClick={onCancel} disabled={busy} data-autofocus={danger || focusCancel ? '' : undefined}>Cancel</button>
          <button type="button" class={`sbx-btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm} disabled={busy} data-autofocus={danger || focusCancel ? undefined : ''}>{busy ? 'Working...' : confirmLabel}</button>
        </>
      )}
    >
      {children}
    </Dialog>
  );
}

// --- Toasts ---

export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);
  const timers = useRef(new Map());     // id -> timer
  const lengths = useRef(new Map());    // id -> how long it stays once nothing is holding it
  const dismiss = useCallback((id) => { clearTimeout(timers.current.get(id)); timers.current.delete(id); lengths.current.delete(id); setToasts(t => t.filter(x => x.id !== id)); }, []);
  const arm = useCallback((id, ms) => { clearTimeout(timers.current.get(id)); if (ms) timers.current.set(id, setTimeout(() => dismiss(id), ms)); }, [dismiss]);
  // A toast with an action waits longer, and none leaves while the pointer or keyboard focus is on them.
  const push = useCallback((message, { action, tone = 'plain', ms } = {}) => {
    const id = ++seq.current;
    const stay = ms === undefined ? (action ? 15000 : 8000) : ms;
    lengths.current.set(id, stay);
    setToasts(t => [...t.slice(-3), { id, message, action, tone }]);
    arm(id, stay);
    return id;
  }, [arm]);
  const pause = useCallback(() => { for (const t of timers.current.values()) clearTimeout(t); timers.current.clear(); }, []);
  const resume = useCallback(() => { for (const [id, ms] of lengths.current) arm(id, Math.min(ms, 6000) || 0); }, [arm]);
  return { toasts, push, dismiss, pause, resume };
}

export function ToastRegion({ toasts, dismiss, pause, resume }) {
  return (
    <div class="sbx-toasts" role="region" aria-label="Notifications" aria-live="polite" onMouseEnter={pause} onMouseLeave={resume} onFocusIn={pause} onFocusOut={resume}>
      {toasts.map(t => (
        <div key={t.id} class={`sbx-toast sbx-toast-${t.tone}`}>
          <span>{t.message}</span>
          {t.action && <button type="button" class="sbx-toast-action" onClick={() => { t.action.run(); dismiss(t.id); }}>{t.action.label}</button>}
          <button type="button" class="sbx-x" onClick={() => dismiss(t.id)} aria-label="Dismiss">&times;</button>
        </div>
      ))}
    </div>
  );
}

// --- Misc ---

export function Spinner({ label }) {
  return <span class="sbx-spinner" role="status" aria-label={label || 'Working'} />;
}

export function Notice({ tone = 'info', title, children, action }) {
  return (
    <div class={`sbx-notice sbx-notice-${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>
      <div>
        {title && <strong>{title}</strong>}
        {children && <div class="sbx-notice-body">{children}</div>}
      </div>
      {action}
    </div>
  );
}

// Show a number of things: "1 scenario", "3 scenarios".
export const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || `${one}s`)}`;
