/**
 * FILE SUMMARY: Coverage Analysis: Bank Coverage demo.
 * INTEGRATION PATTERN: Bulk lookup; no Bridge or webhooks.
 * DATA FLOW:
 *   1. POST /api/coverage/bank/jobs        : enqueue rows, returns { job_id }
 *   2. GET  /api/coverage/bank/jobs/:id    : poll progress + partial results
 *   3. GET  /api/coverage/bank/jobs/:id/csv: download final results
 */

import { useState } from 'preact/hooks';
import { Layout, usePanel, IntroSlide } from '../components/index.js';
import { CoverageRunner } from '../components/CoverageRunner.jsx';
import { BANK_COVERAGE_DIAGRAM as DIAGRAM } from '../diagrams/coverage-analysis.js';
import { STEPS, INTRO_SLIDE_CONFIG, PRODUCT_OPTIONS } from './scaffolding/bank-coverage.jsx';

export function BankCoverageDemo() {
  const [screen, setScreen] = useState('select');
  const { panel, sessionId, setCurrentStep, startPolling } = usePanel();

  function start() {
    setScreen('run');
    setCurrentStep(0);
    startPolling('coverage-bank');
  }

  const isIntro = screen === 'select';

  return (
    <Layout badge="Bank Coverage" steps={STEPS} panel={panel} hidePanel={isIntro}>
      <div class={isIntro ? 'flex-1 flex flex-col' : 'flex-1 overflow-y-auto'}>
        {isIntro ? (
          <IntroSlide
            label={INTRO_SLIDE_CONFIG.label}
            title={INTRO_SLIDE_CONFIG.title}
            subtitle={INTRO_SLIDE_CONFIG.subtitle}
            diagram={DIAGRAM}
            actions={<button onClick={start} class="w-full py-3 bg-primary text-white font-semibold rounded-full hover:bg-primary-hover text-center">Get started</button>}
          />
        ) : (
          <CoverageRunner
            kind="bank"
            productOptions={PRODUCT_OPTIONS}
            sampleUrl="/samples/bank_sample.csv"
            sampleFilename="bank_sample.csv"
            onStepChange={setCurrentStep}
            sessionId={sessionId}
          />
        )}
      </div>
    </Layout>
  );
}
