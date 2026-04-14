/**
 * FILE SUMMARY: CompanySearch
 * DATA FLOW: User input -> debounce (300ms) -> GET /api/companies or GET /api/providers -> dropdown results
 * INTEGRATION PATTERN: Used by both Orders flow and Bridge flow via ApplicationForm
 *
 * Typeahead search component for selecting an employer (payroll) or financial institution (bank).
 * Calls the backend which proxies to Truv's /v1/company-mappings-search/ or /v1/providers/
 * endpoint. Returns a company_mapping_id or provider_id that ApplicationForm passes to order/bridge creation.
 */

// Preact hooks and API base URL
import { useState, useRef, useEffect } from 'preact/hooks';
import { API_BASE } from './hooks.js';

// Props: value (initial query), onChange (callback with {name, id}), productType (Truv product),
// dataSource (selects payroll vs bank search), placeholder, sessionId
export function CompanySearch({ value, onChange, productType, dataSource, placeholder, sessionId }) {
  // Local state: search query, dropdown results, open/close, loading spinner
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);
  const wrapperRef = useRef(null);

  // Click-outside handler: closes the dropdown when user clicks outside the component
  useEffect(() => {
    const handleClick = (e) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Debounced search handler: waits 300ms after typing, then fetches matching companies/providers.
  // For financial_accounts dataSource, calls GET /api/providers (proxied to /v1/providers/).
  // Otherwise calls GET /api/companies (proxied to /v1/company-mappings-search/).
  function handleInput(e) {
    const q = e.target.value;
    setQuery(q);
    onChange({ name: q, id: null });
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.length < 2) { setLoading(false); setResults([]); setOpen(false); return; }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        let resp;
        const sid = sessionId ? `&session_id=${encodeURIComponent(sessionId)}` : '';
        if (dataSource === 'financial_accounts') {
          resp = await fetch(`${API_BASE}/api/providers?q=${encodeURIComponent(q)}&product_type=${encodeURIComponent(productType || 'income')}&data_source=financial_accounts${sid}`);
        } else {
          resp = await fetch(`${API_BASE}/api/companies?q=${encodeURIComponent(q)}&product_type=${encodeURIComponent(productType || 'income')}${sid}`);
        }
        const data = await resp.json();
        setResults(data.slice(0, 8));
        setOpen(data.length > 0);
      } catch { setResults([]); }
      setLoading(false);
    }, 300);
  }

  // Selection handler: normalizes the selected item's ID (company_mapping_id for payroll,
  // id for banks) and passes it upstream to ApplicationForm via onChange.
  function select(item) {
    // Payroll search (/v1/company-mappings-search/) returns company_mapping_id.
    // Bank search (/v1/providers/) returns id (used as provider_id).
    // ApplicationForm reads this as employer.id and maps it to the correct API field.
    const id = item.company_mapping_id || item.id || null;
    setQuery(item.name);
    onChange({ name: item.name, id });
    setOpen(false);
  }

  // Render: input field with loading spinner and dropdown results list
  return (
    <div ref={wrapperRef} class="relative">
      {/* Search input field with focus handler to reopen dropdown */}
      <input
        value={query}
        onInput={handleInput}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder || "Search for employer..."}
        class="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:border-primary focus:outline-none"
      />
      {/* Loading spinner shown during API fetch */}
      {loading && <div class="absolute right-3 top-3"><div class="w-4 h-4 border-2 border-gray-200 border-t-primary rounded-full animate-spin" /></div>}
      {/* Dropdown results list: each item shows logo/initial, name, and optional domain */}
      {open && results.length > 0 && (
        <div class="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
          {results.map((c, i) => (
            <div key={c.company_mapping_id || c.id || i} class="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer" onClick={() => select(c)}>
              {c.logo_url
                ? <img src={c.logo_url} class="w-6 h-6 rounded object-contain flex-shrink-0" />
                : <div class="w-6 h-6 rounded bg-gray-100 flex items-center justify-center flex-shrink-0 text-xs font-medium text-gray-500">{c.name?.[0]?.toUpperCase()}</div>
              }
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate">{c.name}</div>
                {c.domain && <div class="text-xs text-gray-400">{c.domain}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
