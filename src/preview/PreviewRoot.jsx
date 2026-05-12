/**
 * FILE SUMMARY: PreviewRoot — entry component for the iframe-side preview app.
 *
 * Listens for `preview:render` postMessages from the host, dispatches to the named
 * component, and signals `preview:ready` once mounted so the host can flush queued
 * commands. Components inside emit user/SDK events back via the protocol helpers.
 */

import { useState, useEffect } from 'preact/hooks';
import { MSG, postReady } from './protocol.js';
import { LoadingPreview } from './components/LoadingPreview.jsx';
import { ApplicationFormPreview } from './components/ApplicationFormPreview.jsx';
import { MethodPickerPreview } from './components/MethodPickerPreview.jsx';
import { BridgePreview } from './components/BridgePreview.jsx';

export function PreviewRoot() {
  // The base view is whatever non-bridge component was last requested. The
  // bridge layer overlays on top via the SDK's own modal, so we keep the base
  // mounted (it stays visible behind the modal's backdrop). Switching to a
  // non-bridge component clears any active bridge layer.
  const [baseView, setBaseView] = useState(null);
  const [bridgeProps, setBridgeProps] = useState(null);

  useEffect(() => {
    function onMessage(e) {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type !== MSG.RENDER) return;
      const { component, props } = e.data;
      if (component === 'bridge') {
        setBridgeProps(props || {});
      } else {
        setBaseView({ component, props: props || {} });
        setBridgeProps(null);
      }
    }
    window.addEventListener('message', onMessage);
    postReady();
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <>
      {baseView ? renderBase(baseView) : <LoadingPreview label="Loading…" />}
      {bridgeProps && <BridgePreview {...bridgeProps} />}
    </>
  );
}

function renderBase(view) {
  switch (view.component) {
    case 'application-form':
      return wrap(<ApplicationFormPreview {...view.props} />);
    case 'method-picker':
      return wrap(<MethodPickerPreview {...view.props} />);
    case 'loading':
      return <LoadingPreview {...view.props} />;
    default:
      return (
        <div class="p-6 text-sm text-red-500">
          Unknown preview component: {view.component}
        </div>
      );
  }
}

// Centered max-width column for form/picker/loading views. On a narrow mobile
// iframe the max-width has no effect (viewport is already smaller); on a wide
// desktop iframe it keeps content from stretching across the full width.
function wrap(node) {
  return (
    <div class="min-h-full w-full overflow-y-auto">
      <div class="max-w-lg mx-auto px-6 py-8">{node}</div>
    </div>
  );
}
