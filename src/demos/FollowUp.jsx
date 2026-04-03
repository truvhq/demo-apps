import { useState, useRef, useEffect } from 'preact/hooks';
import { Layout, usePanel, API_BASE, IntroSlide } from '../components/index.js';
import { Icons } from '../components/Icons.jsx';
import { BridgeScreen, OrderWaitingScreen, OrderResultsScreen } from '../components/screens/index.js';
import { navigate } from '../App.jsx';

const STEPS = [
  {
    title: 'Initialize orders',
    guide: '<p>Enter an Application ID and create verification orders for each product type:</p>'
      + '<pre>POST /v1/orders/\n{\n  "products": ["income"],\n  "external_user_id": "...",\n  "employers": [{"company_name": "..."}]\n}</pre>'
      + '<p>All orders share the same <code>external_user_id</code> so Truv links them to one applicant.</p>'
      + '<p><a href="https://docs.truv.com/reference/create-an-order" target="_blank">API Reference →</a></p>',
  },
  {
    title: 'Bridge verification',
    guide: '<p>The Bridge widget is initialized with:</p>'
      + '<pre>TruvBridge.init({\n  bridgeToken: "...",\n  isOrder: true,\n  position: { type: "inline", container: el }\n})</pre>'
      + '<p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p>'
      + '<p><a href="https://docs.truv.com/docs/bridge-overview" target="_blank">Bridge Docs →</a></p>',
  },
  {
    title: 'Webhook processing',
    guide: '<p>Truv sends webhooks as the verification progresses.</p>'
      + '<p><a href="https://docs.truv.com/docs/webhooks" target="_blank">Webhooks Docs →</a></p>',
  },
  {
    title: 'Retrieve reports',
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
  const activeTaskRef = useRef(null);
  const { panel, setCurrentStep, startPolling, addBridgeEvent, reset } = usePanel();

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
    <Layout title="Truv Quickstart" badge="POS Tasks" steps={STEPS} panel={panel} flush={isBridge} hidePanel={isIntro}>
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
        <OrderResultsScreen orderId={param} onBack={() => { reset(); navigate('mortgage/pos-tasks'); }} backLabel="Back to Tasks" maxWidth="max-w-2xl" />
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

const FOLLOWUP_TASKS_INFO = [
  { name: 'Income', desc: 'Verify earnings and pay history from payroll', report: 'VOIE' },
  { name: 'Employment', desc: 'Verify job title, status, and tenure', report: 'VOE' },
  { name: 'Assets', desc: 'Verify bank balances, transactions, deposits', report: 'VOA' },
  { name: 'Combined', desc: 'Income + assets in a single order', report: 'VOIE + VOA' },
];

const FOLLOWUP_DIAGRAM = `sequenceDiagram
  participant App as Your App
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
  const [step, setStep] = useState(1);

  if (step === 2) {
    return (
      <IntroSlide
        label="Follow-up → Architecture"
        title="Multi-order flow"
        subtitle="All orders share the same external_user_id, linking them to one applicant in Truv."
        diagram={FOLLOWUP_DIAGRAM}
      >
        <div class="w-full max-w-xs mx-auto flex gap-3">
          <button onClick={() => setStep(1)} class="flex-1 py-3 border border-[#d2d2d7] text-[#1d1d1f] font-semibold rounded-full hover:bg-[#f5f5f7]">
            Back
          </button>
          <button
            onClick={onInitialize}
            disabled={initializing || !applicationId.trim()}
            class="flex-1 py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover disabled:opacity-40"
          >
            {initializing ? (
              <span class="inline-flex items-center gap-2">
                <span class="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating...
              </span>
            ) : 'Continue'}
            </button>
          </div>
      </IntroSlide>
    );
  }

  return (
    <div class="intro-slide">
      <div class="relative z-10 w-full max-w-2xl mx-auto px-4">
        <div class="animate-slideUp">
          <div class="text-[12px] font-medium uppercase tracking-[0.08em] text-primary mb-4">Follow-up Flow</div>
          <h2 class="text-[36px] font-semibold tracking-[-0.03em] leading-[1.1] text-[#1d1d1f] mb-4">Complete remaining<br />verifications</h2>
          <p class="text-[17px] text-[#86868b] leading-[1.5] max-w-[440px] mx-auto mb-7">
            After submitting an application, the user returns to complete multiple verification tasks — all linked to the same person.
          </p>
        </div>

        <div class="grid grid-cols-2 gap-3 mb-8 text-left animate-slideUp delay-1">
          {FOLLOWUP_TASKS_INFO.map(t => (
            <div key={t.name} class="border border-[#d2d2d7]/60 rounded-2xl px-5 py-4 bg-white/80 backdrop-blur-sm">
              <div class="flex items-start justify-between mb-1">
                <h3 class="text-[14px] font-semibold text-[#1d1d1f]">{t.name}</h3>
                <span class="text-[11px] font-medium text-[#86868b] bg-[#f5f5f7] px-2 py-0.5 rounded-md font-mono">{t.report}</span>
              </div>
              <p class="text-[13px] text-[#6e6e73] leading-[1.4]">{t.desc}</p>
            </div>
          ))}
        </div>

        <div class="animate-slideUp delay-2 w-full max-w-xs mx-auto">
          <label class="text-[13px] font-medium text-[#1d1d1f] mb-1.5 block text-left">Application ID</label>
          <input
            value={applicationId}
            onInput={e => onApplicationIdChange(e.target.value)}
            placeholder="e.g. qs-1774626234913"
            class="w-full px-4 py-3 border border-[#d2d2d7] rounded-xl text-sm font-mono focus:border-primary focus:outline-none mb-3 text-center"
          />
          <p class="text-[11px] text-[#86868b] mb-4 text-left">Sent as <code class="font-mono">external_user_id</code> — all orders share the same Truv user.</p>
          <button
            onClick={() => setStep(2)}
            class="w-full py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover"
          >
            View Architecture
          </button>
        </div>
      </div>
    </div>
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
