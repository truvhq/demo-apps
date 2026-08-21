import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { Button, Card, Select, setGuideProgress } from '@truv-demo/design-system';

import { api } from '../../api.js';
import { Layout } from '../../components/Layout.jsx';
import { BridgeEmbedScreen } from './BridgeEmbedScreen.jsx';
import { CoverageResultsScreen } from './CoverageResultsScreen.jsx';
import { DocumentUploadScreen } from './DocumentUploadScreen.jsx';
import { IntegrationMethodSelector } from './IntegrationMethodSelector.jsx';
import { ProductFieldConsole } from './ProductFieldConsole.jsx';
import { sanitizeProductsForMethod } from './productRules.js';

const STEP_PROFILES = [
  { key: 'employment', label: 'Employment / Income' },
  { key: 'assets', label: 'Assets' },
  { key: 'liabilities', label: 'Liabilities' },
  { key: 'combined', label: 'Combined Income & Assets' },
];

/** LOS's own "Configure Truv" developer console — mirrors POS's exactly
 * (same StepVerificationConfig concept, same request-preview console), but
 * runs against LOS's own VerificationRequest model: a processor can trigger
 * a brand-new Truv verification directly from the loan file, not just
 * refresh an order POS already created.
 *
 * Reachable two ways: from the left nav (no loan file pre-selected — pick
 * one from the console itself), or with `:id` in the URL (the old per-
 * loan-file entry point, kept working for any existing deep links). */
