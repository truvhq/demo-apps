import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

export interface TruvApiResponse<T = TruvData> {
  statusCode: number;
  data: T;
  durationMs: number;
  requestBody: unknown;
}

// Minimal union of all Truv API response fields used across the codebase
export interface TruvData {
  // User
  id?: string;
  external_user_id?: string;
  // Order
  user_id?: string;
  bridge_token?: string;
  share_url?: string;
  status?: string;
  // Access token / reports
  link_id?: string;
  report_id?: string;
  // Webhooks list
  results?: TruvWebhookItem[];
  // Company search wrapper
  data?: unknown[];
  // Document collection
  collection_id?: string;
  uploaded_files?: TruvUploadedFile[];
  // Raw fallback
  raw?: string;
}

export interface TruvWebhookItem {
  id: string;
  name: string;
  env_type: string;
}

export interface TruvUploadedFile {
  status: string;
  user_id?: string;
}

export class TruvClient {
  private clientId: string;
  private secret: string;
  private apiUrl: string;
  private headers: Record<string, string>;

  constructor({ clientId, secret, apiUrl = 'https://prod.truv.com/v1/' }: {
    clientId: string;
    secret: string;
    apiUrl?: string;
  }) {
    this.clientId = clientId;
    this.secret = secret;
    this.apiUrl = apiUrl;
    this.headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Access-Client-Id': clientId,
      'X-Access-Secret': secret,
    };
  }

  private async _request(method: string, endpoint: string, { json }: { json?: unknown } = {}): Promise<TruvApiResponse> {
    const url = this.apiUrl + endpoint;
    const start = performance.now();

    const opts: Parameters<typeof fetch>[1] = { method, headers: this.headers };
    if (json) opts.body = JSON.stringify(json);

    const response = await fetch(url, opts);
    const durationMs = Math.round((performance.now() - start) * 10) / 10;

    let data: TruvData;
    const text = await response.text();
    try {
      data = text ? (JSON.parse(text) as TruvData) : {};
    } catch {
      data = { raw: text };
    }

    console.log(`TRUV: ${method.toUpperCase()} ${url} — ${response.status} (${durationMs}ms)`);
    return { statusCode: response.status, data, durationMs, requestBody: json ?? null };
  }

  // --- Users API ---

  createUser(overrides: Record<string, unknown> = {}): Promise<TruvApiResponse> {
    const payload = {
      external_user_id: `qs-${uuidv4()}`, // Replace with your internal user/application ID
      first_name: 'John',
      last_name: 'Johnson',
      email: 'j.johnson@example.com',
      ...overrides,
    };
    return this._request('POST', 'users/', { json: payload });
  }

  createUserBridgeToken(userId: string, productType: string): Promise<TruvApiResponse> {
    const payload: Record<string, unknown> = {
      product_type: productType,
      client_name: 'Truv Quickstart',
      tracking_info: '1338-0111-A', // Replace with your internal reference (e.g. loan number)
    };

    // Sandbox test account for deposit_switch and pll products
    if (productType === 'deposit_switch' || productType === 'pll') {
      const account: Record<string, unknown> = {
        account_number: '16002600',   // Sandbox test value — replace with real account in production
        account_type: 'checking',
        routing_number: '12345678',   // Sandbox test value
        bank_name: 'Truv Bank',       // Sandbox test value
      };
      if (productType === 'pll') {
        account.deposit_type = 'amount';
        account.deposit_value = 100; // Numeric amount
      }
      payload.account = account;
    }

    return this._request('POST', `users/${userId}/tokens/`, { json: payload });
  }

  // --- Company Search ---

  searchCompanies(query: string, productType?: string): Promise<TruvApiResponse> {
    const params = new URLSearchParams({ query });
    if (productType) params.set('product_type', productType);
    return this._request('GET', `company-mappings-search/?${params}`);
  }

  // --- Orders API ---

  createOrder(params: Record<string, unknown> = {}): Promise<TruvApiResponse> {
    const productType = (params.product_type as string | undefined) || 'income';
    const payload: Record<string, unknown> = {
      order_number: `qs-${uuidv4()}`, // Replace with your internal order/application ID
      external_user_id: params.external_user_id || `qs-${uuidv4()}`,
      first_name: params.first_name || 'John',
      last_name: params.last_name || 'Johnson',
      products: params.products || [productType],
    };

    if (params.email) payload.email = params.email;
    if (params.phone) payload.phone = params.phone;
    if (params.ssn) payload.social_security_number = params.ssn;
    if (params.template_id) payload.template_id = params.template_id;

    // Employer — sandbox credentials: goodlogin/goodpassword
    // employers array only supported for non-assets products
    if (productType !== 'assets') {
      if (params.company_mapping_id) {
        payload.employers = [{ company_mapping_id: params.company_mapping_id }];
      } else if (params.employer) {
        payload.employers = [{ company_name: params.employer }];
      }
    }

    // Sandbox test account for deposit_switch and pll products
    const employers = payload.employers as Array<Record<string, unknown>> | undefined;
    if (['deposit_switch', 'pll'].includes(productType) && employers) {
      const account: Record<string, unknown> = {
        account_number: '16002600',   // Sandbox test value — replace with real account in production
        account_type: 'checking',
        routing_number: '12345678',   // Sandbox test value
        bank_name: 'Truv Bank',       // Sandbox test value
      };
      if (productType === 'pll') {
        account.deposit_type = 'amount';
        account.deposit_value = 100; // Numeric amount
      }
      employers[0] = { ...employers[0], account };
    }

    return this._request('POST', 'orders/', { json: payload });
  }

  getOrder(truvOrderId: string): Promise<TruvApiResponse> {
    return this._request('GET', `orders/${truvOrderId}/`);
  }

  refreshOrder(truvOrderId: string): Promise<TruvApiResponse> {
    return this._request('POST', `orders/${truvOrderId}/refresh/`);
  }

  // --- Webhooks API ---

  listWebhooks(): Promise<TruvApiResponse> {
    return this._request('GET', 'webhooks/');
  }

  createWebhook(params: Record<string, unknown>): Promise<TruvApiResponse> {
    return this._request('POST', 'webhooks/', { json: params });
  }

  deleteWebhook(webhookId: string): Promise<TruvApiResponse> {
    return this._request('DELETE', `webhooks/${webhookId}/`);
  }

  // --- Token Exchange & Reports ---

  getAccessToken(publicToken: string): Promise<TruvApiResponse> {
    return this._request('POST', 'link-access-tokens/', { json: { public_token: publicToken } });
  }

  getLinkReport(linkId: string, productType: string): Promise<TruvApiResponse> {
    return this._request('GET', `links/${linkId}/${productType}/report`);
  }

  // --- Reports ---

  // VOIE/VOE report: is_voe=false → income+employment, is_voe=true → employment only
  createVoieReport(userId: string, isVoe = false): Promise<TruvApiResponse> {
    return this._request('POST', `users/${userId}/reports/`, { json: { is_voe: isVoe } });
  }

  getVoieReport(userId: string, reportId: string): Promise<TruvApiResponse> {
    return this._request('GET', `users/${userId}/reports/${reportId}/`);
  }

  // Assets report
  createAssetsReport(userId: string): Promise<TruvApiResponse> {
    return this._request('POST', `users/${userId}/assets/reports/`);
  }

  getAssetsReport(userId: string, reportId: string): Promise<TruvApiResponse> {
    return this._request('GET', `users/${userId}/assets/reports/${reportId}/`);
  }

  // Income insights report
  createIncomeInsightsReport(userId: string): Promise<TruvApiResponse> {
    return this._request('POST', `users/${userId}/income_insights/reports/`, {
      json: { days_requested: 60, consumer_report_permissible_purpose: 'EXTENSION_OF_CREDIT' },
    });
  }

  getIncomeInsightsReport(userId: string, reportId: string): Promise<TruvApiResponse> {
    return this._request('GET', `users/${userId}/income_insights/reports/${reportId}/`);
  }

  // --- Document Collections API ---

  createDocumentCollection(documents: unknown[]): Promise<TruvApiResponse> {
    return this._request('POST', 'documents/collections/', { json: { documents } });
  }

  getDocumentCollection(collectionId: string): Promise<TruvApiResponse> {
    return this._request('GET', `documents/collections/${collectionId}/`);
  }

  uploadToCollection(collectionId: string, documents: unknown[]): Promise<TruvApiResponse> {
    return this._request('POST', `documents/collections/${collectionId}/upload/`, { json: { documents } });
  }

  finalizeCollection(collectionId: string, productType = 'income'): Promise<TruvApiResponse> {
    return this._request('POST', `documents/collections/${collectionId}/finalize/`, {
      json: { product_type: productType },
    });
  }

  getLinkIncomeReport(linkId: string): Promise<TruvApiResponse> {
    return this._request('GET', `links/${linkId}/income/report/`);
  }

  getFinalizationResults(collectionId: string): Promise<TruvApiResponse> {
    return this._request('GET', `documents/collections/${collectionId}/finalize/`);
  }
}
