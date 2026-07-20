/**
 * FILE SUMMARY: Mortgage: POS Tasks demo.
 * INTEGRATION PATTERN: Orders flow (multiple orders sharing one external_user_id).
 *
 * DATA FLOW (per task):
 *   1. POST /api/orders           : create one order per task (all share external_user_id)
 *   2. GET /api/orders/:id/info   : fetch bridge_token; Bridge modal opens inside the preview iframe
 *   3. Webhook polling for order-status-updated with status "completed"
 *   4. POST /api/users/:userId/reports/ then GET /api/users/:userId/reports/:report_id
 *
 * Creates multiple verification orders at once (income, employment, assets) tied to a
 * single borrower via external_user_id. Each task independently goes through bridge,
 * waiting, and results screens. The task list tracks completion status per task.
 *
 * The user-facing screens (task list, Bridge widget) render inside an isolated
 * iframe (`/preview.html`) wrapped in DeviceFrame and driven over postMessage;
 * init/waiting/results screens are the loan-processor view and render bare.
 *
 * Scaffolding: ./scaffolding/pos-tasks.jsx
 * Diagrams:    ../diagrams/pos-tasks.js
 *
 * WHAT TO COPY (for your own Truv integration):
 *   - handleInitialize() : creates multiple orders via POST /api/orders with shared external_user_id
 *   - useReportFetch()   : watches webhooks and fetches reports per task
 *   - TruvBridge.init()  : opens Bridge with a per-task bridge_token (see preview/components/BridgePreview.jsx)
 *   - handleStartTask()  : routes each task through its own bridge flow
 */

// --- Imports: Preact hooks ---
import { useState, useRef, useEffect, useMemo } from 'preact/hooks';

// --- Imports: shared layout, hooks, and API base URL ---
import { Layout, usePanel, API_BASE, useReportFetch, useOrderRestore } from '../components/index.js';

// --- Imports: device-frame preview wrapper + iframe channel hook ---
import { DeviceFrame } from '../components/DeviceFrame.jsx';
import { usePreviewIframe } from '../hooks/usePreviewIframe.js';

// --- Imports: reusable screen components ---
import { OrderWaitingScreen } from '../components/screens/index.js';

// --- Imports: client-side navigation helper ---
import { navigate } from '../App.jsx';

// --- Imports: scaffolding (steps, task definitions, intro/results components) ---
import { STEPS, TASKS, InitScreen, FollowUpReportResults } from './scaffolding/pos-tasks.jsx';


