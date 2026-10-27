/**
 * FILE SUMMARY: Follows the webhooks Truv sends for the users the playground creates, so they show in the Dev
 * panel's Webhooks tab. It polls GET /api/users/:id/webhooks (the same route the demos use) every 3 seconds
 * while there is someone to follow, and gives up on a user ten minutes after the last time they were added.
 */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { API_BASE } from '../components/hooks.js';
import { mergeByUser } from '../utils/panelLogs.js';

const POLL_MS = 3000;
const FOLLOW_MS = 600_000;
const KEEP = 200;
const MAX_FOLLOWED = 12;

export function useUserWebhooks() {
  const [events, setEvents] = useState([]);
  const following = useRef(new Map());      // user id -> { label, until }
  const rows = useRef(new Map());           // user id -> its latest list
  const timer = useRef(null);
  const reading = useRef(false);            // a poll still on its way: the next tick waits for it

  const poll = useCallback(async () => {
    const now = Date.now();
    for (const [uid, f] of following.current) if (f.until < now) following.current.delete(uid);
    if (!following.current.size) { clearInterval(timer.current); timer.current = null; return; }
    if (reading.current) return;
    reading.current = true;
    try {
    await Promise.all([...following.current.keys()].map(async (uid) => {
      try {
        const res = await fetch(`${API_BASE}/api/users/${uid}/webhooks`);
        const list = res.ok ? await res.json() : null;
        if (Array.isArray(list)) rows.current.set(uid, list);
      } catch { /* the next poll tries again */ }
    }));
    } finally { reading.current = false; }
    const labels = Object.fromEntries([...following.current].map(([uid, f]) => [uid, f.label]).filter(([, l]) => l));
    const perUser = [...rows.current].map(([uid, whs]) => ({ uid, whs }));
    setEvents(mergeByUser(perUser, 'whs', labels).slice(-KEEP));
  }, []);

  const follow = useCallback((userId, label = '') => {
    if (!userId) return;
    following.current.set(userId, { label, until: Date.now() + FOLLOW_MS });
    while (following.current.size > MAX_FOLLOWED) { const oldest = following.current.keys().next().value; following.current.delete(oldest); rows.current.delete(oldest); }
    if (!timer.current) timer.current = setInterval(poll, POLL_MS);
    poll();
  }, [poll]);

  useEffect(() => () => clearInterval(timer.current), []);
  return { webhooks: events, follow };
}
