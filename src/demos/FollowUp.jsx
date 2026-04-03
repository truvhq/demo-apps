import { useState, useRef, useEffect } from 'preact/hooks';
import { Layout, usePanel, API_BASE, IntroSlide } from '../components/index.js';
import { Icons } from '../components/Icons.jsx';
import { BridgeScreen, OrderWaitingScreen } from '../components/screens/index.js';
import { VoieReport } from '../components/reports/VoieReport.jsx';
import { AssetsReport } from '../components/reports/AssetsReport.jsx';
import { IncomeInsightsReport } from '../components/reports/IncomeInsightsReport.jsx';
import { navigate } from '../App.jsx';

const STEPS = [
  {
    title: 'Loan Processor creates tasks',
    guide: '<p>Enter an Application ID and create verification orders for each product type:</p>'
      + '<pre>POST /v1/orders/\n{\n  "products": ["income"],\n  "external_user_id": "...",\n  "employers": [{"company_name": "..."}]\n}</pre>'
      + '<p>All orders share the same <code>external_user_id</code> so Truv links them to one borrower.</p>'
      + '<p><a href="https://docs.truv.com/reference/create-an-order" target="_blank">API Reference →</a></p>',
  },
  {
    title: 'Borrower completes verification',
    guide: '<p>The Bridge widget is initialized with:</p>'
      + '<pre>TruvBridge.init({\n  bridgeToken: "...",\n  isOrder: true,\n  position: { type: "inline", container: el }\n})</pre>'
      + '<p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p>'
      + '<p><a href="https://docs.truv.com/docs/bridge-overview" target="_blank">Bridge Docs →</a></p>',
  },
  {
    title: 'Truv sends updates',
    guide: '<p>Truv sends webhooks as the verification progresses.</p>'
      + '<p><a href="https://docs.truv.com/docs/webhooks" target="_blank">Webhooks Docs →</a></p>',
  },
  {
    title: 'Loan Processor reviews reports',
    guide: '<p>Fetch reports based on product type:</p>'
      + '<pre>POST /v1/users/{user_id}/reports/\n{ "is_voe": false }  // income\n{ "is_voe": true }   // employment</pre>'
      + '<pre>POST /v1/users/{user_id}/assets/reports/\nPOST /v1/users/{user_id}/income_insights/reports/</pre>'
      + '<p><a href="https://docs.truv.com/reference/users_reports" target="_blank">Reports API →</a></p>',
  },
];

const TASKS = [
  { id: 'income', name: 'Verify Income', desc: 'Home Depot', products: ['income'], employer: 'Home Depot', Icon: Icons.dollarSign, iconBg: 'bg-green-50' },
  { id: 'employment', name: 'Verify Employment', desc: 'Walmart', products: ['employment'], employer: 'Walmart', Icon: Icons.clipboard, iconBg: 'bg-blue-50' },
  { id: 'assets', name: 'Verify Assets', desc: 'Bank accounts & transactions', products: ['assets'], employer: null, Icon: Icons.bankBuilding, iconBg: 'bg-amber-50' },
  { id: 'assets-income', name: 'Assets + Income', desc: 'Combined order', products: ['income', 'assets'], employer: 'Home Depot', Icon: Icons.barChart, iconBg: 'bg-purple-50' },
];