export function VerificationScreen() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [loanFiles, setLoanFiles] = useState([]);
  const [targetId, setTargetId] = useState(routeId || '');
  const [application, setApplication] = useState(null);
  const [stepKey, setStepKey] = useState(searchParams.get('stepKey') || 'employment');
  const [config, setConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [phase, setPhase] = useState('configure');
  const [verificationRequest, setVerificationRequest] = useState(null);
  const [applyResult, setApplyResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const returnUrl = routeId ? `/loan-files/${routeId}` : '/';

  useEffect(() => { api.listLoanFiles().then(setLoanFiles); }, []);

  useEffect(() => {
    if (!targetId) { setApplication(null); return; }
    api.getLoanFile(targetId).then(setApplication);
  }, [targetId]);

  useEffect(() => {
    setConfigLoading(true);
    setSaveMessage('');
    api.getStepConfig(stepKey).then((saved) => {
      setConfig({
        integration_method: saved.integration_method,
        products: saved.products,
        data_sources: saved.data_sources,
        template_id: saved.template_id,
        employer_name: saved.employer_name,
        company_mapping_id: saved.company_mapping_id,
        provider_id: saved.provider_id,
        fetch_liabilities: saved.fetch_liabilities,
      });
      setConfigLoading(false);
    });
  }, [stepKey]);

  // Feeds the Dev Panel's Guide tab — reports "step 0, not yet started" for
  // whichever method is selected any time we're back at the configure phase.
  useEffect(() => {
    if (config && phase === 'configure') setGuideProgress(config.integration_method, 0);
  }, [config?.integration_method, phase]);

  if (!config) return <Layout><p>Loading…</p></Layout>;

  const requestPreview = { loan_application: application?.id ?? null, ...config };

  async function handleSaveConfig() {
    setSaving(true);
    setSaveMessage('');
    try {
      await api.saveStepConfig(stepKey, config);
      setSaveMessage(`Saved — this profile will be reused next time "${STEP_PROFILES.find((p) => p.key === stepKey).label}" is run from LOS.`);
    } catch (e) {
      setSaveMessage(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setErrorMessage('');
    try {
      const vr = await api.createVerificationRequest(requestPreview);
      setVerificationRequest(vr);
      if (vr.status === 'error') {
        setErrorMessage(vr.raw_response?.error?.message || vr.raw_response?.error || 'Truv is not configured — add a credential set in Settings first.');
        setPhase('configure');
        return;
      }
      if (config.integration_method === 'hosted_order') {
        setGuideProgress(config.integration_method, 1);
        setPhase('hosted');
      } else if (vr.bridge_token) {
        setGuideProgress(config.integration_method, 1);
        setPhase('bridge');
      } else if (config.integration_method === 'document_upload') {
        setGuideProgress(config.integration_method, 1);
        setPhase('document');
      } else {
        setPhase('configure');
        setErrorMessage('No bridge_token returned — check the Activity Log or the credential Test result for details.');
      }
    } catch (e) {
      setErrorMessage(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBridgeSuccess() {
    setGuideProgress(config.integration_method, 2);
    setPhase('applying');
    setErrorMessage('');
    try {
      const result = await api.applyVerificationRequest(verificationRequest.id);
      setApplyResult(result);
      setGuideProgress(config.integration_method, 3);
      setPhase('results');
    } catch (e) {
      setErrorMessage(e.message);
      setPhase('configure');
    }
  }

  return (
    <Layout loanHeader={
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: '100%', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--truv-font-display)', fontWeight: 700, fontSize: 18 }}>
            {application ? application.loan_number : 'Configure Truv'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--truv-grey-60)' }}>Configure Truv</div>
        </div>
        {routeId && <Button variant="secondary" onClick={() => navigate(returnUrl)}>← Back to Loan File</Button>}
      </div>
    }>
      <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <p style={{ color: 'var(--truv-grey-50)', fontSize: 13, margin: 0 }}>
          Trigger a brand-new Truv verification directly from LOS — a processor's own copy of POS's developer
          console. Saved profiles here are independent of POS's; tuning LOS's defaults never changes what the
          borrower's POS wizard uses, and vice versa.
        </p>

        {phase === 'configure' && (
          <Card title="Target Loan File">
            <Select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder="Select a loan file to run a live verification against…"
              options={loanFiles.map((a) => ({ value: String(a.id), label: `${a.loan_number} — ${a.status.replace(/_/g, ' ')}` }))}
            />
            <p style={{ fontSize: 12, color: 'var(--truv-grey-50)', margin: 0 }}>
              Saving a step profile below works without picking a target — only "Run Verification Now" needs one.
            </p>
          </Card>
        )}

        {phase === 'configure' && (
          <Card title="Step Profile">
            <div style={{ display: 'flex', gap: 8 }}>
              {STEP_PROFILES.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setStepKey(p.key)}
                  style={{
                    border: `1px solid ${stepKey === p.key ? 'var(--truv-accent)' : 'var(--truv-grey-30)'}`,
                    background: stepKey === p.key ? 'var(--truv-accent)' : 'var(--truv-white)',
                    color: stepKey === p.key ? 'var(--truv-white)' : 'var(--truv-pure-black)',
                    borderRadius: 100, padding: '8px 16px', fontSize: 13, cursor: 'pointer',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--truv-grey-50)', margin: 0 }}>
              Editing what "Run Verification Now" sends for the <strong>{STEP_PROFILES.find((p) => p.key === stepKey).label}</strong> profile.
            </p>
          </Card>
        )}

        {errorMessage && (
          <Card>
            <p style={{ color: 'var(--truv-text-red)', fontSize: 13, margin: 0 }}>{errorMessage}</p>
          </Card>
        )}

        {phase === 'configure' && configLoading && (
          <Card><p>Loading saved configuration…</p></Card>
        )}

        {phase === 'configure' && !configLoading && (
          <>
            <Card title="Integration Method">
              <IntegrationMethodSelector
                value={config.integration_method}
                onChange={(v) => setConfig((c) => ({
                  ...c,
                  integration_method: v,
                  products: sanitizeProductsForMethod(c.products, v),
                }))}
              />
            </Card>
            <ProductFieldConsole config={config} onChange={setConfig} requestPreview={requestPreview} application={application} />

            {saveMessage && (
              <p style={{ fontSize: 13, color: saveMessage.startsWith('Saved') ? 'var(--truv-green)' : 'var(--truv-text-red)' }}>
                {saveMessage}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <Button variant="secondary" onClick={handleSaveConfig} loading={saving}>
                Save Configuration for "{STEP_PROFILES.find((p) => p.key === stepKey).label}"
              </Button>
              <div style={{ display: 'flex', gap: 12 }}>
                <Button variant="secondary" onClick={() => navigate(returnUrl)}>Cancel</Button>
                <Button onClick={handleSubmit} loading={submitting} disabled={!application}>Run Verification Now</Button>
              </div>
            </div>
          </>
        )}

        {(phase === 'bridge' || phase === 'hosted' || phase === 'document') && (
          <div>
            <Button variant="secondary" onClick={() => { setPhase('configure'); setErrorMessage(''); }}>
              ← Back to Configuration
            </Button>
          </div>
        )}

        {phase === 'bridge' && verificationRequest && (
          <BridgeEmbedScreen
            bridgeToken={verificationRequest.bridge_token}
            isOrder={config.integration_method === 'embedded_order'}
            onSuccess={handleBridgeSuccess}
            onClose={() => setPhase('configure')}
          />
        )}

        {phase === 'hosted' && verificationRequest && (
          <Card title="Hosted Verification Sent">
            <p>Truv has emailed/texted the borrower a verification link. No widget runs in this app for this method —
              check status once the borrower completes it on their own device.</p>
            {verificationRequest.share_url && (
              <a href={verificationRequest.share_url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'monospace', fontSize: 13 }}>
                {verificationRequest.share_url}
              </a>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button onClick={handleBridgeSuccess}>Check Status & Apply</Button>
            </div>
          </Card>
        )}

        {phase === 'document' && verificationRequest && (
          <DocumentUploadScreen
            verificationRequest={verificationRequest}
            onFinalized={handleBridgeSuccess}
          />
        )}

        {phase === 'applying' && (
          <Card title="Applying Verification Data"><p>Pulling the latest order data from Truv and mapping it onto the loan file…</p></Card>
        )}

        {phase === 'results' && applyResult && application && (
          <CoverageResultsScreen
            application={application}
            applyResult={applyResult}
            returnUrl={returnUrl}
            onTestAgain={() => { setPhase('configure'); setErrorMessage(''); setApplyResult(null); }}
          />
        )}
      </div>
    </Layout>
  );
}
