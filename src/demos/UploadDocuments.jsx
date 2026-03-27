import { useState, useRef, useEffect } from 'preact/hooks';
import { Layout, usePanel, API_BASE, IntroSlide } from '../components/index.js';

const STEPS = [
  { title: 'Process documents', guide: '<p>Send collected documents to Truv for validation and classification:</p><pre>POST /v1/documents/collections/\n{\n  "documents": [{ "filename": "...", "content": "base64..." }],\n  "users": [{ "id": "..." }]\n}</pre><p>Optionally attach to an existing Truv user via the <code>users</code> field.</p>' },
  { title: 'Validation', guide: '<p>Truv validates each document:</p><ul><li><code>is_valid</code> — recognized document type</li><li><code>is_readable</code> — text is extractable</li><li><code>document_type</code> — paystub, w2, etc.</li></ul><p>Poll the collection status until all documents are processed.</p>' },
  { title: 'Finalize', guide: '<p>Once validated, finalize the collection to extract structured data:</p><pre>POST /v1/documents/collections/{id}/finalize/</pre>' },
  { title: 'Review', guide: '<p>Fetch the extracted data:</p><pre>GET /v1/documents/collections/{id}/finalize/</pre><p>Returns parsed fields: employer name, pay period, gross/net pay, tax withholdings, etc.</p>' },
];

// Test documents stored in server/test-docs/ (from Truv S3)
// See: https://docs.truv.com/docs/testing#document-processing-testing
const SAMPLE_DOCS = [
  { name: 'most-recent-paystub.pdf', type: 'Pay Stub (Most Recent)', icon: '📄' },
  { name: 'next-recent-paystub.pdf', type: 'Pay Stub (Next Recent)', icon: '📄' },
  { name: 'first-paystub.pdf', type: 'Pay Stub (First)', icon: '📄' },
];

const DOC_DIAGRAM = `sequenceDiagram
  participant App as Your App
  participant Truv as Truv API
  App->>Truv: POST /v1/users/
  Truv-->>App: user_id
  App->>Truv: POST /v1/documents/collections/
  Note right of Truv: { documents: [base64...], users: [{id}] }
  Truv-->>App: collection_id
  App->>Truv: POST /v1/documents/collections/{id}/finalize/
  Truv-->>App: Extraction started
  loop Poll until links status = done
    App->>Truv: GET /v1/documents/collections/{id}/finalize/
    Truv-->>App: users, links, documents, parsed_data
  end`;

