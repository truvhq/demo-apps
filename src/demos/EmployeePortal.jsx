import { useState, useRef, useEffect } from 'preact/hooks';
import { Layout, usePanel, API_BASE, IntroSlide } from '../components/index.js';
import { BridgeScreen, OrderWaitingScreen, OrderResultsScreen } from '../components/screens/index.js';
import { navigate } from '../App.jsx';

const STEPS = [
  { title: 'Applicant list', guide: '<p>View applicants and their verification status. Request new verifications or reverify existing ones.</p><pre>POST /v1/orders/\n{\n  "first_name": "...",\n  "products": ["income"]\n}</pre>' },
  { title: 'Bridge verification', guide: '<p>Sandbox credentials: <code>goodlogin</code> / <code>goodpassword</code></p><p><a href="https://docs.truv.com/docs/bridge-overview" target="_blank">Bridge Docs →</a></p>' },
  { title: 'Webhook processing', guide: '<p>Truv sends webhooks as the verification progresses.</p>' },
  { title: 'View results', guide: '<p>Fetch reports by product type:</p><pre>POST /v1/users/{user_id}/reports/\nPOST /v1/users/{user_id}/assets/reports/</pre>' },
];

// Dummy completed applicants (display-only, no actions)
const COMPLETED_APPLICANTS = [
  { firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com', phone: '+14155550101', products: ['income'], status: 'completed' },
  { firstName: 'Jane', lastName: 'Smith', email: 'jane.smith@example.com', phone: '+14155550102', products: ['income'], status: 'completed' },
  { firstName: 'Bob', lastName: 'Wilson', email: 'bob.wilson@example.com', phone: '+14155550103', products: ['assets'], status: 'completed' },
];

const VERIFIER_DIAGRAM = `sequenceDiagram
  participant V as Verifier
  participant Truv as Truv API
  participant User as User (remote)
  V->>Truv: POST /v1/orders/
  Note right of Truv: PII + email + phone + products
  Truv-->>V: order_id, share_url
  V->>User: Send share_url (email/SMS)
  User->>Truv: Opens share_url, completes Bridge
  Truv->>V: Webhook: order-status-updated
  V->>Truv: POST /v1/users/{user_id}/reports/
  Truv-->>V: Verification report`;

export function EmployeePortalDemo({ screen, param }) {
  const [introStep, setIntroStep] = useState(1);
  const [introSeen, setIntroSeen] = useState(false);
  const [testApplicant, setTestApplicant] = useState(null);
  const [order, setOrder] = useState(null);
  const [creating, setCreating] = useState(false);
  const { panel, setCurrentStep, startPolling, addBridgeEvent, reset } = usePanel();

  useEffect(() => {
    const stepMap = { '': 0, 'bridge': 1, 'waiting': 2, 'results': 3 };
    setCurrentStep(stepMap[screen] ?? 0);
  }, [screen]);

  async function handleRequest() {
    if (!testApplicant) return;
    setCreating(true);
    try {
      const body = {
        products: testApplicant.products,
        demo_id: 'verifier-portal',
        first_name: testApplicant.firstName,
        last_name: testApplicant.lastName,
      };
      if (testApplicant.email) body.email = testApplicant.email;
      if (testApplicant.phone) body.phone = testApplicant.phone;
      const resp = await fetch(`${API_BASE}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await resp.json();
      if (resp.ok) {
        setOrder(data);
        navigate(`verifier-portal/bridge/${data.order_id}`);
      }
    } catch (e) { console.error(e); }
    setCreating(false);
  }

  const isBridge = screen === 'bridge';
  const showIntro = !screen && !introSeen;
  const showAddForm = !screen && introSeen && !testApplicant;
  const showTable = !screen && introSeen && testApplicant;

  return (
    <Layout title="Truv Quickstart" badge="Verifier Portal" steps={STEPS} panel={panel} flush={isBridge} hidePanel={showIntro || showAddForm}>
      {screen === 'bridge' && (
        <BridgeScreen orderId={param} demoPath="verifier-portal" addBridgeEvent={addBridgeEvent} startPolling={startPolling} />
      )}
      {screen === 'waiting' && (
        <OrderWaitingScreen orderId={param} demoPath="verifier-portal" webhooks={panel.webhooks} startPolling={startPolling} maxWidth="max-w-4xl" />
      )}
      {screen === 'results' && (
        <OrderResultsScreen orderId={param} onBack={() => { reset(); navigate('verifier-portal'); }} backLabel="Back to Applicants" maxWidth="max-w-4xl" />
      )}

      {/* Intro step 1 */}
      {showIntro && introStep === 1 && (
        <div class="intro-slide">
          <div class="relative z-10 w-full max-w-2xl mx-auto px-4">
            <div class="animate-slideUp">
              <div class="text-[12px] font-medium uppercase tracking-[0.08em] text-primary mb-4">Verifier Portal</div>
              <h2 class="text-[36px] font-semibold tracking-[-0.03em] leading-[1.1] text-[#1d1d1f] mb-4">Verify without the<br />user present</h2>
              <p class="text-[17px] text-[#86868b] leading-[1.5] max-w-[440px] mx-auto mb-7">
                The user already submitted their application and left. A verifier creates orders using collected data, sends a link, and tracks completion.
              </p>
            </div>
            <div class="grid gap-3 mb-8 text-left max-w-lg mx-auto animate-slideUp delay-1">
              {[
                { name: 'Create orders from collected data', desc: 'Use PII from the application — no user interaction needed' },
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

      {/* Intro step 2 — architecture */}
      {showIntro && introStep === 2 && (
        <IntroSlide
          label="Verifier Portal → Architecture"
          title="Remote verification flow"
          subtitle="The verifier creates orders with applicant PII and sends share links. The user completes verification on their own."
          diagram={VERIFIER_DIAGRAM}
        >
          <div class="w-full max-w-xs mx-auto flex gap-3">
            <button onClick={() => setIntroStep(1)} class="flex-1 py-3 border border-[#d2d2d7] text-[#1d1d1f] font-semibold rounded-full hover:bg-[#f5f5f7]">Back</button>
            <button onClick={() => setIntroSeen(true)} class="flex-1 py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover">Continue</button>
          </div>
        </IntroSlide>
      )}

      {/* Add test applicant form */}
      {showAddForm && (
        <AddApplicantForm onSubmit={setTestApplicant} />
      )}

      {/* Table view */}
      {showTable && (
        <div class="max-w-4xl mx-auto px-8 py-10">
          <h2 class="text-xl font-semibold tracking-tight mb-1 text-[#1d1d1f]">Applicants</h2>
          <p class="text-[13px] text-[#86868b] mb-5">Completed applicants are shown for reference. Your test applicant is ready to verify.</p>

          <div class="border border-[#d2d2d7] rounded-xl overflow-hidden bg-white">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-[#d2d2d7] bg-[#f5f5f7] text-[#86868b] text-[12px] font-medium uppercase tracking-wide">
                  <th class="text-left px-4 py-3">Name</th>
                  <th class="text-left px-4 py-3">Email</th>
                  <th class="text-left px-4 py-3">Phone</th>
                  <th class="text-left px-4 py-3">Products</th>
                  <th class="text-left px-4 py-3">Status</th>
                  <th class="text-right px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {/* Completed dummy rows */}
                {COMPLETED_APPLICANTS.map((app, i) => (
                  <tr key={i} class="border-b border-[#f5f5f7]">
                    <td class="px-4 py-3 text-[#6e6e73]">{app.firstName} {app.lastName}</td>
                    <td class="px-4 py-3 text-[#86868b] font-mono text-[12px]">{app.email}</td>
                    <td class="px-4 py-3 text-[#86868b] font-mono text-[12px]">{app.phone}</td>
                    <td class="px-4 py-3">
                      {app.products.map(p => <span key={p} class="inline-block text-[11px] font-medium bg-[#f5f5f7] text-[#6e6e73] px-2 py-0.5 rounded mr-1">{p}</span>)}
                    </td>
                    <td class="px-4 py-3"><span class="text-[11px] font-semibold text-[#34c759] bg-green-50 px-2 py-0.5 rounded">completed</span></td>
                    <td class="px-4 py-3 text-right text-[12px] text-[#86868b]">—</td>
                  </tr>
                ))}

                {/* Test applicant row */}
                <tr class="border-b border-[#f5f5f7] bg-[#fafafa]">
                  <td class="px-4 py-3 font-medium text-[#1d1d1f]">{testApplicant.firstName} {testApplicant.lastName}</td>
                  <td class="px-4 py-3 text-[#6e6e73] font-mono text-[12px]">{testApplicant.email || '—'}</td>
                  <td class="px-4 py-3 text-[#6e6e73] font-mono text-[12px]">{testApplicant.phone || '—'}</td>
                  <td class="px-4 py-3">
                    {testApplicant.products.map(p => <span key={p} class="inline-block text-[11px] font-medium bg-primary-light text-primary px-2 py-0.5 rounded mr-1">{p}</span>)}
                  </td>
                  <td class="px-4 py-3">
                    <span class={`text-[11px] font-semibold px-2 py-0.5 rounded ${order?.status === 'completed' ? 'text-[#34c759] bg-green-50' : order ? 'text-[#ff9f0a] bg-amber-50' : 'text-[#86868b] bg-[#f5f5f7]'}`}>
                      {order?.status || 'pending'}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-right">
                    {order ? (
                      <button class="px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-full hover:bg-primary-hover" onClick={() => navigate(`verifier-portal/bridge/${order.order_id}`)}>
                        Start
                      </button>
                    ) : (
                      <button class="px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-full hover:bg-primary-hover disabled:opacity-40" disabled={creating} onClick={handleRequest}>
                        {creating ? <span class="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Request'}
                      </button>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  );
}

function AddApplicantForm({ onSubmit }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [product, setProduct] = useState('income');

  function handleSubmit(e) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;
    onSubmit({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      products: [product],
    });
  }

  return (
    <div class="intro-slide" style="justify-content: flex-start; padding-top: 3rem;">
      <div class="w-full max-w-md mx-auto px-4">
        <div class="animate-slideUp text-center mb-8">
          <h2 class="text-[28px] font-semibold tracking-[-0.02em] text-[#1d1d1f] mb-2">Add Test Applicant</h2>
          <p class="text-[15px] text-[#86868b] leading-[1.5]">
            Enter applicant details. Truv will send the verification link via email and/or SMS.
          </p>
        </div>

        <form onSubmit={handleSubmit} class="animate-slideUp delay-1 text-left">
          <div class="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label class="text-[13px] font-medium text-[#1d1d1f] mb-1.5 block">First name</label>
              <input value={firstName} onInput={e => setFirstName(e.target.value)} placeholder="John" class="w-full px-3.5 py-2.5 border border-[#d2d2d7] rounded-lg text-sm focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label class="text-[13px] font-medium text-[#1d1d1f] mb-1.5 block">Last name</label>
              <input value={lastName} onInput={e => setLastName(e.target.value)} placeholder="Doe" class="w-full px-3.5 py-2.5 border border-[#d2d2d7] rounded-lg text-sm focus:border-primary focus:outline-none" />
            </div>
          </div>
          <div class="mb-3">
            <label class="text-[13px] font-medium text-[#1d1d1f] mb-1.5 block">Email</label>
            <input type="email" value={email} onInput={e => setEmail(e.target.value)} placeholder="john@example.com" class="w-full px-3.5 py-2.5 border border-[#d2d2d7] rounded-lg text-sm focus:border-primary focus:outline-none" />
            <p class="text-[11px] text-[#86868b] mt-1">Truv sends the verification link to this email</p>
          </div>
          <div class="mb-3">
            <label class="text-[13px] font-medium text-[#1d1d1f] mb-1.5 block">Phone</label>
            <input type="tel" value={phone} onInput={e => setPhone(e.target.value)} placeholder="+14155551234" class="w-full px-3.5 py-2.5 border border-[#d2d2d7] rounded-lg text-sm focus:border-primary focus:outline-none" />
            <p class="text-[11px] text-[#86868b] mt-1">Truv sends the verification link via SMS</p>
          </div>
          <div class="mb-5">
            <label class="text-[13px] font-medium text-[#1d1d1f] mb-1.5 block">Product</label>
            <select value={product} onChange={e => setProduct(e.target.value)} class="w-full px-3.5 py-2.5 border border-[#d2d2d7] rounded-lg text-sm bg-white focus:border-primary focus:outline-none">
              <option value="income">Income verification</option>
              <option value="employment">Employment verification</option>
              <option value="assets">Assets verification</option>
            </select>
          </div>
          <button type="submit" disabled={!firstName.trim() || !lastName.trim()} class="w-full py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover disabled:opacity-40">
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