// --- Component: POSTasksDemo ---
export function POSTasksDemo({ screen, param }) {
  // Component state: application ID (shared external_user_id), task orders map, status tracking
  const [applicationId, setApplicationId] = useState(() => `qs-${Date.now()}`);
  const [taskOrders, setTaskOrders] = useState(null);
  const [initializing, setInitializing] = useState(false);
  const [taskStatus, setTaskStatus] = useState({});
  // Restored task info: rebuilt from the backend when the user re-enters a results
  // URL after a remount (taskOrders state is gone, so activeTaskInfo can't resolve)
  const [restoredTaskInfo, setRestoredTaskInfo] = useState(null);
  const activeTaskRef = useRef(null);
  const [bridgeToken, setBridgeToken] = useState(null);
  const iframeRef = useRef(null);
  // Set when Bridge fires COMPLETED (source: order) — a trailing close from the
  // SDK's auto-close-after-completion must not abort the successful session.
  const completedRef = useRef(false);

  // Panel hook: sidebar state, webhook polling, bridge events
  const { panel, setCurrentStep, startPolling, stopPolling, pollOnceAndStop, addBridgeEvent, reset } = usePanel();

  // Derived: find the active task's order and product list from the orderId in the URL
  const activeTaskInfo = useMemo(() => {
    if (!taskOrders || !param) return null;
    for (const task of TASKS) {
      const order = taskOrders[task.id];
      if (order && order.order_id === param) return { task, order };
    }
    return null;
  }, [taskOrders, param]);

  // Task info for the report screens: in-memory state, or the restored fallback
  const taskInfo = activeTaskInfo || restoredTaskInfo;

  // Report fetching: watches webhooks for the active task's order completion
  const { reports, loading: reportLoading, error: reportError, reset: resetReports } = useReportFetch({
    userId: taskInfo?.order?.user_id,
    products: taskInfo?.task?.products || [],
    webhooks: panel.webhooks,
    pollOnceAndStop,
    webhookEvent: 'order',
  });

  // Session restore: when the user re-enters the results URL (refresh/back-forward)
  // the component remounts with no taskOrders, so the results screen would spin
  // forever. Restore user/products from GET /api/orders/:id/info and restart polling
  // so the persisted completion webhook re-triggers the report fetch. The stored
  // product_type (comma-joined) is mapped back to the matching TASKS entry.
  useOrderRestore({
    active: screen === 'results',
    orderId: param,
    userId: taskInfo?.order?.user_id,
    startPolling,
    onRestore: ({ userId: restoredUserId, products }) => {
      const task = TASKS.find(t => t.products.join(',') === products.join(','))
        || { id: 'restored', name: 'Verification', products };
      setRestoredTaskInfo({ task, order: { order_id: param, user_id: restoredUserId } });
    },
  });

  // Step sync: update sidebar step indicator when URL-driven screen changes
  useEffect(() => {
    const stepMap = { '': 0, 'bridge': 1, 'waiting': 2, 'results': 3 };
    setCurrentStep(stepMap[screen] ?? 0);
  }, [screen]);

  // Effect: on the bridge screen, fetch order info to get bridge_token and user_id
  // (also covers a refresh directly on /bridge/:orderId). The backend proxies
  // GET /api/orders/:id/info to Truv's API. Once we have user_id, start polling
  // for API logs and webhooks. Leaving the bridge screen clears the token so a
  // remounted iframe never replays a stale 'bridge' command.
  useEffect(() => {
    if (screen !== 'bridge' || !param) {
      setBridgeToken(null);
      completedRef.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(param)}/info`);
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({ error: 'Unknown' }));
          if (cancelled) return;
          alert('Error: ' + (data.error || 'Unknown'));
          abortBridge();
          return;
        }
        const data = await resp.json();
        if (cancelled) return;
        setBridgeToken(data.bridge_token);
        startPolling(data.user_id);
      } catch (e) {
        console.error(e);
        if (!cancelled) abortBridge();
      }
    })();
    return () => { cancelled = true; };
  }, [screen, param]);

  // Handler: create all task orders at once via POST /api/orders (shared external_user_id)
  async function handleInitialize() {
    if (!applicationId.trim()) return;
    setInitializing(true);
    const results = {};
    for (const task of TASKS) {
      try {
        const body = { products: task.products, demo_id: 'pos-tasks', external_user_id: applicationId.trim() };
        if (task.employer) body.employer = task.employer;
        const resp = await fetch(`${API_BASE}/api/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await resp.json();
        if (resp.ok) results[task.id] = data;
      } catch (e) { console.error(`Failed to create order for ${task.id}:`, e); }
    }
    setTaskOrders(results);
    setInitializing(false);
  }

  // Handler: navigate to the Bridge screen for a specific task's order
  function handleStartTask(task) {
    const order = taskOrders?.[task.id];
    if (!order) return;
    activeTaskRef.current = task.id;
    navigate(`mortgage/pos-tasks/bridge/${order.order_id}`);
  }

  // Preview iframe channel: maps user/SDK events from inside the iframe back to
  // host state changes. On COMPLETED (source: order) the active task is marked
  // completed and the flow advances to the waiting screen; on a genuine user
  // close, stop polling the abandoned order and clear the active task marker so
  // a later webhook from the abandoned attempt can't hijack a restarted task.
  const sendPreview = usePreviewIframe(iframeRef, {
    'task:start': (taskId) => {
      const task = TASKS.find(t => t.id === taskId);
      if (task) handleStartTask(task);
    },
    'bridge:onLoad': () => addBridgeEvent('onLoad()', null),
    'bridge:onEvent': (type, payload, source) => {
      const payloadStr = payload ? 'payload' : 'undefined';
      addBridgeEvent(`onEvent("${type}", ${payloadStr}, "${source}")`, payload ? [{ label: 'payload', value: payload }] : null);
      // Orders flow: the task's order (all its products, e.g. combined
      // income+assets) is done only on the order-level COMPLETED event — not a
      // per-link SUCCESS, which fires once per product and would advance a
      // combined task after just income.
      if (type === 'COMPLETED' && source === 'order') completeTask();
      // A user exit surfaces as onEvent CLOSE — the SDK's onClose callback does
      // not always fire — so the close path lives here too.
      if (type === 'CLOSE') handleBridgeClose();
    },
    'bridge:onSuccess': () => addBridgeEvent('onSuccess()', null),
    'bridge:onClose': () => {
      addBridgeEvent('onClose()', null);
      handleBridgeClose();
    },
  });

  // Completion: mark the active task and move to the waiting screen.
  function completeTask() {
    completedRef.current = true;
    if (activeTaskRef.current) setTaskStatus(prev => ({ ...prev, [activeTaskRef.current]: 'completed' }));
    navigate(`mortgage/pos-tasks/waiting/${param}`);
  }

  // Close: after COMPLETED it's the SDK's post-completion close — ignore.
  // Otherwise the user abandoned the order before it finished — abort.
  function handleBridgeClose() {
    if (completedRef.current) return;
    abortBridge();
  }

  // Abort: stop polling the abandoned order and clear the active task marker so
  // a later webhook from the abandoned attempt can't hijack a restarted task.
  function abortBridge() {
    stopPolling();
    activeTaskRef.current = null;
    navigate('mortgage/pos-tasks');
  }

  // Drive the preview iframe from host state: the task list before a task is
  // started, Bridge modal (or a spinner while the token loads) on the bridge
  // screen. Task objects hold icon components, so only serializable per-task
  // states cross the postMessage boundary.
  useEffect(() => {
    if (!screen && taskOrders) {
      const taskStates = Object.fromEntries(TASKS.map(t => [
        t.id,
        taskStatus[t.id] === 'completed' ? 'completed' : taskOrders[t.id] ? 'ready' : 'failed',
      ]));
      sendPreview('task-list', { applicationId, taskStates });
    } else if (screen === 'bridge') {
      if (bridgeToken) {
        sendPreview('bridge', { bridgeToken, isOrder: true, inline: true });
      } else {
        sendPreview('loading', { label: 'Preparing verification…' });
      }
    }
  }, [screen, taskOrders, taskStatus, applicationId, bridgeToken, sendPreview]);

  // Derived state: layout flags. The device frame spans the borrower-facing
  // screens (task list + Bridge).
  const isIntro = !screen && !taskOrders;
  const showDeviceFrame = (!screen && taskOrders) || screen === 'bridge';

  // --- Render: screen routing ---
  return (
    <Layout badge="POS Tasks" steps={STEPS} panel={panel} hidePanel={isIntro}>
      {/* Task list + Bridge widget live inside the preview iframe (user view).
          A single iframe element persists across the task list → bridge hash
          navigation; it remounts between tasks (waiting/results unmount it) and
          the latest render command replays on preview:ready. */}
      {showDeviceFrame && (
        <DeviceFrame url="pos.example.com">
          <iframe
            ref={iframeRef}
            src="/preview.html"
            title="Demo preview"
            class="w-full h-full block border-0 bg-white"
          />
        </DeviceFrame>
      )}
      {/* Waiting screen: webhook polling spinner for the active task */}
      {screen === 'waiting' && (
        <OrderWaitingScreen orderId={param} demoPath="mortgage/pos-tasks" webhooks={panel.webhooks} startPolling={startPolling} maxWidth="max-w-2xl" />
      )}
      {/* Results screen: report for the completed task */}
      {screen === 'results' && (
        <FollowUpReportResults
          reportData={reports}
          reportLoading={reportLoading}
          reportError={reportError}
          taskInfo={taskInfo}
          onBack={() => { reset(); resetReports(); setRestoredTaskInfo(null); navigate('mortgage/pos-tasks'); }}
          backLabel="Back to Tasks"
        />
      )}
      {/* Default screen: init screen (enter application ID; the task list itself
          renders inside the device frame above) */}
      {!screen && !taskOrders && (
        <InitScreen
          applicationId={applicationId}
          onApplicationIdChange={setApplicationId}
          onInitialize={handleInitialize}
          initializing={initializing}
        />
      )}
    </Layout>
  );
}