export function FollowUpDemo({ screen, param }) {
  const [applicationId, setApplicationId] = useState(() => `qs-${Date.now()}`);
  const [taskOrders, setTaskOrders] = useState(null);
  const [initializing, setInitializing] = useState(false);
  const [taskStatus, setTaskStatus] = useState({});
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState(null);
  const activeTaskRef = useRef(null);
  const { panel, setCurrentStep, startPolling, addBridgeEvent, reset } = usePanel();

  useEffect(() => {
    const stepMap = { '': 0, 'bridge': 1, 'waiting': 2, 'results': 3 };
    setCurrentStep(stepMap[screen] ?? 0);
  }, [screen]);

  // Find the active task's order and products from the orderId in the URL
  function getActiveTaskInfo() {
    if (!taskOrders || !param) return null;
    for (const task of TASKS) {
      const order = taskOrders[task.id];
      if (order && order.order_id === param) return { task, order };
    }
    return null;
  }

  // Fetch reports when navigating to results screen
  useEffect(() => {
    if (screen !== 'results' || reportData) return;
    const info = getActiveTaskInfo();
    if (!info || !info.order.user_id) return;
    setReportLoading(true);
    (async () => {
      try {
        const reports = {};
        const products = info.task.products;
        const fetches = [];
        if (products.includes('income')) {
          fetches.push(
            fetch(`${API_BASE}/api/users/${encodeURIComponent(info.order.user_id)}/reports/income`)
              .then(r => r.ok ? r.json() : null).then(d => { if (d) reports.income = d; })
          );
        }
        if (products.includes('employment')) {
          fetches.push(
            fetch(`${API_BASE}/api/users/${encodeURIComponent(info.order.user_id)}/reports/employment`)
              .then(r => r.ok ? r.json() : null).then(d => { if (d) reports.employment = d; })
          );
        }
        if (products.includes('assets')) {
          fetches.push(
            fetch(`${API_BASE}/api/users/${encodeURIComponent(info.order.user_id)}/reports/assets`)
              .then(r => r.ok ? r.json() : null).then(d => { if (d) reports.assets = d; })
          );
          fetches.push(
            fetch(`${API_BASE}/api/users/${encodeURIComponent(info.order.user_id)}/reports/income_insights`)
              .then(r => r.ok ? r.json() : null).then(d => { if (d) reports.income_insights = d; })
          );
        }
        await Promise.all(fetches);
        setReportData(reports);
      } catch (e) {
        console.error(e);
        setReportError('Failed to load report');
      }
      setReportLoading(false);
    })();
  }, [screen, param, taskOrders]);

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
          reportData={reportData}
          reportLoading={reportLoading}
          reportError={reportError}
          taskInfo={getActiveTaskInfo()}
          onBack={() => { reset(); setReportData(null); setReportError(null); navigate('mortgage/pos-tasks'); }}
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

function FollowUpReportResults({ reportData, reportLoading, reportError, taskInfo, onBack, backLabel = 'Back', maxWidth = 'max-w-2xl' }) {
  if (reportError) return <div class={`${maxWidth} mx-auto text-center py-16 text-red-600`}>{reportError}</div>;
  if (reportLoading || !reportData) return <div class={`${maxWidth} mx-auto text-center py-16`}><div class="w-10 h-10 border-[3px] border-gray-200 border-t-primary rounded-full animate-spin mx-auto" /></div>;

  return (
    <div class={`${maxWidth} mx-auto`}>
      <h2 class="text-2xl font-bold tracking-tight mb-1.5">Verification Results</h2>
      <p class="text-sm text-gray-500 mb-7">{taskInfo?.task?.name || 'Task'} verification</p>
      {reportData.income && <VoieReport report={reportData.income} />}
      {reportData.employment && <VoieReport report={reportData.employment} />}
      {reportData.assets && <AssetsReport report={reportData.assets} />}
      {reportData.income_insights && <IncomeInsightsReport report={reportData.income_insights} />}
      <div class="flex gap-3 mt-6 pt-5 border-t border-gray-200">
        <button class="px-5 py-2.5 text-sm font-semibold border border-gray-200 rounded-full hover:border-primary hover:text-primary" onClick={onBack}>{backLabel}</button>
      </div>
    </div>
  );
}

const FOLLOWUP_TASKS_INFO = [
  { name: 'Income', desc: 'Verify earnings and pay history from payroll', report: 'VOIE' },
  { name: 'Employment', desc: 'Verify job title, status, and tenure', report: 'VOE' },
  { name: 'Assets', desc: 'Verify bank balances, transactions, deposits', report: 'VOA' },
  { name: 'Combined', desc: 'Income + assets in a single order', report: 'VOIE + VOA' },
];

const FOLLOWUP_DIAGRAM = `sequenceDiagram
  participant App as Lender POS
  participant Truv as Truv API
  participant Bridge as Truv Bridge
  App->>Truv: POST /v1/orders/ (income)
  App->>Truv: POST /v1/orders/ (employment)
  App->>Truv: POST /v1/orders/ (assets)
  App->>Truv: POST /v1/orders/ (income+assets)
  Note right of Truv: All share same external_user_id
  Truv-->>App: 4x bridge_token, shared user_id
  loop For each task
    App->>Bridge: TruvBridge.init({ bridgeToken })
    Bridge-->>App: User completes verification
    Truv->>App: Webhook: order-status-updated
    App->>Truv: POST /v1/users/{user_id}/reports/
    Truv-->>App: Report data
  end`;

function InitScreen({ applicationId, onApplicationIdChange, onInitialize, initializing }) {
  return (
    <IntroSlide
      label="Mortgage . Follow-up Tasks"
      title="Complete remaining loan verifications"
      subtitle="After submitting a loan application, the borrower returns to complete outstanding verification tasks: income, employment, and assets."
      diagram={FOLLOWUP_DIAGRAM}
      actions={
        <div>
          <label class="text-[13px] font-medium text-[#171717] mb-1.5 block">Application ID</label>
          <input
            value={applicationId}
            onInput={e => onApplicationIdChange(e.target.value)}
            placeholder="e.g. qs-1774626234913"
            class="w-full px-4 py-3 border border-[#d2d2d7] rounded-xl text-sm font-mono focus:border-primary focus:outline-none mb-3"
          />
          <p class="text-[11px] text-[#8E8E93] mb-4">Sent as <code class="font-mono">external_user_id</code> so all orders share the same Truv user.</p>
          <button
            onClick={onInitialize}
            disabled={initializing || !applicationId.trim()}
            class="w-full py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover disabled:opacity-40"
          >
            {initializing ? (
              <span class="inline-flex items-center gap-2">
                <span class="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating...
              </span>
            ) : 'Get started'}
          </button>
        </div>
      }
    >
      <div class="grid grid-cols-2 gap-3">
        {FOLLOWUP_TASKS_INFO.map(t => (
          <div key={t.name} class="border border-[#d2d2d7]/60 rounded-2xl px-5 py-4 bg-white/80 backdrop-blur-sm">
            <div class="flex items-start justify-between mb-1">
              <h3 class="text-[14px] font-semibold text-[#171717]">{t.name}</h3>
              <span class="text-[11px] font-medium text-[#8E8E93] bg-[#f5f5f7] px-2 py-0.5 rounded-md font-mono">{t.report}</span>
            </div>
            <p class="text-[13px] text-[#8E8E93] leading-[1.4]">{t.desc}</p>
          </div>
        ))}
      </div>
    </IntroSlide>
  );
}

function TaskList({ tasks, taskOrders, taskStatus, onStart }) {
  return (
    <div class="space-y-3">
      {tasks.map(task => {
        const completed = taskStatus[task.id] === 'completed';
        const order = taskOrders[task.id];
        return (
          <div key={task.id} class="flex items-center gap-4 border border-border rounded-xl px-5 py-4 bg-white">
            <div class={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-[#e8e8ed] ${task.iconBg}`}><task.Icon size={18} /></div>
            <div class="flex-1">
              <div class="text-sm font-semibold mb-0.5">{task.name}</div>
              <div class="text-xs text-gray-500">{task.desc}</div>
            </div>
            {completed ? (
              <span class="text-xs font-semibold text-success bg-success-bg px-2 py-1 rounded uppercase">Completed</span>
            ) : order ? (
              <button class="px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-full hover:bg-primary-hover" onClick={() => onStart(task)}>Start</button>
            ) : (
              <span class="text-xs text-gray-400">Failed</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
