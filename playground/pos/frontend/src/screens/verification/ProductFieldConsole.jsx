import React, { useState } from 'react';

import { Card, Input, Switch } from '@truv-demo/design-system';

import { api } from '../../api.js';
import {
  BRIDGE_TOKEN_ONLY_PRODUCTS, isSingleSelectMethod, nextProducts, productsForMethod,
} from './productRules.js';

const DATA_SOURCES = ['payroll', 'docs', 'financial_accounts'];
// Data Sources only has an effect when there's a payroll connection to attach
// it to (it's a real field on `employers[].data_sources`, confirmed via
// Truv's orders_create schema) — for bridge_token it's always meaningful
// (product_type IS the connection), but for Embedded/Hosted Orders it's a
// silent no-op unless income/employment is selected.
const DATA_SOURCE_PRODUCTS = ['income', 'employment'];

/** Exposes the literal Orders-API parameter surface as toggles, plus a live
 * request-preview panel — this is the "show me exactly what gets sent"
 * console the mortgage team wants for demos.
 *
 * The product list and every field's visibility are gated per integration
 * method/product selection using productRules.js — a combination confirmed
 * (via live sandbox testing) to be rejected by Truv is never offered here in
 * the first place, rather than letting someone hit the error and explaining
 * it after the fact. */
