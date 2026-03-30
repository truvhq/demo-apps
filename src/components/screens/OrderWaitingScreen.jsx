import { useRef, useEffect } from 'preact/hooks';
import { navigate } from '../../App.jsx';
import { API_BASE, parsePayload } from '../index.js';
import { WaitingScreen } from '../WebhookFeed.jsx';

const WAITING_MIN_MS = 10000;

export function OrderWaitingScreen({ orderId, demoPath, webhooks, startPolling, maxWidth = 'max-w-lg' }) {
  const waitingStartRef = useRef(Date.now());
  const advancePendingRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(orderId)}/info`);
        const data = await resp.json();
        if (resp.ok && data.user_id) startPolling(data.user_id);
      } catch {}
    })();
  }, [orderId]);

  useEffect(() => {
    if (advancePendingRef.current) return;
    const isCompleted = webhooks.some(w => {
      const p = parsePayload(w.payload);
      return (p.event_type === 'order-status-updated' && p.status === 'completed')
        || (w.event_type === 'order-status-updated' && w.status === 'completed');
    });
    if (isCompleted) {
      advancePendingRef.current = true;
      const delay = Math.max(1000, WAITING_MIN_MS - (Date.now() - waitingStartRef.current) + 1000);
      setTimeout(() => navigate(`${demoPath}/results/${orderId}`), delay);
    }
  }, [webhooks, orderId]);

  return <div class={`${maxWidth} mx-auto`}><WaitingScreen webhooks={webhooks} /></div>;
}
