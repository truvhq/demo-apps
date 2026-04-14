// POSTasks.jsx -- Mortgage demo: POS Tasks
//
// Creates multiple orders sharing one external_user_id so Truv links
// them to a single borrower. Each task goes through bridge -> waiting
// -> results independently.
//
// Scaffolding (steps, intro screens, task list) is in ./scaffolding/pos-tasks.jsx
// Sequence diagrams are in ../diagrams/pos-tasks.js
//
// SCREEN FLOW (URL-driven via `screen` prop):
//   ''        -> Intro slide with task picker + application ID input
//   'bridge'  -> Bridge widget for the active task's order
//   'waiting' -> Webhook waiting spinner
//   'results' -> Report for the completed task
//
// API FLOW (per task):
//   1. POST /api/orders (all tasks created at once, same external_user_id)
//   2. Bridge opened per task with that task's order_id
//   3. Wait for order-status-updated webhook with status "completed"
//   4. POST /api/users/:userId/reports/ -> GET /api/users/:userId/reports/:report_id
//
// WHAT TO COPY (for your own Truv integration):
//   - handleInitialize() -> creates multiple orders via POST /api/orders with shared external_user_id
//   - useReportFetch()   -> watches webhooks and fetches reports per task
//   - <BridgeScreen />   -> opens Bridge with a per-task order_id
//   - handleStartTask()  -> routes each task through its own bridge flow

import { useState, useRef, useEffect, useMemo } from 'preact/hooks';
import { Layout, usePanel, API_BASE, useReportFetch } from '../components/index.js';
import { BridgeScreen, OrderWaitingScreen } from '../components/screens/index.js';
import { navigate } from '../App.jsx';
import { STEPS, TASKS, InitScreen, TaskList, FollowUpReportResults } from './scaffolding/pos-tasks.jsx';


export function POSTasksDemo({ screen, param }) {
  const [applicationId, setApplicationId] = useState(() => `qs-${Date.now()}`);
  const [taskOrders, setTaskOrders] = useState(null);
  const [initializing, setInitializing] = useState(false);
  const [taskStatus, setTaskStatus] = useState({});
  const activeTaskRef = useRef(null);
  const { panel, setCurrentStep, startPolling, pollOnceAndStop, addBridgeEvent, reset } = usePanel();

  // Find the active task's order and products from the orderId in the URL
  const activeTaskInfo = useMemo(() => {
    if (!taskOrders || !param) return null;
    for (const task of TASKS) {
      const order = taskOrders[task.id];
      if (order && order.order_id === param) return { task, order };
    }
    return null;
  }, [taskOrders, param]);

  const { reports, loading: reportLoading, error: reportError, reset: resetReports } = useReportFetch({
    userId: activeTaskInfo?.order?.user_id,
    products: activeTaskInfo?.task?.products || [],
    webhooks: panel.webhooks,
    pollOnceAndStop,
    webhookEvent: 'order',
  });

  useEffect(() => {
    const stepMap = { '': 0, 'bridge': 1, 'waiting': 2, 'results': 3 };
    setCurrentStep(stepMap[screen] ?? 0);
  }, [screen]);

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

  function handleStartTask(task) {
    const order = taskOrders?.[task.id];
    if (!order) return;
    activeTaskRef.current = task.id;
    navigate(`mortgage/pos-tasks/bridge/${order.order_id}`);
  }

  const isBridge = screen === 'bridge';
  const isIntro = !screen && !taskOrders;

  return (
    <Layout badge="POS Tasks" steps={STEPS} panel={panel} flush={isBridge} hidePanel={isIntro}>
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
      {screen === 'waiting' && (
        <OrderWaitingScreen orderId={param} demoPath="mortgage/pos-tasks" webhooks={panel.webhooks} startPolling={startPolling} maxWidth="max-w-2xl" />
      )}
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
