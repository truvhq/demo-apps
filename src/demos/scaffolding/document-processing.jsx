// Presentation scaffolding for DocumentProcessing demo.
// Extracted so the demo file contains only Truv API workflow code.

import { useState, useRef } from 'preact/hooks';

export const STEPS = [
  { title: 'Upload borrower documents', guide: '<p>Send collected documents to Truv for validation and classification:</p><pre>POST /v1/documents/collections/\n{\n  "documents": [{ "filename": "...", "content": "base64..." }],\n  "users": [{ "id": "..." }]\n}</pre><p>Optionally attach to an existing Truv user via the <code>users</code> field.</p>' },
  { title: 'Truv validates documents', guide: '<p>Truv validates each document:</p><ul><li><code>is_valid</code> — recognized document type</li><li><code>is_readable</code> — text is extractable</li><li><code>document_type</code> — paystub, w2, etc.</li></ul><p>Poll the collection status until all documents are processed.</p>' },
  { title: 'Truv extracts income data', guide: '<p>Once validated, finalize the collection to extract structured data:</p><pre>POST /v1/documents/collections/{id}/finalize/</pre>' },
  { title: 'Review structured results', guide: '<p>Fetch the extracted data:</p><pre>GET /v1/documents/collections/{id}/finalize/</pre><p>Returns parsed fields: employer name, pay period, gross/net pay, tax withholdings, etc.</p>' },
];

// Test documents stored in server/test-docs/ (from Truv S3)
// See: https://docs.truv.com/docs/testing#document-processing-testing
export const SAMPLE_DOCS = [
  { name: 'most-recent-paystub.pdf', type: 'Pay Stub (Most Recent)', icon: '📄' },
  { name: 'next-recent-paystub.pdf', type: 'Pay Stub (Next Recent)', icon: '📄' },
  { name: 'first-paystub.pdf', type: 'Pay Stub (First)', icon: '📄' },
];

export const INTRO_SLIDE_CONFIG = {
  label: 'Mortgage . Document Processing',
  title: 'Extract income data from documents',
  subtitle: 'Upload pay stubs, W-2s, and tax returns already collected. Truv validates the documents and extracts structured income data for underwriting.',
};

export const FEATURE_CARDS = [
  { name: 'Pay Stubs', desc: 'Gross/net pay, deductions, employer info, pay period' },
  { name: 'W-2 Forms', desc: 'Annual wages, federal/state taxes, employer EIN' },
  { name: 'Tax Returns (1040)', desc: 'Filed income, AGI, tax liability' },
  { name: 'Bank Statements', desc: 'Deposits, withdrawals, account balances' },
];

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

export function UploadScreen({ files, onAddFiles, onRemoveFile, userId, onUserIdChange, onBack, onContinue, processing }) {
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

          <div class="flex gap-3">
            <button onClick={onBack} class="flex-1 py-3 border border-[#e8e8ed] font-semibold rounded-full hover:border-primary hover:text-primary">Back</button>
            <button onClick={onContinue} disabled={processing} class="flex-1 py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover disabled:opacity-40">
              {processing ? 'Processing...' : 'Process Documents'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
