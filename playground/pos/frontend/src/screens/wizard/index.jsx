import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { Stepper } from '@truv-demo/design-system';

import { api } from '../../api.js';
import { Layout } from '../../components/Layout.jsx';
import { hasBorrowerData, hasDeclarationData, hasDemographicData, hasLoanPropertyData } from './completion.js';
import { AssetsStep } from './steps/AssetsStep.jsx';
import { BorrowerStep } from './steps/BorrowerStep.jsx';
import { DeclarationsStep } from './steps/DeclarationsStep.jsx';
import { DemographicsStep } from './steps/DemographicsStep.jsx';
import { EmploymentStep } from './steps/EmploymentStep.jsx';
import { LiabilitiesStep } from './steps/LiabilitiesStep.jsx';
import { LoanPropertyStep } from './steps/LoanPropertyStep.jsx';
import { ReoStep } from './steps/ReoStep.jsx';
import { ReviewStep } from './steps/ReviewStep.jsx';

const STEP_LABELS = [
  'Borrower', 'Employment', 'Assets', 'Liabilities', 'Real Estate', 'Loan & Property', 'Declarations', 'Demographics', 'Review',
];

// Employment/Assets/Liabilities/Real Estate are legitimately allowed to be
// empty (not everyone has liabilities or other real estate) — a record count
// of 0 there doesn't mean "incomplete." For those, a step also counts as done
// once the borrower has explicitly clicked "Next →" from within that step
// (see confirmedSteps below) — NOT merely by clicking around the tracker to
// look at a step, which must never award the checkmark on its own; required
// single-value steps rely on real field data only.

function confirmedStepsKey(applicationId) {
  return `truv-pos-wizard-confirmed-${applicationId}`;
}

function loadConfirmedSteps(applicationId) {
  try {
    return new Set(JSON.parse(localStorage.getItem(confirmedStepsKey(applicationId))) || []);
  } catch {
    return new Set();
  }
}

function computeCompletedIndices(application, confirmedSteps) {
  const borrower = application.borrowers[0];
  const completed = new Set();
  if (hasBorrowerData(borrower)) completed.add(0);
  if ((borrower.employment_records || []).length > 0 || confirmedSteps.has(1)) completed.add(1);
  if ((borrower.assets || []).length > 0 || confirmedSteps.has(2)) completed.add(2);
  if ((borrower.liabilities || []).length > 0 || confirmedSteps.has(3)) completed.add(3);
  if ((borrower.real_estate_owned || []).length > 0 || confirmedSteps.has(4)) completed.add(4);
  if (hasLoanPropertyData(application.loan_property)) completed.add(5);
  if (hasDeclarationData(borrower.declaration)) completed.add(6);
  if (hasDemographicData(borrower.demographic_info)) completed.add(7);
  return completed;
}

