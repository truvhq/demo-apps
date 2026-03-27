import { useState, useEffect } from 'preact/hooks';
import { API_BASE } from '../hooks.js';
import { OrderResults } from '../OrderResults.jsx';

export function OrderResultsScreen({ orderId, onBack, backLabel = 'Back', maxWidth = 'max-w-lg' }) {
  const [orderData, setOrderData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(orderId)}/report`);
        if (resp.ok) setOrderData(await resp.json());
        else setError('Failed to load results');
      } catch (e) { console.error(e); setError(e.message); }
    })();
  }, [orderId]);

  if (error) return <div class={`${maxWidth} mx-auto text-center py-16 text-red-600`}>{error}</div>;
  if (!orderData) return <div class={`${maxWidth} mx-auto text-center py-16`}><div class="w-10 h-10 border-[3px] border-gray-200 border-t-primary rounded-full animate-spin mx-auto" /></div>;

  return (
    <div class={`${maxWidth} mx-auto`}>
      <h2 class="text-2xl font-bold tracking-tight mb-1.5">Verification Results</h2>
      <p class="text-sm text-gray-500 mb-7">Order {orderData.truv_order_id || ''} • {orderData.status || ''}</p>
      <OrderResults data={orderData} />
      <div class="flex gap-3 mt-6 pt-5 border-t border-gray-200">
        <button class="px-5 py-2.5 text-sm font-semibold border border-gray-200 rounded-full hover:border-primary hover:text-primary" onClick={onBack}>{backLabel}</button>
      </div>
    </div>
  );
}
