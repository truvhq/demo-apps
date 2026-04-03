// Truv API client
//
// Wraps all Truv REST endpoints used by this quickstart:
//   Users + Bridge tokens, company/provider search, orders,
//   token exchange, reports (VOIE, VOE, assets, income insights,
//   deposit switch), and document collections.
// See: https://docs.truv.com/reference

import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

export class TruvClient {
  constructor({ clientId, secret, apiUrl = 'https://prod.truv.com/v1/' }) {
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

  async _request(method, endpoint, { json } = {}) {
    const url = this.apiUrl + endpoint;
    const start = performance.now();

    const opts = { method, headers: this.headers };
    if (json) opts.body = JSON.stringify(json);

    const response = await fetch(url, opts);
    const durationMs = Math.round((performance.now() - start) * 10) / 10;

    let data;
    const text = await response.text();
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    console.log(`TRUV: ${method.toUpperCase()} ${url} — ${response.status} (${durationMs}ms)`);
    return { statusCode: response.status, data, durationMs, requestBody: json || null };
  }

  // --- Users API ---

  async createUser(overrides = {}) {
    const payload = {
      external_user_id: `qs-${uuidv4()}`, // Replace with your internal user/application ID
      first_name: 'John',
      last_name: 'Johnson',
      email: 'j.johnson@example.com',
      ...overrides,
    };
    return this._request('POST', 'users/', { json: payload });
  }

  async createUserBridgeToken(userId, productType, { data_sources, company_mapping_id, provider_id } = {}) {
    const payload = {
      product_type: productType,
      client_name: 'Truv Quickstart',
      tracking_info: '1338-0111-A', // Replace with your internal reference (e.g. loan number)
    };

    if (data_sources && data_sources.length > 0) {
      payload.data_sources = data_sources;
    }

    // Deeplink the employer/institution so the user skips the Bridge search screen.
    // The Truv API uses different field names:
    //   - Payroll providers: company_mapping_id (from GET /v1/company-mappings-search/)
    //   - Financial institutions: provider_id (from GET /v1/providers/)
    // See: https://docs.truv.com/reference/users_tokens
    if (company_mapping_id) payload.company_mapping_id = company_mapping_id;
    if (provider_id) payload.provider_id = provider_id;

    // Sandbox test account for deposit_switch and pll products
    if (productType === 'deposit_switch' || productType === 'pll') {
      payload.account = {
        account_number: '16002600',   // Sandbox test value — replace with real account in production
        account_type: 'checking',
        routing_number: '12345678',   // Sandbox test value
        bank_name: 'Truv Bank',       // Sandbox test value
      };
      if (productType === 'pll') {
        payload.account.deposit_type = 'amount';
        payload.account.deposit_value = 100; // Numeric amount
      }
    }

    return this._request('POST', `users/${userId}/tokens/`, { json: payload });
  }

  // --- Company Search ---

  async searchProviders(query, productType, dataSource) {
    const params = new URLSearchParams();
    if (query) params.set('search', query);
    if (productType) params.set('product_type', productType);
    if (dataSource) params.set('data_source', dataSource);
    return this._request('GET', `providers/?${params}`);
  }

  async searchCompanies(query, productType) {
    const params = new URLSearchParams({ query });
    if (productType) params.set('product_type', productType);
    return this._request('GET', `company-mappings-search/?${params}`);
  }

  // --- Orders API ---

  async createOrder(params = {}) {
    const productType = params.product_type || 'income';
    const payload = {
      order_number: `qs-${uuidv4()}`, // Replace with your internal order/application ID
      external_user_id: params.external_user_id || `qs-${uuidv4()}`,
      first_name: params.first_name || 'John',
      last_name: params.last_name || 'Johnson',
      products: params.products || [productType],
    };

    if (params.data_sources && params.data_sources.length > 0) {
      payload.data_sources = params.data_sources;
    }

    if (params.email) payload.email = params.email;
    if (params.phone) payload.phone = params.phone;
    if (params.ssn) payload.social_security_number = params.ssn;
    if (params.template_id) payload.template_id = params.template_id;

    // The Truv Orders API uses different arrays for payroll vs bank:
    //   - Payroll products: employers: [{ company_mapping_id }]
    //   - Bank/assets products: financial_institutions: [{ id, name }]
    // See: https://docs.truv.com/reference/orders_create
    // Sandbox credentials: goodlogin / goodpassword
    if (productType === 'assets' || (params.data_sources && params.data_sources.includes('financial_accounts'))) {
      if (params.provider_id || params.employer) {
        const fi = {};
        if (params.provider_id) fi.id = params.provider_id;
        if (params.employer) fi.name = params.employer;
        payload.financial_institutions = [fi];
      }
    } else {
      // Payroll products use employers: [{ company_mapping_id }]
      if (params.company_mapping_id) {
        payload.employers = [{ company_mapping_id: params.company_mapping_id }];
      } else if (params.employer) {
        payload.employers = [{ company_name: params.employer }];
      }
    }

    // Sandbox test account for deposit_switch and pll products
    if (['deposit_switch', 'pll'].includes(productType) && payload.employers) {
      payload.employers[0].account = {
        account_number: '16002600',   // Sandbox test value — replace with real account in production
        account_type: 'checking',
        routing_number: '12345678',   // Sandbox test value
        bank_name: 'Truv Bank',       // Sandbox test value
      };
      if (productType === 'pll') {
        payload.employers[0].account.deposit_type = 'amount';
        payload.employers[0].account.deposit_value = 100; // Numeric amount
      }
    }

    return this._request('POST', 'orders/', { json: payload });
  }

  async getOrder(truvOrderId) {
    return this._request('GET', `orders/${truvOrderId}/`);
  }

  async refreshOrder(truvOrderId) {
    return this._request('POST', `orders/${truvOrderId}/refresh/`);
  }

  // --- Webhooks API ---

  async listWebhooks() {
    return this._request('GET', 'webhooks/');
  }

  async createWebhook(params) {
    return this._request('POST', 'webhooks/', { json: params });
  }

  async deleteWebhook(webhookId) {
    return this._request('DELETE', `webhooks/${webhookId}/`);
  }

  // --- Token Exchange & Reports ---

  async getAccessToken(publicToken) {
    return this._request('POST', 'link-access-tokens/', { json: { public_token: publicToken } });
  }

  async getLinkReport(linkId, reportType) {
    return this._request('GET', `links/${linkId}/${reportType}/report/`);
  }

  // --- Reports ---

  // VOIE/VOE report: is_voe=false → income+employment, is_voe=true → employment only
  async createVoieReport(userId, isVoe = false) {
    return this._request('POST', `users/${userId}/reports/`, { json: { is_voe: isVoe } });
  }

  async getVoieReport(userId, reportId) {
    return this._request('GET', `users/${userId}/reports/${reportId}/`);
  }

  // Assets report
  async createAssetsReport(userId) {
    return this._request('POST', `users/${userId}/assets/reports/`);
  }

  async getAssetsReport(userId, reportId) {
    return this._request('GET', `users/${userId}/assets/reports/${reportId}/`);
  }

  // Income insights report
  async createIncomeInsightsReport(userId) {
    return this._request('POST', `users/${userId}/income_insights/reports/`, {
      json: { days_requested: 60, consumer_report_permissible_purpose: 'EXTENSION_OF_CREDIT' },
    });
  }

  async getIncomeInsightsReport(userId, reportId) {
    return this._request('GET', `users/${userId}/income_insights/reports/${reportId}/`);
  }

  // Deposit switch report
  // See: https://docs.truv.com/reference/dds-report-retrieve
  async getDepositSwitchReport(userId) {
    return this._request('GET', `users/${userId}/deposit-switch/reports/`);
  }

  // --- Document Collections API ---

  async createDocumentCollection(documents) {
    return this._request('POST', 'documents/collections/', {
      json: { documents },
    });
  }

  async getDocumentCollection(collectionId) {
    return this._request('GET', `documents/collections/${collectionId}/`);
  }

  async uploadToCollection(collectionId, documents) {
    return this._request('POST', `documents/collections/${collectionId}/upload/`, {
      json: { documents },
    });
  }

  async finalizeCollection(collectionId, productType = 'income') {
    return this._request('POST', `documents/collections/${collectionId}/finalize/`, {
      json: { product_type: productType },
    });
  }

  async getLinkIncomeReport(linkId) {
    return this._request('GET', `links/${linkId}/income/report/`);
  }

  async getFinalizationResults(collectionId) {
    return this._request('GET', `documents/collections/${collectionId}/finalize/`);
  }
}