export function ApplicationWizard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [application, setApplication] = useState(null);
  const [fillStates, setFillStates] = useState([]);
  // Step lives in the URL (?step=N), not just component state — that's what
  // lets "Verify with Truv" and its Back button return you to the exact step
  // you left, including after a full page reconnect.
  const [searchParams, setSearchParams] = useSearchParams();
  const stepIndex = Math.min(Math.max(parseInt(searchParams.get('step') || '0', 10) || 0, 0), STEP_LABELS.length - 1);
  const [confirmedSteps, setConfirmedSteps] = useState(() => loadConfirmedSteps(id));

  const refresh = useCallback(async () => {
    const [app, states] = await Promise.all([api.getApplication(id), api.getFieldFillStates(id)]);
    setApplication(app);
    setFillStates(states);
    return app;
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  // Poll for LOS-initiated refreshes: last_synced_at bumps whenever LOS
  // pushes a refresh back, without POS needing to know why it happened.
  useEffect(() => {
    let lastSeen = application?.last_synced_at;
    const interval = setInterval(async () => {
      try {
        const status = await api.getSyncStatus(id);
        if (status.last_synced_at && status.last_synced_at !== lastSeen) {
          lastSeen = status.last_synced_at;
          refresh();
        }
      } catch {
        // Sync status endpoint not reachable — skip this tick, try again later.
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [id, refresh]);

  if (!application) {
    return <Layout><p>Loading…</p></Layout>;
  }

  const borrower = application.borrowers[0];
  const goToStep = (i) => {
    const clamped = Math.min(Math.max(i, 0), STEP_LABELS.length - 1);
    setSearchParams({ step: String(clamped) });
  };
  // Only "Next →" counts as confirming the step you're leaving — clicking
  // around the tracker (goToStep via onStepClick) or "← Back" must never
  // award a checkmark for a step the borrower hasn't actually finished.
  const next = () => {
    const nextConfirmed = new Set(confirmedSteps).add(stepIndex);
    setConfirmedSteps(nextConfirmed);
    localStorage.setItem(confirmedStepsKey(id), JSON.stringify([...nextConfirmed]));
    goToStep(stepIndex + 1);
  };
  const back = () => goToStep(stepIndex - 1);
  const completedIndices = computeCompletedIndices(application, confirmedSteps);
  // Section-level buttons: the actual borrower experience — no config
  // surface, just Embedded Orders using whatever was saved for this step
  // (or a sensible default if nothing's been saved yet).
  const verifyWithTruv = (stepKey) => navigate(`/applications/${application.id}/verify-now?step=${stepIndex}&stepKey=${stepKey}`);

  const commonProps = { application, borrower, fillStates, onNext: next, onBack: back };
  // Mirrors BorrowerStep's onSaved pattern below — without this, a step's
  // freshly-saved data (e.g. Demographics) never reaches the wizard's own
  // `application` state, so completedIndices keeps evaluating stale,
  // pre-save data and the stepper checkmark never appears until a full reload.
  const updateBorrowerField = (field) => (value) => setApplication((a) => ({
    ...a,
    borrowers: [{ ...a.borrowers[0], [field]: value }, ...a.borrowers.slice(1)],
  }));

  return (
    <Layout loanHeader={
      <>
        <div>
          <div style={{ fontFamily: 'var(--truv-font-display)', fontWeight: 700, fontSize: 18 }}>{application.loan_number}</div>
          <div style={{ fontSize: 13, color: 'var(--truv-grey-60)' }}>
            {borrower.first_name || borrower.last_name ? `${borrower.first_name} ${borrower.last_name}` : 'New Borrower'} · {application.status.replace(/_/g, ' ')}
          </div>
        </div>
      </>
    }>
      <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Stepper steps={STEP_LABELS} currentIndex={stepIndex} completedIndices={completedIndices} onStepClick={goToStep} />

        {stepIndex === 0 && <BorrowerStep {...commonProps} onSaved={(b) => setApplication((a) => ({ ...a, borrowers: [b, ...a.borrowers.slice(1)] }))} />}
        {stepIndex === 1 && (
          <EmploymentStep
            {...commonProps}
            onVerifyWithTruv={() => verifyWithTruv('employment')}
            onVerifyCombined={() => verifyWithTruv('combined')}
          />
        )}
        {stepIndex === 2 && <AssetsStep {...commonProps} onVerifyWithTruv={() => verifyWithTruv('assets')} />}
        {stepIndex === 3 && <LiabilitiesStep {...commonProps} onVerifyWithTruv={() => verifyWithTruv('liabilities')} />}
        {stepIndex === 4 && <ReoStep {...commonProps} />}
        {stepIndex === 5 && (
          <LoanPropertyStep
            application={application}
            loanProperty={application.loan_property}
            fillStates={fillStates}
            onSaved={(lp) => setApplication((a) => ({ ...a, loan_property: lp }))}
            onNext={next}
            onBack={back}
          />
        )}
        {stepIndex === 6 && <DeclarationsStep {...commonProps} onSaved={updateBorrowerField('declaration')} />}
        {stepIndex === 7 && <DemographicsStep {...commonProps} onSaved={updateBorrowerField('demographic_info')} />}
        {stepIndex === 8 && <ReviewStep application={application} onBack={back} />}
      </div>
    </Layout>
  );
}
