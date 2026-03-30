import { useState, useRef, useEffect } from 'preact/hooks';
import { API_BASE } from './hooks.js';

export function CompanySearch({ value, onChange, productType, placeholder }) {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleInput(e) {
    const q = e.target.value;
    setQuery(q);
    onChange({ name: q, id: null });
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.length < 2) { setLoading(false); setResults([]); setOpen(false); return; }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/companies?q=${encodeURIComponent(q)}&product_type=${encodeURIComponent(productType || 'income')}`);
        const data = await resp.json();
        setResults(data.slice(0, 8));
        setOpen(data.length > 0);
      } catch { setResults([]); }
      setLoading(false);
    }, 300);
  }

  function select(company) {
    setQuery(company.name);
    onChange({ name: company.name, id: company.company_mapping_id });
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} class="relative">
      <input
        value={query}
        onInput={handleInput}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder || "Search for employer..."}
        class="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:border-primary focus:outline-none"
      />
      {loading && <div class="absolute right-3 top-3"><div class="w-4 h-4 border-2 border-gray-200 border-t-primary rounded-full animate-spin" /></div>}
      {open && results.length > 0 && (
        <div class="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
          {results.map(c => (
            <div key={c.company_mapping_id} class="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer" onClick={() => select(c)}>
              {c.logo_url && <img src={c.logo_url} class="w-6 h-6 rounded object-contain" />}
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
