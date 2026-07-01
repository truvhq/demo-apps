import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock direct imports used by BridgeScreen (avoids window.location in hooks.js
// and the full App.jsx router/demo tree in a node environment)
vi.mock('../../src/App.jsx', () => ({
  navigate: vi.fn(),
}));
vi.mock('../../src/components/hooks.js', () => ({
  API_BASE: 'http://localhost:3000',
}));

import { createBridgeCallbacks } from '../../src/components/screens/BridgeScreen.jsx';

// ---------------------------------------------------------------------------
// createBridgeCallbacks: close-race guards for the TruvBridge SDK (IMP-186).
// The SDK fires onClose for programmatic closes too, so onClose must not
// navigate after COMPLETED or during the unmount cleanup, and a genuine
// user close must route through onAbort.
// ---------------------------------------------------------------------------
describe('createBridgeCallbacks', () => {
  let addBridgeEvent;
  let navigateFn;

  const build = (overrides = {}) => createBridgeCallbacks({
    orderId: 'ord-1',
    demoPath: 'mortgage/pos-application',
    addBridgeEvent,
    navigateFn,
    ...overrides,
  });

  beforeEach(() => {
    addBridgeEvent = vi.fn();
    navigateFn = vi.fn();
  });

  // ---- COMPLETED flow -------------------------------------------------------

  it('navigates to the waiting screen and fires onCompleted on COMPLETED (order source)', () => {
    const onCompleted = vi.fn();
    const cb = build({ onCompleted });

    cb.onEvent('COMPLETED', { foo: 'bar' }, 'order');

    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(navigateFn).toHaveBeenCalledWith('mortgage/pos-application/waiting/ord-1');
    expect(cb.guards.completed).toBe(true);
  });

  it('ignores COMPLETED from non-order sources', () => {
    const cb = build();

    cb.onEvent('COMPLETED', null, 'bridge');

    expect(navigateFn).not.toHaveBeenCalled();
    expect(cb.guards.completed).toBe(false);
  });

  // ---- onClose after COMPLETED: must NOT navigate back (the race) ------------

  it('onClose after COMPLETED does not navigate back to the demo root', () => {
    const onAbort = vi.fn();
    const cb = build({ onAbort });

    cb.onEvent('COMPLETED', null, 'order');
    navigateFn.mockClear();

    // Unmount-triggered (or SDK-fired) close right after completion
    cb.onClose();

    expect(navigateFn).not.toHaveBeenCalled();
    expect(onAbort).not.toHaveBeenCalled();
    // The close event is still logged to the Panel sidebar
    expect(addBridgeEvent).toHaveBeenCalledWith('onClose()', null);
  });

  it('onClose during programmatic close (guards.closing) does nothing', () => {
    const onAbort = vi.fn();
    const cb = build({ onAbort });

    // Cleanup sets the flag before calling b.close()
    cb.guards.closing = true;
    cb.onClose();

    expect(navigateFn).not.toHaveBeenCalled();
    expect(onAbort).not.toHaveBeenCalled();
  });

  // ---- Genuine user close: onAbort fires ------------------------------------

  it('onAbort fires on a genuine user-initiated close (no navigate fallback)', () => {
    const onAbort = vi.fn();
    const cb = build({ onAbort });

    cb.onClose();

    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(navigateFn).not.toHaveBeenCalled();
  });

  it('falls back to navigating to the demo root when no onAbort is provided', () => {
    const cb = build();

    cb.onClose();

    expect(navigateFn).toHaveBeenCalledWith('mortgage/pos-application');
  });

  // ---- Event logging passthrough --------------------------------------------

  it('forwards onLoad/onSuccess/onEvent to addBridgeEvent', () => {
    const cb = build();

    cb.onLoad();
    cb.onSuccess();
    cb.onEvent('SCREEN_VIEW', { screen: 'LOGIN' }, 'bridge');

    expect(addBridgeEvent).toHaveBeenCalledWith('onLoad()', null);
    expect(addBridgeEvent).toHaveBeenCalledWith('onSuccess()', null);
    expect(addBridgeEvent).toHaveBeenCalledWith(
      'onEvent("SCREEN_VIEW", payload, "bridge")',
      [{ label: 'payload', value: { screen: 'LOGIN' } }],
    );
  });
});
