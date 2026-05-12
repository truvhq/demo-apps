import { vi } from 'vitest';

/**
 * Default response shape returned by every mock TruvClient method.
 * Override individual fields via the `overrides` parameter.
 */
const defaultResponse = () => ({
  statusCode: 200,
  data: {},
  durationMs: 10,
  requestBody: null,
});

/**
 * Creates a mock TruvClient with vi.fn() stubs for every method.
 *
 * Each method returns the default response by default.
 * Pass an overrides object to customize individual method responses:
 *
 *   const truv = createMockTruv({
 *     createUser: { data: { id: 'user-1' } },
 *   });
 *
 * You can also pass a function for dynamic behavior:
 *
 *   const truv = createMockTruv({
 *     getOrder: vi.fn().mockResolvedValue({ statusCode: 404, data: null }),
 *   });
 */
export function createMockTruv(overrides = {}) {
  const methodNames = [
    'createUser',
    'createUserBridgeToken',
    'searchCompanies',
    'searchProviders',
    'createOrder',
    'getOrder',
    'createVoieReport',
    'getVoieReport',
    'createAssetsReport',
    'getAssetsReport',
    'createIncomeInsightsReport',
    'getIncomeInsightsReport',
    'getDepositSwitchReport',
    'getAccessToken',
    'getLinkReport',
    'createDocumentCollection',
    'getDocumentCollection',
    'uploadToCollection',
    'finalizeCollection',
    'getLinkIncomeReport',
    'getFinalizationResults',
    'listWebhooks',
    'createWebhook',
    'deleteWebhook',
  ];

  const mock = {};

  for (const name of methodNames) {
    const override = overrides[name];

    if (typeof override === 'function') {
      // Allow passing a vi.fn() directly for full control
      mock[name] = override;
    } else if (override !== undefined) {
      // Merge override fields into the default response
      mock[name] = vi.fn().mockResolvedValue({
        ...defaultResponse(),
        ...override,
      });
    } else {
      mock[name] = vi.fn().mockResolvedValue(defaultResponse());
    }
  }

  return mock;
}
