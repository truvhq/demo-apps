import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { Button, Card, setGuideProgress } from '@truv-demo/design-system';

import { api } from '../../api.js';
import { Layout } from '../../components/Layout.jsx';
import { BridgeEmbedScreen } from './BridgeEmbedScreen.jsx';
import { DocumentUploadScreen } from './DocumentUploadScreen.jsx';

const STEP_LABELS = { employment: 'Employment & Income', assets: 'Assets', liabilities: 'Liabilities', combined: 'Income & Assets' };

/** What the borrower actually sees: no integration-method picker, no product
 * checkboxes, no request-preview JSON — just "click a button, verify, done."
 * Uses whatever was saved for this step in "Configure Truv" (falling back to
 * Embedded Orders + a sensible default product if nothing's been saved yet),
 * so a developer can tune behavior per step without touching this screen. */
export function BorrowerVerifyScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnStep = searchParams.get('step');
  const stepKey = searchParams.get('stepKey') || 'employment';
  const returnUrl = `/applications/${id}${returnStep ? `?step=${returnStep}` : ''}`;

  const [phase, setPhase] = useState('starting'); // starting | bridge | hosted | document | applying | done | error
  const [stepConfig, setStepConfig] = useState(null);
  const [verificationRequest, setVerificationRequest] = useState(null);
  const [applySummary, setApplySummary] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await api.getStepConfig(stepKey);
        if (cancelled) return;
        setStepConfig(saved);
        setGuideProgress(saved.integration_method, 0);

        const vr = await api.createVerificationRequest({
          loan_application: Number(id),
          integration_method: saved.integration_method,
          products: saved.products,
          data_sources: saved.data_sources,
          template_id: saved.template_id,
          employer_name: saved.employer_name,
          company_mapping_id: saved.company_mapping_id,
          provider_id: saved.provider_id,
          fetch_liabilities: saved.fetch_liabilities,
        });
        if (cancelled) return;
        if (vr.status === 'error') {
          setErrorMessage('We couldn’t start verification right now. Please try again in a moment.');
          setPhase('error');
          return;
        }
        setVerificationRequest(vr);
        if (saved.integration_method === 'hosted_order') {
          setGuideProgress(saved.integration_method, 1);
          setPhase('hosted');
        } else if (saved.integration_method === 'document_upload') {
          setGuideProgress(saved.integration_method, 1);
          setPhase('document');
        } else if (vr.bridge_token) {
          setGuideProgress(saved.integration_method, 1);
          setPhase('bridge');
        } else {
          setErrorMessage('We couldn’t start verification right now. Please try again in a moment.');
          setPhase('error');
        }
      } catch {
        if (!cancelled) {
          setErrorMessage('We couldn’t start verification right now. Please try again in a moment.');
          setPhase('error');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [id, stepKey]);

  async function handleBridgeSuccess() {
    setGuideProgress(stepConfig?.integration_method, 2);
    setPhase('applying');
    try {
      const result = await api.applyVerificationRequest(verificationRequest.id);
      setApplySummary(result.apply_summary);
      setGuideProgress(stepConfig?.integration_method, 3);
      setPhase('done');
    } catch {
      setErrorMessage('Verification completed, but we had trouble saving the results. Please try again.');
      setPhase('error');
    }
  }

  return (
    <Layout loanHeader={
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: '100%', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: 'var(--truv-font-display)', fontWeight: 700, fontSize: 18 }}>
          Verify {STEP_LABELS[stepKey] || ''} with Truv
        </div>
        <Button variant="secondary" onClick={() => navigate(returnUrl)}>Cancel</Button>
      </div>
    }>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        {phase === 'starting' && (
          <Card title="Connecting to Truv…"><p style={{ color: 'var(--truv-grey-50)' }}>One moment.</p></Card>
        )}

        {phase === 'bridge' && verificationRequest && (
          <BridgeEmbedScreen
            bridgeToken={verificationRequest.bridge_token}
            isOrder={stepConfig?.integration_method === 'embedded_order'}
            onSuccess={handleBridgeSuccess}
            onClose={() => navigate(returnUrl)}
          />
        )}

        {phase === 'hosted' && verificationRequest && (
          <Card title="Check your email or phone">
            <p style={{ color: 'var(--truv-grey-60)' }}>We've sent a verification link to complete on your own device.</p>
            {verificationRequest.share_url && (
              <a href={verificationRequest.share_url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'monospace', fontSize: 13 }}>
                {verificationRequest.share_url}
              </a>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button onClick={handleBridgeSuccess}>I've completed it</Button>
            </div>
          </Card>
        )}

        {phase === 'document' && verificationRequest && (
          <DocumentUploadScreen verificationRequest={verificationRequest} onFinalized={handleBridgeSuccess} />
        )}

        {phase === 'applying' && (
          <Card title="Finishing up…"><p style={{ color: 'var(--truv-grey-50)' }}>Applying your verified information.</p></Card>
        )}

        {phase === 'done' && (
          <Card title="You're verified!">
            <p style={{ color: 'var(--truv-grey-60)' }}>
              {applySummary?.applied?.length
                ? `We've filled in ${applySummary.applied.length} field(s) from your verification.`
                : 'Your verification is complete.'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button onClick={() => navigate(returnUrl)}>Continue</Button>
            </div>
          </Card>
        )}

        {phase === 'error' && (
          <Card title="Something went wrong">
            <p style={{ color: 'var(--truv-text-red)' }}>{errorMessage}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <Button variant="secondary" onClick={() => navigate(returnUrl)}>Back</Button>
              <Button onClick={() => window.location.reload()}>Try Again</Button>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}
