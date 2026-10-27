/**
 * FILE SUMMARY: Public Sector: Case Worker Portal demo.
 * INTEGRATION PATTERN: Orders flow (backend-initiated, no Bridge widget in the portal).
 *
 * DATA FLOW:
 *   1. POST /api/orders           : products + template_id + order_number (case number) + email/phone
 *   2. Truv sends email/SMS with the share_url; the applicant verifies on their own device
 *   3. GET /api/orders/:id        : live refresh from Truv (per-product status)
 *   4. GET /api/users/:userId/reports/:type : verification report once done
 *
 * A case worker works from a dashboard of verifications. "New verification" mirrors
 * the Truv dashboard's Create order: pick product types (wage earner, self-employment,
 * or both), which picks the template, then send.
 *
 * Scaffolding: ./scaffolding/case-worker-dashboard.jsx (dashboard, form, case drawer)
 *              ./scaffolding/case-worker-portal.jsx    (guide steps, intro features)
 * Diagrams:    ../diagrams/case-worker-portal.js
 */

import { useState } from 'preact/hooks';
import { Layout, usePanel, IntroSlide, FeatureList } from '../components/index.js';
import { VERIFIER_DIAGRAM } from '../diagrams/case-worker-portal.js';
import { STEPS, INTRO_FEATURES } from './scaffolding/case-worker-portal.jsx';
import { CWDashboard } from './scaffolding/case-worker-dashboard.jsx';

export function CaseWorkerPortalDemo() {
  const [introSeen, setIntroSeen] = useState(false);
  const { panel, setCurrentStep, startPolling } = usePanel();

  // A new order: show its API calls and webhooks in the integration panel.
  function onOrder(c) {
    setCurrentStep(1);
    if (c.user_id) startPolling(c.user_id);
  }

  return (
    <Layout badge="Public Sector · Case Worker Portal" steps={STEPS} panel={panel} hidePanel={!introSeen} theme="checkr">
      {!introSeen && (
        <IntroSlide
          theme="checkr"
          label="Public Sector · Case Worker Portal"
          title="Verify without the applicant present"
          subtitle="A case worker sends the applicant a secure verification link from the agency's dashboard. The product types they pick decide the template. Each case shows its status and the report when it's done."
          diagram={VERIFIER_DIAGRAM}
          actions={<button onClick={() => setIntroSeen(true)} class="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-hover active:bg-primary-active transition-colors text-center">Open the dashboard</button>}
        >
          <FeatureList items={INTRO_FEATURES} />
        </IntroSlide>
      )}
      {introSeen && <div class="flex-1 min-h-0 overflow-y-auto"><CWDashboard onOrder={onOrder} /></div>}
    </Layout>
  );
}
