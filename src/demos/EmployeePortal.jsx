// EmployeePortal.jsx -- Public Sector demo: Case Worker Portal
//
// Same backend-initiated pattern as LOS.jsx but with government-specific
// labels (case worker, applicant). No Bridge widget in this flow.
//
// SCREEN FLOW (state-driven):
//   !introSeen              -> Intro slide with architecture diagram
//   introSeen && !applicant -> Add applicant form (name, email, phone, products)
//   introSeen && applicant  -> Order table with status tracking + report
//
// API FLOW:
//   1. POST /api/orders (with PII + email/phone, no company)
//   2. Truv sends email/SMS with share_url to applicant
//   3. Wait for order-status-updated webhook with status "completed"
//   4. GET /api/users/:userId/reports/:type -> fetch report

import { useState, useEffect } from 'preact/hooks';
import { Layout, WebhookFeed, usePanel, API_BASE, parsePayload, IntroSlide } from '../components/index.js';
import { VoieReport } from '../components/reports/VoieReport.jsx';
import { AssetsReport } from '../components/reports/AssetsReport.jsx';
import { IncomeInsightsReport } from '../components/reports/IncomeInsightsReport.jsx';

const STEPS = [
  { title: 'Case Worker creates request', guide: '<p>Create a verification order with applicant PII. Truv sends the share link via email/SMS.</p><pre>POST /v1/orders/\n{\n  "first_name": "...",\n  "email": "...",\n  "phone": "...",\n  "products": ["income"]\n}</pre>' },
  { title: 'Applicant receives link', guide: '<p>The user receives an email/SMS with a verification link. They complete Bridge on their own device.</p><p>Monitor webhooks for status updates.</p>' },
  { title: 'Case Worker reviews results', guide: '<p>Once the user completes verification, fetch reports:</p><pre>POST /v1/users/{user_id}/reports/</pre>' },
];

