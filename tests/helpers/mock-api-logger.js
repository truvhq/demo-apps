import { vi } from 'vitest';

/**
 * Creates a mock apiLogger that records all calls for assertion.
 *
 * Usage:
 *   const apiLogger = createMockApiLogger();
 *   // ... pass to route factory ...
 *   expect(apiLogger.logApiCall).toHaveBeenCalledWith(expect.objectContaining({
 *     method: 'POST',
 *     endpoint: '/v1/users/',
 *   }));
 *
 * Access recorded calls via the standard vi.fn() API:
 *   apiLogger.logApiCall.mock.calls    // array of argument arrays
 *   apiLogger.pushWebhookEvent.mock.calls
 */
export function createMockApiLogger() {
  return {
    logApiCall: vi.fn(),
    pushWebhookEvent: vi.fn(),
  };
}
