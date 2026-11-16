/**
 * FILE SUMMARY: Public Sector · Batch Orders demo (live, hands-on).
 * INTEGRATION PATTERN: Bulk order creation via the batch endpoint + status polling + webhook.
 * DATA FLOW:
 *   1. POST /api/batch/jobs          : send chunked applicant rows, returns { job_id }
 *   2. GET  /api/batch/jobs/:id       : poll chunk + per-order results + webhooks
 *   3. GET  /api/batch/jobs/:id/csv   : download the per-order results
 *
 * This is the interactive counterpart to the animated Batching walkthrough: same
 * concept, but it actually hits POST /v1/orders/batch/ and lets you play with the
 * file contents and the chunking knobs.
 */

import { useState } from 'preact/hooks';
import { Layout, usePanel, IntroSlide } from '../components/index.js';
import { BatchRunner } from '../components/BatchRunner.jsx';
import { BATCH_ORDERS_DIAGRAM as DIAGRAM } from '../diagrams/batch-orders.js';
import { STEPS, INTRO_SLIDE_CONFIG } from './scaffolding/batch-orders.jsx';

export function BatchOrdersDemo() {
  const [screen, setScreen] = useState('intro');
  const { panel, sessionId, setCurrentStep, startPolling, stopPolling, addBridgeEvent } = usePanel();

  function start() {
    setScreen('run');
    setCurrentStep(0);
  }

  const isIntro = screen === 'intro';

  return (
    <Layout steps={STEPS} panel={panel} hidePanel={isIntro} theme="checkr">
      <div class={isIntro ? 'flex-1 flex flex-col' : 'flex-1 overflow-y-auto'}>
        {isIntro ? (
          <IntroSlide
            label={INTRO_SLIDE_CONFIG.label}
            title={INTRO_SLIDE_CONFIG.title}
            subtitle={INTRO_SLIDE_CONFIG.subtitle}
            diagram={DIAGRAM}
            actions={<button onClick={start} class="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-hover active:bg-primary-active transition-colors text-center">Get started</button>}
          />
        ) : (
          <BatchRunner
            onStepChange={setCurrentStep}
            sessionId={sessionId}
            startPolling={startPolling}
            stopPolling={stopPolling}
            addBridgeEvent={addBridgeEvent}
          />
        )}
      </div>
    </Layout>
  );
}
