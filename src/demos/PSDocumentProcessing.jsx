// PSDocumentProcessing.jsx -- Public Sector demo: Document Processing
//
// Same Document Collections API flow as DocumentProcessing.jsx but with
// government-specific labels (applicant instead of borrower).
//
// SCREEN FLOW (state-driven):
//   'intro'      -> Intro slide with architecture diagram
//   'upload'     -> File picker + sample test documents
//   'processing' -> Polling collection status, then finalize + webhook wait
//   'review'     -> Extracted income data results
//
// API FLOW:
//   1. POST /api/collections           -> create user + document collection
//   2. GET  /api/collections/:id       -> poll until all files are "successful"
//   3. POST /api/collections/:id/finalize -> trigger data extraction
//   4. Wait for task-status-updated webhook with status "done"
//   5. GET  /api/collections/:id/report   -> fetch extracted income data

import { useState, useRef, useEffect } from 'preact/hooks';
import { Layout, OrderResults, WebhookFeed, usePanel, API_BASE, parsePayload, IntroSlide } from '../components/index.js';
import { DOC_DIAGRAM } from '../diagrams/ps-document-processing.js';
import { STEPS, INTRO_SLIDE_CONFIG, FEATURE_CARDS, UploadScreen } from './scaffolding/ps-document-processing.jsx';

export function PSDocumentProcessingDemo() {
  const [screen, setScreen] = useState('intro');
  const [userId, setUserId] = useState('');
  const [files, setFiles] = useState([]);
  const [truvUserId, setTruvUserId] = useState(null);
  const [collectionId, setCollectionId] = useState(null);
  const [orderData, setOrderData] = useState(null);
  const [processing, setProcessing] = useState(false);

  const { panel, setCurrentStep, startPolling, pollOnceAndStop, reset: resetPanel } = usePanel();

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
        pollOnceAndStop();
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
          label={INTRO_SLIDE_CONFIG.label}
          title={INTRO_SLIDE_CONFIG.title}
          subtitle={INTRO_SLIDE_CONFIG.subtitle}
          diagram={DOC_DIAGRAM}
          actions={<button onClick={() => setScreen('upload')} class="w-full py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover text-center">Get started</button>}
        >
          <div class="grid grid-cols-2 gap-3">
            {FEATURE_CARDS.map(d => (
              <div key={d.name} class="rounded-xl border border-[#e8e8ed] px-5 py-4">
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
              <button class="px-5 py-2.5 text-sm font-semibold border border-[#e8e8ed] rounded-full hover:border-primary hover:text-primary" onClick={resetDemo}>Process More</button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
