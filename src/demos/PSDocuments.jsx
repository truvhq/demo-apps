import { useState, useRef, useEffect } from 'preact/hooks';
import { Layout, OrderResults, WebhookFeed, usePanel, API_BASE, parsePayload, IntroSlide } from '../components/index.js';

const STEPS = [
  { title: 'Upload applicant documents', guide: '<p>Send collected documents to Truv for validation and classification:</p><pre>POST /v1/documents/collections/\n{\n  "documents": [{ "filename": "...", "content": "base64..." }],\n  "users": [{ "id": "..." }]\n}</pre><p>Optionally attach to an existing Truv user via the <code>users</code> field.</p>' },
  { title: 'Truv validates documents', guide: '<p>Truv validates each document:</p><ul><li><code>is_valid</code> — recognized document type</li><li><code>is_readable</code> — text is extractable</li><li><code>document_type</code> — paystub, w2, etc.</li></ul><p>Poll the collection status until all documents are processed.</p>' },
  { title: 'Truv extracts income data', guide: '<p>Once validated, finalize the collection to extract structured data:</p><pre>POST /v1/documents/collections/{id}/finalize/</pre>' },
  { title: 'Review structured results', guide: '<p>Fetch the extracted data:</p><pre>GET /v1/documents/collections/{id}/finalize/</pre><p>Returns parsed fields: employer name, pay period, gross/net pay, tax withholdings, etc.</p>' },
];

// Test documents stored in server/test-docs/ (from Truv S3)
// See: https://docs.truv.com/docs/testing#document-processing-testing
const SAMPLE_DOCS = [
  { name: 'most-recent-paystub.pdf', type: 'Pay Stub (Most Recent)', icon: '📄' },
  { name: 'next-recent-paystub.pdf', type: 'Pay Stub (Next Recent)', icon: '📄' },
  { name: 'first-paystub.pdf', type: 'Pay Stub (First)', icon: '📄' },
];

const DOC_DIAGRAM = `sequenceDiagram
  participant App as Benefits Portal
  participant Truv as Truv API
  App->>Truv: POST /v1/users/
  Truv-->>App: user_id
  App->>Truv: POST /v1/documents/collections/
  Note right of Truv: documents with base64 + user_id
  Truv-->>App: collection_id
  loop Poll until files successful
    App->>Truv: GET /v1/documents/collections/{id}/
    Truv-->>App: uploaded_files status
  end
  App->>Truv: POST /v1/documents/collections/{id}/finalize/
  Note right of Truv: { product_type: "income" }
  Truv-->>App: link_id
  Truv->>App: Webhook: task-status-updated (done)
  App->>Truv: GET /v1/links/{link_id}/income/report/
  Truv-->>App: VOIE Report`;

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