const COMPLETED_APPLICANTS = [
  { firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com', phone: '+14155550101', products: ['income'], status: 'completed' },
  { firstName: 'Jane', lastName: 'Smith', email: 'jane.smith@example.com', phone: '+14155550102', products: ['income'], status: 'completed' },
  { firstName: 'Bob', lastName: 'Wilson', email: 'bob.wilson@example.com', phone: '+14155550103', products: ['assets'], status: 'completed' },
];

const VERIFIER_DIAGRAM = `sequenceDiagram
  participant BE as Your Backend
  participant Truv as Truv API
  participant User as Applicant
  BE->>Truv: POST /v1/orders/
  Note right of Truv: PII + email + phone + products
  Truv-->>BE: order_id, share_url
  Truv->>User: Email/SMS with share_url
  User->>Truv: Opens share_url, completes Bridge
  Truv->>BE: Webhook: order-status-updated
  BE->>Truv: POST /v1/users/{user_id}/reports/
  Truv-->>BE: Verification report`;

export function EmployeePortalDemo({ screen, param }) {
  const [introSeen, setIntroSeen] = useState(false);
  const [testApplicant, setTestApplicant] = useState(null);
  const [order, setOrder] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [creating, setCreating] = useState(false);
  const { panel, setCurrentStep, startPolling, reset: resetPanel } = usePanel();

  const showIntro = !introSeen;
  const showAddForm = introSeen && !testApplicant;
  const showTable = introSeen && testApplicant;

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
        setCurrentStep(1);
        if (data.user_id) startPolling(data.user_id);
      }
    } catch (e) { console.error(e); }
    setCreating(false);
  }

  // Watch webhooks for order completion
  useEffect(() => {
    if (!order) return;
    const isDone = panel.webhooks.some(w => {
      const p = parsePayload(w.payload);
      return (p.event_type === 'order-status-updated' && p.status === 'completed')
        || (w.event_type === 'order-status-updated' && w.status === 'completed');
    });
    if (isDone && !reportData) {
      setOrder(prev => ({ ...prev, status: 'completed' }));
      setCurrentStep(2);
      // Fetch reports via user reports endpoint
      (async () => {
        try {
          const uid = encodeURIComponent(order.user_id);
          const products = testApplicant?.products || [];
          const reports = {};
          const fetches = [];
          if (products.includes('income')) {
            fetches.push(
              fetch(`${API_BASE}/api/users/${uid}/reports/income`)
                .then(r => r.ok ? r.json() : null).then(d => { if (d) reports.income = d; })
            );
          }
          if (products.includes('employment')) {
            fetches.push(
              fetch(`${API_BASE}/api/users/${uid}/reports/employment`)
                .then(r => r.ok ? r.json() : null).then(d => { if (d) reports.employment = d; })
            );
          }
          if (products.includes('assets')) {
            fetches.push(
              fetch(`${API_BASE}/api/users/${uid}/reports/assets`)
                .then(r => r.ok ? r.json() : null).then(d => { if (d) reports.assets = d; })
            );
            fetches.push(
              fetch(`${API_BASE}/api/users/${uid}/reports/income_insights`)
                .then(r => r.ok ? r.json() : null).then(d => { if (d) reports.income_insights = d; })
            );
          }
          await Promise.all(fetches);
          setReportData(reports);
        } catch (e) { console.error(e); }
      })();
    }
  }, [panel.webhooks, order]);

  function resetDemo() {
    resetPanel();
    setIntroSeen(false);
    setTestApplicant(null);
    setOrder(null);
    setReportData(null);
    setCurrentStep(0);
  }

  return (
    <Layout badge="Public Sector · Case Worker Portal" steps={STEPS} panel={panel} hidePanel={showIntro || showAddForm}>

      {/* Intro */}
      {showIntro && (
        <IntroSlide
          label="Public Sector . Case Worker Portal"
          title="Verify without the applicant present"
          subtitle="A case worker creates verification orders using applicant data on file and sends verification links via email or SMS. Track completion from a dashboard."
          diagram={VERIFIER_DIAGRAM}
          actions={<button onClick={() => setIntroSeen(true)} class="w-full py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover text-center">Get started</button>}
        >
          <div class="grid gap-3">
            {[
              { name: 'Create orders from collected data', desc: 'Use PII from the application. No user interaction needed.' },
              { name: 'Truv sends verification links', desc: 'Email and SMS sent automatically to the applicant' },
              { name: 'Track status remotely', desc: 'Monitor webhook events and order status from the dashboard' },
              { name: 'Fetch reports on completion', desc: 'Pull VOIE, VOE, or VOA reports once the user completes Bridge' },
            ].map(item => (
              <div key={item.name} class="rounded-xl border border-[#e8e8ed] px-5 py-4">
                <h3 class="text-[14px] font-semibold text-[#171717] mb-1">{item.name}</h3>
                <p class="text-[13px] text-[#8E8E93] leading-[1.4]">{item.desc}</p>
              </div>
            ))}
          </div>
        </IntroSlide>
      )}

      {/* Add test applicant form */}
      {showAddForm && <AddApplicantForm onSubmit={setTestApplicant} />}

      {/* Dashboard table */}
      {showTable && (
        <div class="max-w-4xl mx-auto px-8 py-10">
          <h2 class="text-xl font-semibold tracking-tight mb-1 text-[#171717]">Applicants</h2>
          <p class="text-[13px] text-[#8E8E93] mb-5">Completed applicants shown for reference. Your test applicant will receive a verification link.</p>

          <div class="border border-[#d2d2d7] rounded-xl overflow-hidden bg-white mb-6">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-[#d2d2d7] bg-[#f5f5f7] text-[#8E8E93] text-[12px] font-medium uppercase tracking-wide">
                  <th class="text-left px-4 py-3">Name</th>
                  <th class="text-left px-4 py-3">Email</th>
                  <th class="text-left px-4 py-3">Phone</th>
                  <th class="text-left px-4 py-3">Products</th>
                  <th class="text-left px-4 py-3">Status</th>
                  <th class="text-right px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {COMPLETED_APPLICANTS.map((app, i) => (
                  <tr key={i} class="border-b border-[#f5f5f7]">
                    <td class="px-4 py-3 text-[#8E8E93]">{app.firstName} {app.lastName}</td>
                    <td class="px-4 py-3 text-[#8E8E93] font-mono text-[12px]">{app.email}</td>
                    <td class="px-4 py-3 text-[#8E8E93] font-mono text-[12px]">{app.phone}</td>
                    <td class="px-4 py-3">{app.products.map(p => <span key={p} class="inline-block text-[11px] font-medium bg-[#f5f5f7] text-[#8E8E93] px-2 py-0.5 rounded mr-1">{p}</span>)}</td>
                    <td class="px-4 py-3"><span class="text-[11px] font-semibold text-[#34c759] bg-green-50 px-2 py-0.5 rounded">completed</span></td>
                    <td class="px-4 py-3 text-right text-[12px] text-[#8E8E93]">—</td>
                  </tr>
                ))}

                {/* Test applicant */}
                <tr class="bg-[#fafafa]">
                  <td class="px-4 py-3 font-medium text-[#171717]">{testApplicant.firstName} {testApplicant.lastName}</td>
                  <td class="px-4 py-3 text-[#8E8E93] font-mono text-[12px]">{testApplicant.email || '—'}</td>
                  <td class="px-4 py-3 text-[#8E8E93] font-mono text-[12px]">{testApplicant.phone || '—'}</td>
                  <td class="px-4 py-3">{testApplicant.products.map(p => <span key={p} class="inline-block text-[11px] font-medium bg-primary-light text-primary px-2 py-0.5 rounded mr-1">{p}</span>)}</td>
                  <td class="px-4 py-3">
                    <span class={`text-[11px] font-semibold px-2 py-0.5 rounded ${order?.status === 'completed' ? 'text-[#34c759] bg-green-50' : order ? 'text-[#ff9f0a] bg-amber-50' : 'text-[#8E8E93] bg-[#f5f5f7]'}`}>
                      {order?.status || 'pending'}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-right">
                    {!order && (
                      <button class="px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-full hover:bg-primary-hover disabled:opacity-40" disabled={creating} onClick={handleRequest}>
                        {creating ? <span class="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Send Verification'}
                      </button>
                    )}
                    {order && order.status !== 'completed' && (
                      <span class="text-[11px] text-[#8E8E93]">Waiting for user...</span>
                    )}
                    {order?.status === 'completed' && (
                      <span class="text-[11px] text-[#34c759] font-medium">Done</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Share URL display */}
          {order?.share_url && (
            <div class="border border-[#d2d2d7] rounded-xl p-4 mb-6 bg-[#f5f5f7]">
              <div class="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wide mb-2">Share URL (sent to applicant)</div>
              <a href={order.share_url} target="_blank" class="text-[13px] text-primary font-mono break-all hover:underline">{order.share_url}</a>
            </div>
          )}

          {/* Webhook feed while waiting */}
          {order && order.status !== 'completed' && (
            <div class="mb-6">
              <div class="text-[13px] font-medium text-[#171717] mb-3">Waiting for verification...</div>
              <WebhookFeed webhooks={panel.webhooks} />
            </div>
          )}

          {/* Report when completed */}
          {reportData && (
            <div class="border border-[#d2d2d7] rounded-xl p-6 bg-white">
              <h3 class="text-lg font-semibold text-[#171717] mb-4">Verification Report</h3>
              {reportData.income && <VoieReport report={reportData.income} />}
              {reportData.employment && <VoieReport report={reportData.employment} />}
              {reportData.assets && <AssetsReport report={reportData.assets} />}
              {reportData.income_insights && <IncomeInsightsReport report={reportData.income_insights} />}
            </div>
          )}

          <div class="mt-6 pt-5 border-t border-[#d2d2d7]">
            <button class="px-5 py-2.5 text-sm font-semibold border border-[#e8e8ed] rounded-full hover:border-primary hover:text-primary" onClick={resetDemo}>Start Over</button>
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
          <h2 class="text-[28px] font-semibold tracking-[-0.02em] text-[#171717] mb-2">Add Test Applicant</h2>
          <p class="text-[15px] text-[#8E8E93] leading-[1.5]">
            Enter applicant details. Truv will send the verification link via email and/or SMS.
          </p>
        </div>

        <form onSubmit={handleSubmit} class="animate-slideUp delay-1 text-left">
          <div class="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label class="text-[13px] font-medium text-[#171717] mb-1.5 block">First name</label>
              <input value={firstName} onInput={e => setFirstName(e.target.value)} placeholder="John" class="w-full px-3.5 py-2.5 border border-[#d2d2d7] rounded-lg text-sm focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label class="text-[13px] font-medium text-[#171717] mb-1.5 block">Last name</label>
              <input value={lastName} onInput={e => setLastName(e.target.value)} placeholder="Doe" class="w-full px-3.5 py-2.5 border border-[#d2d2d7] rounded-lg text-sm focus:border-primary focus:outline-none" />
            </div>
          </div>
          <div class="mb-3">
            <label class="text-[13px] font-medium text-[#171717] mb-1.5 block">Email</label>
            <input type="email" value={email} onInput={e => setEmail(e.target.value)} placeholder="john@example.com" class="w-full px-3.5 py-2.5 border border-[#d2d2d7] rounded-lg text-sm focus:border-primary focus:outline-none" />
            <p class="text-[11px] text-[#8E8E93] mt-1">Truv sends the verification link to this email</p>
          </div>
          <div class="mb-3">
            <label class="text-[13px] font-medium text-[#171717] mb-1.5 block">Phone</label>
            <input type="tel" value={phone} onInput={e => setPhone(e.target.value)} placeholder="+14155551234" class="w-full px-3.5 py-2.5 border border-[#d2d2d7] rounded-lg text-sm focus:border-primary focus:outline-none" />
            <p class="text-[11px] text-[#8E8E93] mt-1">Truv sends the verification link via SMS</p>
          </div>
          <div class="mb-5">
            <label class="text-[13px] font-medium text-[#171717] mb-1.5 block">Product</label>
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
