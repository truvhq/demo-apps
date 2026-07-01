import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock direct imports used by useOrderRestore (avoids window.location in hooks.js)
vi.mock('../../src/components/hooks.js', () => ({
  API_BASE: 'http://localhost:3000',
}));

import { fetchOrderRestoreInfo, restoreOrderSession } from '../../src/components/useOrderRestore.js';

// Helper: build a mock fetch Response-like object for GET /api/orders/:id/info
function mockInfoResponse({ ok = true, status = 200, body = {} } = {}) {
  return { ok, status, json: async () => body };
}

// ---------------------------------------------------------------------------
// fetchOrderRestoreInfo: normalizes GET /api/orders/:id/info into { userId, products }
// ---------------------------------------------------------------------------
describe('fetchOrderRestoreInfo', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches order info and returns userId + products', async () => {
    fetch.mockResolvedValue(mockInfoResponse({
      body: { order_id: 'ord-1', user_id: 'user-1', product_type: 'income' },
    }));

    const restored = await fetchOrderRestoreInfo('ord-1');

    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/orders/ord-1/info');
    expect(restored).toEqual({ userId: 'user-1', products: ['income'] });
  });

  it('splits comma-joined product_type (orders created with a products array)', async () => {
    fetch.mockResolvedValue(mockInfoResponse({
      body: { order_id: 'ord-2', user_id: 'user-2', product_type: 'income,assets' },
    }));

    const restored = await fetchOrderRestoreInfo('ord-2');

    expect(restored).toEqual({ userId: 'user-2', products: ['income', 'assets'] });
  });

  it('returns empty products when product_type is missing', async () => {
    fetch.mockResolvedValue(mockInfoResponse({
      body: { order_id: 'ord-3', user_id: 'user-3', product_type: null },
    }));

    const restored = await fetchOrderRestoreInfo('ord-3');

    expect(restored).toEqual({ userId: 'user-3', products: [] });
  });

  it('returns null when the order is not found (404)', async () => {
    fetch.mockResolvedValue(mockInfoResponse({
      ok: false, status: 404, body: { error: 'Order not found' },
    }));

    expect(await fetchOrderRestoreInfo('missing')).toBeNull();
  });

  it('returns null when the order has no user_id yet', async () => {
    fetch.mockResolvedValue(mockInfoResponse({
      body: { order_id: 'ord-4', user_id: null, product_type: 'income' },
    }));

    expect(await fetchOrderRestoreInfo('ord-4')).toBeNull();
  });

  it('URL-encodes the orderId', async () => {
    fetch.mockResolvedValue(mockInfoResponse({
      body: { user_id: 'user-5', product_type: 'income' },
    }));

    await fetchOrderRestoreInfo('ord 5/x');

    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/orders/ord%205%2Fx/info');
  });
});

// ---------------------------------------------------------------------------
// restoreOrderSession: the results-screen re-entry behavior (IMP-181).
// Mounting a results screen with an orderId and no userId must restore the
// user from the backend and restart polling so reports can fetch again.
// ---------------------------------------------------------------------------
describe('restoreOrderSession', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('restores userId + products via onRestore, then starts polling for that user', async () => {
    fetch.mockResolvedValue(mockInfoResponse({
      body: { order_id: 'ord-1', user_id: 'user-1', product_type: 'income,assets' },
    }));

    const onRestore = vi.fn();
    const startPolling = vi.fn();
    const restored = await restoreOrderSession({ orderId: 'ord-1', startPolling, onRestore });

    expect(restored).toEqual({ userId: 'user-1', products: ['income', 'assets'] });
    expect(onRestore).toHaveBeenCalledWith({ userId: 'user-1', products: ['income', 'assets'] });
    expect(startPolling).toHaveBeenCalledWith('user-1');
    // onRestore runs before startPolling so state is in place when webhooks arrive
    expect(onRestore.mock.invocationCallOrder[0]).toBeLessThan(startPolling.mock.invocationCallOrder[0]);
  });

  it('does nothing when the order lookup fails', async () => {
    fetch.mockResolvedValue(mockInfoResponse({
      ok: false, status: 404, body: { error: 'Order not found' },
    }));

    const onRestore = vi.fn();
    const startPolling = vi.fn();
    const restored = await restoreOrderSession({ orderId: 'missing', startPolling, onRestore });

    expect(restored).toBeNull();
    expect(onRestore).not.toHaveBeenCalled();
    expect(startPolling).not.toHaveBeenCalled();
  });

  it('does nothing when cancelled before the fetch resolves (unmount)', async () => {
    fetch.mockResolvedValue(mockInfoResponse({
      body: { user_id: 'user-1', product_type: 'income' },
    }));

    const onRestore = vi.fn();
    const startPolling = vi.fn();
    const restored = await restoreOrderSession({
      orderId: 'ord-1',
      startPolling,
      onRestore,
      isCancelled: () => true,
    });

    expect(restored).toBeNull();
    expect(onRestore).not.toHaveBeenCalled();
    expect(startPolling).not.toHaveBeenCalled();
  });

  it('swallows network errors and returns null', async () => {
    fetch.mockRejectedValue(new Error('network down'));

    const onRestore = vi.fn();
    const startPolling = vi.fn();
    const restored = await restoreOrderSession({ orderId: 'ord-1', startPolling, onRestore });

    expect(restored).toBeNull();
    expect(onRestore).not.toHaveBeenCalled();
    expect(startPolling).not.toHaveBeenCalled();
  });
});