export function PSDocumentsDemo() {
  const [screen, setScreen] = useState('intro');
  const [userId, setUserId] = useState('');
  const [files, setFiles] = useState([]);
  const [truvUserId, setTruvUserId] = useState(null);
  const [collectionId, setCollectionId] = useState(null);
  const [orderData, setOrderData] = useState(null);
  const [processing, setProcessing] = useState(false);

  const { panel, setCurrentStep, startPolling, reset: resetPanel } = usePanel();

  const isIntro = screen === 'intro' || screen === 'upload';

  function addFiles(newFiles) {
    Array.from(newFiles).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        setFiles(prev => [...prev, { name: file.name, size: file.size, type: file.type, base64 }]);
      };
      reader.readAsDataURL(file);
    });
  }

  const pollRef = useRef(null);
  const linkIdRef = useRef(null);

  async function processDocuments() {
    setProcessing(true);
    try {
      // Step 1: Create collection — always include test docs, plus any user uploads
      const body = { external_user_id: userId.trim() || undefined, use_test_docs: true };
      if (files.length > 0) {
        body.extra_documents = files.map(f => ({ filename: f.name, mime_type: f.type || 'application/pdf', content: f.base64 }));
      }
      const createResp = await fetch(`${API_BASE}/api/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const createData = await createResp.json();
      if (!createResp.ok) { alert('Error: ' + (createData.error || 'Unknown')); setProcessing(false); return; }

      const cid = createData.collection_id;
      const uid = createData.user_id;
      setCollectionId(cid);
      setTruvUserId(uid);
      if (uid) startPolling(uid);
      setCurrentStep(1);
      setScreen('processing');

      // Step 2: Poll until all files are successful
      const waitForFiles = async () => {
        try {
          const resp = await fetch(`${API_BASE}/api/collections/${cid}`);
          const data = await resp.json();
          const files = data.raw_response?.uploaded_files || [];
          const allOk = files.length > 0 && files.every(f => f.status === 'successful');
          if (!allOk) { pollRef.current = setTimeout(waitForFiles, 3000); return; }

          // Step 3: Finalize with product_type
          setCurrentStep(2);
          await fetch(`${API_BASE}/api/collections/${cid}/finalize`, { method: 'POST' });
          // Step 4: Wait for webhook (handled by useEffect below)
        } catch (e) { console.error(e); pollRef.current = setTimeout(waitForFiles, 3000); }
      };
      pollRef.current = setTimeout(waitForFiles, 3000);
    } catch (e) { console.error(e); }
    setProcessing(false);
  }

  // Watch webhooks for task-status-updated with status "done" → get link_id → fetch report
  useEffect(() => {
    if (screen !== 'processing' || !collectionId) return;
    const doneWebhook = panel.webhooks.find(w => {
      const p = parsePayload(w.payload);
      return (p.event_type === 'task-status-updated' && p.status === 'done')
        || (w.event_type === 'task-status-updated' && w.status === 'done');
    });
    if (doneWebhook && !linkIdRef.current) {
      const p = parsePayload(doneWebhook.payload);
      const linkId = p.link_id || doneWebhook.link_id;
      if (!linkId) return;
      linkIdRef.current = linkId;
      setCurrentStep(3);

      // Step 5: Fetch income report via link_id
      (async () => {
        try {
          const resp = await fetch(`${API_BASE}/api/collections/${collectionId}/report?link_id=${linkId}`);
          if (resp.ok) setOrderData(await resp.json());
        } catch (e) { console.error(e); }
        setScreen('review');
      })();
    }
  }, [panel.webhooks, screen, collectionId]);

  function resetDemo() {
    if (pollRef.current) clearTimeout(pollRef.current);
    linkIdRef.current = null;
    resetPanel();
    setScreen('intro');
    setUserId('');
    setFiles([]);
    setTruvUserId(null);
    setCollectionId(null);
    setOrderData(null);
    setCurrentStep(0);
  }

  return (
    <Layout badge="Public Sector · Document Processing" steps={STEPS} panel={panel} hidePanel={isIntro}>
      {screen === 'intro' && (
        <IntroSlide
          label="Public Sector . Document Processing"
          title="Extract income data from applicant documents"
          subtitle="Process pay stubs, W-2s, and tax returns submitted by applicants. Truv validates the documents and extracts structured income data for eligibility decisions."
          diagram={DOC_DIAGRAM}
          actions={<button onClick={() => setScreen('upload')} class="py-3 px-8 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover">Get started</button>}
        >
          <div class="grid grid-cols-2 gap-3">
            {[
              { name: 'Pay Stubs', desc: 'Gross/net pay, deductions, employer info, pay period' },
              { name: 'W-2 Forms', desc: 'Annual wages, federal/state taxes, employer EIN' },
              { name: 'Tax Returns (1040)', desc: 'Filed income, AGI, tax liability' },
              { name: 'Bank Statements', desc: 'Deposits, withdrawals, account balances' },
            ].map(d => (
              <div key={d.name} class="border border-[#d2d2d7]/60 rounded-2xl px-5 py-4 bg-white/80 backdrop-blur-sm">
                <h3 class="text-[14px] font-semibold text-[#171717] mb-1">{d.name}</h3>
                <p class="text-[13px] text-[#8E8E93] leading-[1.4]">{d.desc}</p>
              </div>
            ))}
          </div>
        </IntroSlide>
      )}
      {screen === 'upload' && (
        <UploadScreen
          files={files}
          onAddFiles={addFiles}
          onRemoveFile={idx => setFiles(prev => prev.filter((_, i) => i !== idx))}
          userId={userId}
          onUserIdChange={setUserId}
          onBack={() => setScreen('intro')}
          onContinue={processDocuments}
          processing={processing}
        />
      )}
      <div class={isIntro ? 'hidden' : 'max-w-xl mx-auto px-8 py-10'}>
        {screen === 'processing' && (
          <div class="text-center py-16">
            <div class="w-12 h-12 border-[3px] border-[#d2d2d7] border-t-primary rounded-full animate-spin mx-auto mb-6" />
            <h2 class="text-2xl font-semibold tracking-tight mb-2">Processing Documents</h2>
            <p class="text-[15px] text-[#8E8E93] mb-8">Waiting for Truv to process and extract data...</p>
            <WebhookFeed webhooks={panel.webhooks} />
          </div>
        )}
        {screen === 'review' && (
          <div>
            <h2 class="text-2xl font-semibold tracking-tight mb-1.5">Verification Results</h2>
            <p class="text-[15px] text-[#8E8E93] mb-7">Documents processed via Document Collections API</p>
            {orderData ? <OrderResults data={orderData} /> : <p class="text-[#8E8E93]">No report data available yet.</p>}
            <div class="flex gap-3 mt-6 pt-5 border-t border-[#d2d2d7]">
              <button class="px-5 py-2.5 text-sm font-semibold border border-[#d2d2d7] rounded-full hover:border-primary hover:text-primary" onClick={resetDemo}>Process More</button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function UploadScreen({ files, onAddFiles, onRemoveFile, userId, onUserIdChange, onBack, onContinue, processing }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  return (
    <div class="intro-slide" style="justify-content: flex-start; padding-top: 2rem;">
      <div class="w-full max-w-lg mx-auto px-4">
        <div class="animate-slideUp">
          <h2 class="text-[28px] font-semibold tracking-[-0.02em] text-[#171717] mb-2">Upload Documents</h2>
          <p class="text-[15px] text-[#8E8E93] leading-[1.5] mb-6">
            Upload your own pay stubs, W-2s, or tax returns, or use the pre-loaded test documents.
            <a href="https://docs.truv.com/docs/testing#document-processing-testing" target="_blank" class="text-primary ml-1 hover:underline">Download test files</a>
          </p>
        </div>

        <div class="animate-slideUp delay-1 text-left">
          {/* Drag-drop zone */}
          <div
            role="button"
            tabIndex={0}
            class={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all mb-4 ${dragOver ? 'border-primary bg-[#f5f8ff]' : 'border-[#d2d2d7] hover:border-[#8E8E93]'}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); onAddFiles(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
          >
            <div class="text-[15px] font-medium text-[#171717] mb-1">Drop files here or click to browse</div>
            <div class="text-[13px] text-[#8E8E93]">PDF, JPEG, PNG, TIFF</div>
            <input ref={inputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif" class="hidden" onChange={e => { onAddFiles(e.target.files); e.target.value = ''; }} />
          </div>

          {/* Test documents — always visible */}
          <div class="border border-[#d2d2d7] rounded-xl p-4 mb-4">
            <div class="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wide mb-2">Test documents (included)</div>
            {SAMPLE_DOCS.map((d, i) => (
              <div key={i} class="flex items-center gap-3 py-1.5 text-[13px]">
                <span>📄</span>
                <span class="flex-1 text-[#8E8E93]">{d.name}</span>
                <span class="text-[11px] text-[#34c759] font-medium">Ready</span>
              </div>
            ))}
          </div>

          {/* Uploaded files list */}
          {files.length > 0 && (
            <div class="mb-4">
              <div class="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wide mb-2">Your documents ({files.length})</div>
              {files.map((f, i) => (
                <div key={i} class="flex items-center gap-3 px-4 py-2.5 border border-[#d2d2d7] rounded-lg mb-2">
                  <span class="text-base">📄</span>
                  <div class="flex-1 min-w-0">
                    <div class="text-[13px] font-medium truncate text-[#171717]">{f.name}</div>
                    <div class="text-[11px] text-[#8E8E93]">{formatSize(f.size)}</div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); onRemoveFile(i); }} class="text-[#8E8E93] hover:text-[#ff3b30] text-lg leading-none">&times;</button>
                </div>
              ))}
            </div>
          )}

          {/* User ID */}
          <input
            value={userId}
            onInput={e => onUserIdChange(e.target.value)}
            placeholder="external_user_id (optional)"
            class="w-full px-4 py-3 border border-[#d2d2d7] rounded-xl text-sm font-mono focus:border-primary focus:outline-none mb-4 text-center"
          />

          <div class="flex gap-3">
            <button onClick={onBack} class="flex-1 py-3 border border-[#d2d2d7] text-[#171717] font-semibold rounded-full hover:bg-[#f5f5f7]">Back</button>
            <button onClick={onContinue} disabled={processing} class="flex-1 py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover disabled:opacity-40">
              {processing ? 'Processing...' : 'Process Documents'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
