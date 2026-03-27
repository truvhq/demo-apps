import { useState, useRef, useEffect } from 'preact/hooks';
import { Layout, OrderResults, WaitingScreen, usePanel, API_BASE, parsePayload, IntroSlide } from '../components/index.js';
import { navigate } from '../App.jsx';

const STEPS = [
  { title: 'Applicant list', guide: '<p>View applicants and their verification status. Request new verifications or reverify existing ones.</p><pre>POST /v1/orders/\n{\n  "first_name": "...",\n  "products": ["income"]\n}</pre>' },
  { title: 'Bridge verification', guide: '<p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p><p><a href="https://docs.truv.com/docs/bridge-overview" target="_blank">Bridge Docs →</a></p>' },
  { title: 'Webhook processing', guide: '<p>Truv sends webhooks as the verification progresses.</p>' },
  { title: 'View results', guide: '<p>Fetch reports by product type:</p><pre>POST /v1/users/{user_id}/reports/\nPOST /v1/users/{user_id}/assets/reports/</pre>' },
];

const EMPLOYEES = [
  { id: 'existing', firstName: 'John', lastName: 'Doe', phone: '555-0101', products: ['income'], employer: 'Home Depot', existing: true },
  { id: 'income', firstName: 'Jane', lastName: 'Smith', phone: '555-0102', products: ['income'], employer: 'Home Depot' },
  { id: 'assets', firstName: 'Bob', lastName: 'Wilson', phone: '555-0103', products: ['assets'], employer: null },
  { id: 'combined', firstName: 'Alice', lastName: 'Brown', phone: '555-0104', products: ['income', 'assets'], employer: 'Home Depot' },
];

const WAITING_MIN_MS = 10000;

const PROCESSOR_DIAGRAM = `sequenceDiagram
  participant Proc as Processor
  participant Truv as Truv API
  participant User as User (remote)
  Proc->>Truv: POST /v1/orders/
  Note right of Truv: PII + products
  Truv-->>Proc: order_id, share_url
  Proc->>User: Send share_url (email/SMS)
  User->>Truv: Opens share_url, completes Bridge
  Truv->>Proc: Webhook: order-status-updated
  Proc->>Truv: POST /v1/users/{user_id}/reports/
  Truv-->>Proc: Verification report`;