export function ProductFieldConsole({ config, onChange, requestPreview, application }) {
  const [employerQuery, setEmployerQuery] = useState('');
  const [employerResults, setEmployerResults] = useState([]);
  const [providerQuery, setProviderQuery] = useState('');
  const [providerResults, setProviderResults] = useState([]);

  const method = config.integration_method;
  const isBridgeToken = method === 'bridge_token';
  const singleSelect = isSingleSelectMethod(method);
  const PRODUCTS = productsForMethod(method);

  const set = (patch) => onChange({ ...config, ...patch });

  function toggleProduct(product) {
    set({ products: nextProducts(config.products, product, method) });
  }

  function toggleDataSource(source) {
    const data_sources = config.data_sources.includes(source)
      ? config.data_sources.filter((s) => s !== source)
      : [...config.data_sources, source];
    set({ data_sources });
  }

  async function handleEmployerSearch(q) {
    setEmployerQuery(q);
    if (q.length < 2) { setEmployerResults([]); return; }
    const results = await api.searchEmployers(q).catch(() => ({ results: [] }));
    setEmployerResults(results?.results || results?.data || []);
  }

  async function handleProviderSearch(q) {
    setProviderQuery(q);
    if (q.length < 2) { setProviderResults([]); return; }
    const results = await api.searchProviders(q).catch(() => ({ results: [] }));
    setProviderResults(results?.results || results?.data || []);
  }

  // Employer deeplinking applies to a payroll connection (income/employment
  // via Embedded/Hosted Orders) or a Bridge Token for deposit_switch/pll
  // (company_mapping_id there identifies the payroll provider the paycheck
  // comes from). Not meaningful for assets/insurance/transactions-only.
  const showEmployerDeeplink = config.products.some((p) => DATA_SOURCE_PRODUCTS.includes(p))
    || (isBridgeToken && config.products.some((p) => BRIDGE_TOKEN_ONLY_PRODUCTS.includes(p)));
  const showFinancialInstitutionDeeplink = config.products.includes('assets');
  const showDataSources = isBridgeToken || config.products.some((p) => DATA_SOURCE_PRODUCTS.includes(p));
  const showLiabilitiesToggle = config.products.includes('assets');

  const borrower = application?.borrowers?.[0];
  const hostedMissingContact = method === 'hosted_order' && borrower && !borrower.email && !borrower.phone;

  return (
    <Card title="Verification Request Console">
      <div>
        <div style={label}>Products{singleSelect ? ' (select one)' : ''}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PRODUCTS.map((p) => (
            <CheckboxPill key={p} checked={config.products.includes(p)} onClick={() => toggleProduct(p)} label={p} />
          ))}
        </div>
        {isBridgeToken && (
          <div style={{ fontSize: 12, color: 'var(--truv-grey-50)', marginTop: 6 }}>
            Deposit Switch and Paycheck Linked Lending both need a target bank account attached to the token —
            that's only possible via Bridge Token (this console fills in a demo account automatically).
          </div>
        )}
        {!isBridgeToken && (
          <div style={{ fontSize: 12, color: 'var(--truv-grey-50)', marginTop: 6 }}>
            "income" already includes employment data — pick "employment" only for an employment-only check with no
            income figures. Employment and Transactions must each be requested on their own; Truv only allows
            combining income, assets, and insurance together. Deposit Switch and PLL need the Bridge Token method
            (they aren't offered here since Embedded/Hosted Orders can't supply the bank account they require).
          </div>
        )}
      </div>

      {showLiabilitiesToggle && (
        <div>
          <div style={label}>Liabilities</div>
          <Switch
            label="Also fetch liabilities (credit cards, loans, mortgages) from this connection"
            checked={!!config.fetch_liabilities}
            onChange={(checked) => set({ fetch_liabilities: checked })}
          />
          <div style={{ fontSize: 12, color: 'var(--truv-grey-50)', marginTop: 6 }}>
            Not a standalone Truv product — this makes a follow-up call against the same bank connection the assets
            request already opens (GET /v1/links/{'{'}link_id{'}'}/liabilities/), one call per connected institution.
          </div>
        </div>
      )}

      {showDataSources && (
        <div>
          <div style={label}>Data Sources</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {DATA_SOURCES.map((s) => (
              <CheckboxPill key={s} checked={config.data_sources.includes(s)} onClick={() => toggleDataSource(s)} label={s} />
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--truv-grey-50)', marginTop: 6 }}>
            Only shown for income/employment (or any Bridge Token product) — Truv attaches this to the payroll
            connection itself; it has no effect on assets/insurance/transactions-only requests.
          </div>
        </div>
      )}

      <Input label="Template ID (branding, optional)" value={config.template_id} onChange={(e) => set({ template_id: e.target.value })} placeholder="e.g. tpl_xxx from Truv Dashboard" />

      {showEmployerDeeplink && (
        <div>
          <div style={label}>Deeplink Employer (optional — skips Bridge's search screen)</div>
          <Input value={employerQuery} onChange={(e) => handleEmployerSearch(e.target.value)} placeholder="Search employers…" />
          {config.company_mapping_id && (
            <div style={{ fontSize: 12, color: 'var(--truv-green)', marginTop: 4 }}>Selected: {config.employer_name}</div>
          )}
          {employerResults.length > 0 && (
            <div style={{ border: '1px solid var(--truv-grey-30)', borderRadius: 8, marginTop: 4, maxHeight: 160, overflowY: 'auto' }}>
              {employerResults.slice(0, 8).map((r) => (
                <div
                  key={r.company_mapping_id || r.id}
                  onClick={() => { set({ company_mapping_id: r.company_mapping_id || r.id, employer_name: r.name }); setEmployerResults([]); setEmployerQuery(r.name); }}
                  style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--truv-grey-20)' }}
                >
                  {r.name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showFinancialInstitutionDeeplink && (
        <div>
          <div style={label}>Deeplink Financial Institution (optional)</div>
          <Input value={providerQuery} onChange={(e) => handleProviderSearch(e.target.value)} placeholder="Search banks…" />
          {providerResults.length > 0 && (
            <div style={{ border: '1px solid var(--truv-grey-30)', borderRadius: 8, marginTop: 4, maxHeight: 160, overflowY: 'auto' }}>
              {providerResults.slice(0, 8).map((r) => (
                <div
                  key={r.id}
                  onClick={() => { set({ provider_id: r.id, employer_name: r.name }); setProviderResults([]); setProviderQuery(r.name); }}
                  style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--truv-grey-20)' }}
                >
                  {r.name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {hostedMissingContact && (
        <div style={{ fontSize: 12, color: 'var(--truv-text-red)', background: 'var(--truv-red-bright)', border: '1px solid var(--truv-red)', borderRadius: 8, padding: 10 }}>
          Truv will create this order, but the borrower has no email or phone on file — Hosted Orders has no in-app
          widget, so with neither contact method there's no way for them to ever receive the verification link.
        </div>
      )}

      <div>
        <div style={label}>Request Preview — POST /api/verification/requests/</div>
        <pre style={{
          background: 'var(--truv-primary-black)', color: '#c6f6d5', fontSize: 12,
          borderRadius: 8, padding: 12, overflowX: 'auto',
        }}>
          {JSON.stringify(requestPreview, null, 2)}
        </pre>
      </div>
    </Card>
  );
}

function CheckboxPill({ checked, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${checked ? 'var(--truv-accent)' : 'var(--truv-grey-30)'}`,
        background: checked ? 'var(--truv-accent)' : 'var(--truv-white)',
        color: checked ? 'var(--truv-white)' : 'var(--truv-pure-black)',
        borderRadius: 100, padding: '6px 14px', fontSize: 13, cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

const label = { fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--truv-pure-black)' };
