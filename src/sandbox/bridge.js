/**
 * FILE SUMMARY: Opens Truv Bridge as a dialog over this page, with two helpers drawn inside it: a way
 * out (Bridge's own dialog has no close control on some accounts) and the login to type.
 *
 * Bridge's dialog is a native modal, so the page behind it cannot be clicked. Anything the person
 * needs while it is open has to live inside the dialog element, which is what this does.
 */

// Returns { close } or null if the Bridge script did not load.
//   credentials  { login, password, where, then }   shown in a pill at the top; `then` lists what to type on later screens
//   onEvent(type, payload, source)           every Bridge event
//   onCompleted()                            the order reached its final state
//   onLeave()                                the person pressed Back or Escape, or Bridge closed unfinished
export function openBridge({ token, credentials, onEvent, onLoad, onCompleted, onLeave }) {
  if (!window.TruvBridge) return null;
  let finished = false;
  const bridge = window.TruvBridge.init({
    bridgeToken: token,
    isOrder: true,
    onLoad: () => onLoad?.(),
    onEvent: (type, payload, source) => {
      onEvent?.(type, payload, source);
      if (type === 'COMPLETED' && source === 'order') { finished = true; onCompleted?.(); }
    },
    onSuccess: () => {},
    onClose: () => { if (!finished) onLeave?.(); },
  });
  bridge.open();

  const dialog = document.querySelector('dialog.truv-dialog-root-element');
  const bar = document.createElement('div');
  let stop = () => {};
  const cleanup = [];
  if (dialog) {
    bar.className = 'sbx-bridgebar';
    bar.style.cssText = 'position:fixed;z-index:2;display:flex;gap:8px;align-items:center;font-family:inherit;font-size:13px;line-height:1.2';
    const back = document.createElement('button');
    back.type = 'button';
    back.setAttribute('data-bridge-back', '');
    back.textContent = '← Back without finishing';
    back.style.cssText = 'border:0;border-radius:999px;background:#fff;color:#1b1c1f;padding:6px 14px;font:inherit;font-weight:500;white-space:nowrap;cursor:pointer;box-shadow:0 1px 6px rgba(0,0,0,.25)';
    back.addEventListener('click', () => onLeave?.());
    bar.append(back);
    if (credentials) {
      const pill = document.createElement('span');
      pill.setAttribute('data-bridge-login', '');
      pill.style.cssText = 'border-radius:999px;background:#1b1c1f;color:#fff;padding:6px 14px;white-space:nowrap;box-shadow:0 1px 6px rgba(0,0,0,.25)';
      pill.textContent = `${credentials.where ? `${credentials.where}: ` : ''}${credentials.login} / ${credentials.password || '(any password)'}${credentials.then?.length ? `, then ${credentials.then.join(', then ')}` : ''}`;
      bar.append(pill);
    }
    dialog.appendChild(bar);
    const onCancel = (e) => { e.preventDefault(); onLeave?.(); };
    dialog.addEventListener('cancel', onCancel);
    cleanup.push(() => dialog.removeEventListener('cancel', onCancel));

    // Keep the bar out of Bridge's way: in the free space above the card if there is room, else
    // in the corner, and on a phone, where the card fills the screen, as small as it can be.
    const place = () => {
      const frame = dialog.querySelector('iframe');
      if (!frame) return;
      const card = frame.getBoundingClientRect();
      const phone = window.matchMedia('(max-width: 600px)').matches;
      bar.style.flexWrap = 'wrap';
      bar.style.maxWidth = `${Math.max(240, window.innerWidth - 24)}px`;
      bar.style.fontSize = phone ? '12px' : '13px';
      const { width, height } = bar.getBoundingClientRect();
      if (card.top >= height + 24) {
        bar.style.top = `${(card.top - height) / 2}px`;
        bar.style.left = `${Math.max(12, card.left + (card.width - width) / 2)}px`;
      } else if (card.left >= width + 24) {
        bar.style.top = '12px'; bar.style.left = '12px';
      } else {
        bar.style.top = '6px';
        bar.style.left = `${Math.max(6, card.left + (card.width - width) / 2)}px`;
      }
    };
    place();
    const frame = dialog.querySelector('iframe');
    const watcher = frame && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    watcher?.observe(frame);
    window.addEventListener('resize', place);
    stop = () => { watcher?.disconnect(); window.removeEventListener('resize', place); };
  }

  return {
    close() {
      finished = true;
      stop();
      cleanup.forEach(fn => fn());
      bar.remove();
      try { bridge.close(); } catch { /* already closed */ }
    },
  };
}