export function EmployeePortalDemo({ screen, param }) {
  const [introStep, setIntroStep] = useState(1);
  const [introSeen, setIntroSeen] = useState(false);
  const [employeeOrders, setEmployeeOrders] = useState({});
  const [creating, setCreating] = useState(null);
  const activeEmployeeRef = useRef(null);
  const { panel, setCurrentStep, startPolling, addBridgeEvent, reset } = usePanel();

  useEffect(() => {
    const stepMap = { '': 0, 'bridge': 1, 'waiting': 2, 'results': 3 };
    setCurrentStep(stepMap[screen] ?? 0);
  }, [screen]);

  // Create the "existing" order on mount
  useEffect(() => {
    const emp = EMPLOYEES.find(e => e.existing);
    if (!emp || employeeOrders[emp.id]) return;
    let cancelled = false;
    (async () => {
      try {
        const body = { products: emp.products, demo_id: 'employee-portal', first_name: emp.firstName, last_name: emp.lastName, phone: emp.phone };
        if (emp.employer) body.employer = emp.employer;
        const resp = await fetch(`${API_BASE}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await resp.json();
        if (!cancelled && resp.ok) setEmployeeOrders(prev => ({ ...prev, [emp.id]: data }));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleRequest(emp) {
    setCreating(emp.id);
    try {
      const body = { products: emp.products, demo_id: 'employee-portal', first_name: emp.firstName, last_name: emp.lastName, phone: emp.phone };
      if (emp.employer) body.employer = emp.employer;
      const resp = await fetch(`${API_BASE}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await resp.json();
      if (resp.ok) {
        setEmployeeOrders(prev => ({ ...prev, [emp.id]: data }));
        activeEmployeeRef.current = emp.id;
        navigate(`employee-portal/bridge/${data.order_id}`);
      }
    } catch (e) { console.error(e); }
    setCreating(null);
  }

  function handleStart(emp) {
    const order = employeeOrders[emp.id];
    if (order) {
      activeEmployeeRef.current = emp.id;
      navigate(`employee-portal/bridge/${order.order_id}`);
    } else {
      handleRequest(emp);
    }
  }

  const isBridge = screen === 'bridge';
  const showIntro = !screen && !introSeen;

  return (
    <Layout title="Truv Quickstart" badge="Processor Portal" steps={STEPS} panel={panel} flush={isBridge} hidePanel={showIntro}>
      {screen === 'bridge' && (
        <BridgeScreen orderId={param} addBridgeEvent={addBridgeEvent} startPolling={startPolling} />
      )}
      {screen === 'waiting' && (
        <WaitingScreenWrapper orderId={param} webhooks={panel.webhooks} startPolling={startPolling} />
      )}
      {screen === 'results' && (
        <ResultsScreen orderId={param} onBack={() => { reset(); navigate('employee-portal'); }} />
      )}
      {!screen && showIntro && introStep === 2 && (
        <IntroSlide
          label="Processor Portal → Architecture"
          title="Remote verification flow"
          subtitle="The processor creates orders and sends share links. The user completes verification on their own."
          diagram={PROCESSOR_DIAGRAM}
        >
          <div class="w-full max-w-xs mx-auto flex gap-3">
            <button onClick={() => setIntroStep(1)} class="flex-1 py-3 border border-[#d2d2d7] text-[#1d1d1f] font-semibold rounded-full hover:bg-[#f5f5f7]">Back</button>
            <button onClick={() => setIntroSeen(true)} class="flex-1 py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover">Continue</button>
          </div>
        </IntroSlide>
      )}

      {!screen && showIntro && introStep === 1 && (
        <div class="intro-slide">
          <div class="relative z-10 w-full max-w-2xl mx-auto px-4">
            <div class="animate-slideUp">
              <div class="text-[12px] font-medium uppercase tracking-[0.08em] text-primary mb-4">Processor Portal</div>
              <h2 class="text-[36px] font-semibold tracking-[-0.03em] leading-[1.1] text-[#1d1d1f] mb-4">Verify without the<br />user present</h2>
              <p class="text-[17px] text-[#86868b] leading-[1.5] max-w-[440px] mx-auto mb-7">
                The user already submitted their application and left. A processor creates verification orders using collected data, sends a link, and tracks completion.
              </p>
            </div>
            <div class="grid gap-3 mb-8 text-left max-w-lg mx-auto animate-slideUp delay-1">
              {[
                { name: 'Create orders from collected data', desc: 'No user interaction needed — use PII from the application' },
                { name: 'Send verification links', desc: 'Share URL via email or SMS for the user to complete later' },
                { name: 'Track status remotely', desc: 'Monitor webhook events and order status from the dashboard' },
                { name: 'Fetch reports on completion', desc: 'Pull VOIE, VOE, or VOA reports once the user completes Bridge' },
              ].map(item => (
                <div key={item.name} class="border border-[#d2d2d7] rounded-2xl px-5 py-4 bg-white">
                  <h3 class="text-[14px] font-semibold text-[#1d1d1f] mb-1">{item.name}</h3>
                  <p class="text-[13px] text-[#6e6e73] leading-[1.4]">{item.desc}</p>
                </div>
              ))}
            </div>
            <div class="animate-slideUp delay-2">
              <button onClick={() => setIntroStep(2)} class="w-full max-w-xs mx-auto block py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover">
                View Architecture
              </button>
            </div>
          </div>
        </div>
      )}

      {!screen && !showIntro && (
        <div class="max-w-3xl mx-auto px-8 py-10">
          <div class="space-y-3">
            {EMPLOYEES.map(emp => {
              const order = employeeOrders[emp.id];
              const isCreating = creating === emp.id;
              const productLabel = emp.products.join(' + ');
              return (
                <div key={emp.id} class="flex items-center gap-4 border border-border rounded-xl px-5 py-4 bg-white">
                  <div class="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-500 shrink-0">
                    {emp.firstName[0]}{emp.lastName[0]}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-semibold">{emp.firstName} {emp.lastName}</div>
                    <div class="text-xs text-gray-500 truncate">{emp.phone} • {productLabel}</div>
                  </div>
                  {emp.existing && order ? (
                    <div class="flex items-center gap-2">
                      <span class="text-xs font-semibold text-success bg-success-bg px-2 py-1 rounded">Existing</span>
                      <button class="px-3 py-1.5 text-xs font-medium border border-primary text-primary rounded-full hover:bg-primary hover:text-white" onClick={() => handleRequest(emp)}>
                        {isCreating ? <span class="inline-block w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> : 'Reverify'}
                      </button>
                    </div>
                  ) : order ? (
                    <button class="px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-full hover:bg-primary-hover" onClick={() => handleStart(emp)}>Start</button>
                  ) : (
                    <button class="px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-full hover:bg-primary-hover disabled:opacity-40" disabled={isCreating} onClick={() => handleRequest(emp)}>
                      {isCreating ? <span class="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Request'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Layout>
  );
}

function BridgeScreen({ orderId, addBridgeEvent, startPolling }) {
  const [bridgeToken, setBridgeToken] = useState(null);
  const [error, setError] = useState(null);
  const containerRef = useRef(null);
  const bridgeInitRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(orderId)}/info`);
        const data = await resp.json();
        if (cancelled) return;
        if (!resp.ok) { setError(data.error || 'Unknown error'); return; }
        setBridgeToken(data.bridge_token);
        startPolling(data.user_id);
      } catch (e) { if (!cancelled) setError(e.message); }
    })();
    return () => { cancelled = true; };
  }, [orderId]);

  useEffect(() => {
    if (!bridgeToken || !containerRef.current || !window.TruvBridge || bridgeInitRef.current) return;
    bridgeInitRef.current = true;
    const b = window.TruvBridge.init({
      bridgeToken, isOrder: true,
      position: { type: 'inline', container: containerRef.current },
      onLoad: () => addBridgeEvent('onLoad', null),
      onEvent: (type, _, source) => {
        addBridgeEvent('onEvent', { eventType: type, source });
        if (type === 'COMPLETED' && source === 'order') navigate(`employee-portal/waiting/${orderId}`);
      },
      onSuccess: () => addBridgeEvent('onSuccess', null),
      onClose: () => addBridgeEvent('onClose', null),
    });
    b.open();
    return () => { try { b.close(); } catch {} };
  }, [bridgeToken]);

  if (error) return <div class="text-center py-16 text-red-600">{error}</div>;
  if (!bridgeToken) return <div class="text-center py-16"><div class="w-10 h-10 border-[3px] border-gray-200 border-t-primary rounded-full animate-spin mx-auto" /></div>;

  return <div ref={containerRef} class="w-full h-full overflow-hidden bg-white [&_iframe]:w-full [&_iframe]:!h-full [&_iframe]:border-none" style="zoom: 0.85;" />;
}

function WaitingScreenWrapper({ orderId, webhooks, startPolling }) {
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
      const elapsed = Date.now() - waitingStartRef.current;
      const delay = Math.max(1000, WAITING_MIN_MS - elapsed + 1000);
      setTimeout(() => navigate(`employee-portal/results/${orderId}`), delay);
    }
  }, [webhooks, orderId]);

  return <div class="max-w-2xl mx-auto"><WaitingScreen webhooks={webhooks} /></div>;
}

function ResultsScreen({ orderId, onBack }) {
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

  if (error) return <div class="max-w-2xl mx-auto text-center py-16 text-red-600">{error}</div>;
  if (!orderData) return <div class="max-w-2xl mx-auto text-center py-16"><div class="w-10 h-10 border-[3px] border-gray-200 border-t-primary rounded-full animate-spin mx-auto" /></div>;

  return (
    <div class="max-w-2xl mx-auto">
      <h2 class="text-2xl font-bold tracking-tight mb-1.5">Verification Results</h2>
      <p class="text-sm text-gray-500 mb-7">Order {orderData.truv_order_id || ''} • {orderData.status || ''}</p>
      <OrderResults data={orderData} />
      <div class="flex gap-3 mt-6 pt-5 border-t border-gray-200">
        <button class="px-5 py-2.5 text-sm font-semibold bg-primary text-white rounded-full hover:bg-primary-hover" onClick={onBack}>Back to Applicants</button>
      </div>
    </div>
  );
}
