/**
 * FILE SUMMARY: Mortgage: POS Tasks demo.
 * INTEGRATION PATTERN: Orders flow (multiple orders sharing one external_user_id).
 *
 * DATA FLOW (per task):
 *   1. POST /api/orders           : create one order per task (all share external_user_id)
 *   2. BridgeScreen opens with the active task's order_id
 *   3. Webhook polling for order-status-updated with status "completed"
 *   4. POST /api/users/:userId/reports/ then GET /api/users/:userId/reports/:report_id
 *
 * Creates multiple verification orders at once (income, employment, assets) tied to a
 * single borrower via external_user_id. Each task independently goes through bridge,
 * waiting, and results screens. The task list tracks completion status per task.
 *
 * Scaffolding: ./scaffolding/pos-tasks.jsx
 * Diagrams:    ../diagrams/pos-tasks.js
 *
 * WHAT TO COPY (for your own Truv integration):
 *   - handleInitialize() : creates multiple orders via POST /api/orders with shared external_user_id
 *   - useReportFetch()   : watches webhooks and fetches reports per task
 *   - <BridgeScreen />   : opens Bridge with a per-task order_id
 *   - handleStartTask()  : routes each task through its own bridge flow
 */

// --- Imports: Preact hooks ---
import { useState, useRef, useEffect, useMemo } from 'preact/hooks';

// --- Imports: shared layout, hooks, and API base URL ---
import { Layout, usePanel, API_BASE, useReportFetch } from '../components/index.js';

// --- Imports: reusable screen components for Bridge and waiting ---
import { BridgeScreen, OrderWaitingScreen } from '../components/screens/index.js';

// --- Imports: client-side navigation helper ---
import { navigate } from '../App.jsx';

// --- Imports: scaffolding (steps, task definitions, intro/results components) ---
import { STEPS, TASKS, InitScreen, TaskList, FollowUpReportResults } from './scaffolding/pos-tasks.jsx';


// --- Component: POSTasksDemo ---
export function POSTasksDemo({ screen, param }) {
  // Component state: application ID (shared external_user_id), task orders map, status tracking
  const [applicationId, setApplicationId] = useState(() => `qs-${Date.now()}`);
  const [taskOrders, setTaskOrders] = useState(null);
  const [initializing, setInitializing] = useState(false);
  const [taskStatus, setTaskStatus] = useState({});
  const activeTaskRef = useRef(null);

  // Panel hook: sidebar state, webhook polling, bridge events
  const { panel, setCurrentStep, startPolling, pollOnceAndStop, addBridgeEvent, reset } = usePanel();

  // Derived: find the active task's order and product list from the orderId in the URL
  const activeTaskInfo = useMemo(() => {
    if (!taskOrders || !param) return null;
    for (const task of TASKS) {
      const order = taskOrders[task.id];
      if (order && order.order_id === param) return { task, order };
    }
    return null;
  }, [taskOrders, param]);

  // Report fetching: watches webhooks for the active task's order completion
  const { reports, loading: reportLoading, error: reportError, reset: resetReports } = useReportFetch({
    userId: activeTaskInfo?.order?.user_id,
    products: activeTaskInfo?.task?.products || [],
    webhooks: panel.webhooks,
    pollOnceAndStop,
    webhookEvent: 'order',
  });

  // Step sync: update sidebar step indicator when URL-driven screen changes
  useEffect(() => {
    const stepMap = { '': 0, 'bridge': 1, 'waiting': 2, 'results': 3 };
    setCurrentStep(stepMap[screen] ?? 0);
  }, [screen]);

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

  // Derived state: layout flags
  const isBridge = screen === 'bridge';
  const isIntro = !screen && !taskOrders;

  // --- Render: screen routing ---
  return (
    <Layout badge="POS Tasks" steps={STEPS} panel={panel} flush={isBridge} hidePanel={isIntro}>
      {/* Bridge screen: inline TruvBridge widget for the active task */}
      {screen === 'bridge' && (
        <BridgeScreen
          orderId={param}
          demoPath="mortgage/pos-tasks"
          addBridgeEvent={addBridgeEvent}
          startPolling={startPolling}
          onCompleted={() => {
            if (activeTaskRef.current) setTaskStatus(prev => ({ ...prev, [activeTaskRef.current]: 'completed' }));
          }}
        />
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
          taskInfo={activeTaskInfo}
          onBack={() => { reset(); resetReports(); navigate('mortgage/pos-tasks'); }}
          backLabel="Back to Tasks"
        />
      )}
      {/* Default screen: init screen (enter application ID) or task list */}
      {!screen && (
        !taskOrders ? (
          <InitScreen
            applicationId={applicationId}
            onApplicationIdChange={setApplicationId}
            onInitialize={handleInitialize}
            initializing={initializing}
          />
        ) : (
          <div class="max-w-2xl mx-auto px-8 py-10">
            <h2 class="text-2xl font-bold tracking-tight mb-1.5">Complete Your Verifications</h2>
            <p class="text-sm text-gray-500 leading-relaxed mb-2">Application: <code class="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{applicationId}</code></p>
            <p class="text-sm text-gray-500 leading-relaxed mb-7">Complete each verification by connecting through Bridge.</p>
            <TaskList tasks={TASKS} taskOrders={taskOrders} taskStatus={taskStatus} onStart={handleStartTask} />
          </div>
        )
      )}
    </Layout>
  );
}