export function UploadDocumentsDemo() {
  const [screen, setScreen] = useState('intro');
  const [userId, setUserId] = useState('');
  const [collectionId, setCollectionId] = useState(null);
  const [resultsData, setResultsData] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [introStep, setIntroStep] = useState(1);

  const pollRef = useRef(null);
  const { panel, setCurrentStep } = usePanel();

  const isIntro = screen === 'intro';

  async function processDocuments() {
    setProcessing(true);
    try {
      // Step 1: Create collection with test documents
      const createResp = await fetch(`${API_BASE}/api/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ use_test_docs: true, user_id: userId.trim() || undefined }),
      });
      const createData = await createResp.json();
      if (!createResp.ok) { alert('Error: ' + (createData.error || 'Unknown')); setProcessing(false); return; }

      const cid = createData.collection_id;
      setCollectionId(cid);
      setCurrentStep(1);
      setScreen('processing');

      // Step 2: Poll collection status until all files are processed
      const waitForProcessing = async () => {
        try {
          const resp = await fetch(`${API_BASE}/api/collections/${cid}`);
          const data = await resp.json();
          const files = data.raw_response?.uploaded_files || [];
          const allProcessed = files.length > 0 && files.every(f => f.status === 'successful');
          if (!allProcessed) {
            pollRef.current = setTimeout(waitForProcessing, 3000);
            return;
          }

          // Step 3: Finalize (start extraction)
          setCurrentStep(2);
          await fetch(`${API_BASE}/api/collections/${cid}/finalize`, { method: 'POST' });

          // Step 4: Poll results until links[].status === "done"
          const pollResults = async () => {
            try {
              const resp2 = await fetch(`${API_BASE}/api/collections/${cid}/results`);
              const data2 = await resp2.json();
              const hasUsers = data2.users?.length > 0;
              const allDone = hasUsers && data2.users.every(u => u.links?.length > 0 && u.links.every(l => l.status === 'done'));
              if (allDone) {
                setResultsData(data2);
                setCurrentStep(3);
                setScreen('review');
              } else {
                pollRef.current = setTimeout(pollResults, 3000);
              }
            } catch (e) { console.error(e); pollRef.current = setTimeout(pollResults, 3000); }
          };
          pollRef.current = setTimeout(pollResults, 3000);
        } catch (e) { console.error(e); pollRef.current = setTimeout(waitForProcessing, 3000); }
      };
      pollRef.current = setTimeout(waitForProcessing, 3000);
    } catch (e) { console.error(e); }
    setProcessing(false);
  }

  function resetDemo() {
    if (pollRef.current) clearTimeout(pollRef.current);
    setScreen('intro');
    setIntroStep(1);
    setUserId('');
    setCollectionId(null);
    setResultsData(null);
    setCurrentStep(0);
  }

  return (
    <Layout title="Truv Quickstart" badge="Document Processing" steps={STEPS} panel={panel} hidePanel={isIntro}>
      {screen === 'intro' && introStep === 2 && (
        <IntroSlide
          label="Document Processing → Architecture"
          title="Processing pipeline"
          subtitle="Documents are uploaded, validated, then finalized to extract structured data."
          diagram={DOC_DIAGRAM}
        >
          <div class="w-full max-w-sm mx-auto">
            <div class="border border-[#d2d2d7] rounded-xl p-4 mb-4 text-left">
              <div class="text-[11px] font-semibold text-[#86868b] uppercase tracking-wide mb-3">Test documents</div>
              {SAMPLE_DOCS.map((d, i) => (
                <div key={i} class="flex items-center gap-3 py-2 border-t border-[#f5f5f7] first:border-0">
                  <span class="text-base">{d.icon}</span>
                  <div class="flex-1 min-w-0">
                    <div class="text-[13px] font-medium truncate text-[#1d1d1f]">{d.name}</div>
                    <div class="text-[11px] text-[#86868b]">{d.type}</div>
                  </div>
                  <span class="text-[11px] text-[#34c759] font-medium">Ready</span>
                </div>
              ))}
            </div>
            <input
              value={userId}
              onInput={e => setUserId(e.target.value)}
              placeholder="User ID (optional)"
              class="w-full px-4 py-3 border border-[#d2d2d7] rounded-xl text-sm font-mono focus:border-primary focus:outline-none mb-3 text-center"
            />
            <div class="flex gap-3">
              <button onClick={() => setIntroStep(1)} class="flex-1 py-3 border border-[#d2d2d7] text-[#1d1d1f] font-semibold rounded-full hover:bg-[#f5f5f7]">Back</button>
              <button onClick={processDocuments} disabled={processing} class="flex-1 py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover disabled:opacity-40">
                {processing ? 'Processing...' : 'Continue'}
              </button>
            </div>
          </div>
        </IntroSlide>
      )}

      {screen === 'intro' && introStep === 1 && (
        <div class="intro-slide">
          <div class="relative z-10 w-full max-w-2xl mx-auto px-4">
            <div class="animate-slideUp">
              <div class="text-[12px] font-medium uppercase tracking-[0.08em] text-primary mb-4">Document Processing</div>
              <h2 class="text-[36px] font-semibold tracking-[-0.03em] leading-[1.1] text-[#1d1d1f] mb-4">Extract data from<br />collected documents</h2>
              <p class="text-[17px] text-[#86868b] leading-[1.5] max-w-[440px] mx-auto mb-7">
                Process pay stubs, W-2s, and tax returns already collected during the application. No payroll connection needed.
              </p>
            </div>
            <div class="grid grid-cols-2 gap-3 mb-8 text-left max-w-lg mx-auto animate-slideUp delay-1">
              {[
                { name: 'Pay Stubs', desc: 'Gross/net pay, deductions, employer info, pay period' },
                { name: 'W-2 Forms', desc: 'Annual wages, federal/state taxes, employer EIN' },
                { name: 'Tax Returns (1040)', desc: 'Filed income, AGI, tax liability' },
                { name: 'Bank Statements', desc: 'Deposits, withdrawals, account balances' },
              ].map(d => (
                <div key={d.name} class="border border-[#d2d2d7] rounded-2xl px-5 py-4 bg-white">
                  <h3 class="text-[14px] font-semibold text-[#1d1d1f] mb-1">{d.name}</h3>
                  <p class="text-[13px] text-[#6e6e73] leading-[1.4]">{d.desc}</p>
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
      <div class={isIntro ? 'hidden' : 'max-w-xl mx-auto px-8 py-10'}>
        {screen === 'processing' && (
          <div class="text-center py-16">
            <div class="w-12 h-12 border-[3px] border-[#d2d2d7] border-t-primary rounded-full animate-spin mx-auto mb-6" />
            <h2 class="text-2xl font-semibold tracking-tight mb-2">Processing Documents</h2>
            <p class="text-[15px] text-[#86868b]">Creating collection, finalizing, and extracting data...</p>
          </div>
        )}
        {screen === 'review' && (
          <ReviewScreen data={resultsData} onReset={resetDemo} />
        )}
      </div>
    </Layout>
  );
}

function ReviewScreen({ data, onReset }) {
  // Extract documents from users[].links[].documents[]
  const allDocs = [];
  (data?.users || []).forEach(user => {
    (user.links || []).forEach(link => {
      (link.documents || []).forEach(doc => allDocs.push(doc));
    });
  });

  return (
    <div>
      <h2 class="text-2xl font-semibold tracking-tight mb-1.5">Extracted Data</h2>
      <p class="text-[15px] text-[#86868b] mb-7">{allDocs.length} document{allDocs.length !== 1 ? 's' : ''} processed</p>

      {allDocs.map((doc, i) => (
        <div key={doc.id || i} class="border border-[#d2d2d7] rounded-xl mb-4 overflow-hidden">
          <div class="px-4 py-3 bg-[#f5f5f7] border-b border-[#d2d2d7] flex items-center justify-between">
            <span class="text-sm font-semibold text-[#1d1d1f]">{doc.document_type || `Document ${i + 1}`}</span>
            {doc.document_subtype && <span class="text-[11px] text-[#86868b] font-mono">{doc.document_subtype}</span>}
          </div>
          <div class="p-4">
            {doc.parsed_data && Object.keys(doc.parsed_data).length > 0 ? (
              Object.entries(doc.parsed_data).map(([key, val]) => (
                <div key={key} class="grid grid-cols-[180px_1fr] border-b border-[#f5f5f7] last:border-0">
                  <div class="py-2 text-sm text-[#86868b] font-medium">{key.replace(/_/g, ' ')}</div>
                  <div class="py-2 text-sm font-medium text-[#1d1d1f]">{typeof val === 'object' ? JSON.stringify(val) : String(val)}</div>
                </div>
              ))
            ) : (
              <pre class="text-xs font-mono text-[#86868b] whitespace-pre-wrap max-h-48 overflow-auto">{JSON.stringify(doc, null, 2)}</pre>
            )}
          </div>
        </div>
      ))}

      <div class="flex gap-3 mt-6 pt-5 border-t border-[#d2d2d7]">
        <button class="px-5 py-2.5 text-sm font-semibold border border-[#d2d2d7] rounded-full hover:border-primary hover:text-primary" onClick={onReset}>Process More</button>
      </div>
    </div>
  );
}
