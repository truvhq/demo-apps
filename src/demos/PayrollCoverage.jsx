/**
 * FILE SUMMARY: Coverage Analysis: Payroll Coverage demo.
 * INTEGRATION PATTERN: Bulk lookup; no Bridge or webhooks.
 * DATA FLOW:
 *   1. POST /api/coverage/payroll/jobs        : enqueue rows, returns { job_id }
 *   2. GET  /api/coverage/payroll/jobs/:id    : poll progress + partial results
 *   3. GET  /api/coverage/payroll/jobs/:id/csv: download final results
 */

import { useState } from 'preact/hooks';
import { Layout, usePanel, IntroSlide } from '../components/index.js';
import { CoverageRunner } from '../components/CoverageRunner.jsx';
import { PAYROLL_COVERAGE_DIAGRAM as DIAGRAM } from '../diagrams/coverage-analysis.js';
import { STEPS, INTRO_SLIDE_CONFIG, PRODUCT_OPTIONS } from './scaffolding/payroll-coverage.jsx';

export function PayrollCoverageDemo() {
  const [screen, setScreen] = useState('select');
  const { panel, sessionId, setCurrentStep, startPolling } = usePanel();

  function start() {
    setScreen('run');
    setCurrentStep(0);
    // Use a sentinel userId so the panel polls session-scoped logs from the
    // coverage runner (server stores logs with user_id=null + matching session_id).
    startPolling('coverage-payroll');
  }

  const isIntro = screen === 'select';

  return (
    <Layout badge="Payroll Coverage" steps={STEPS} panel={panel} hidePanel={isIntro}>
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
            kind="payroll"
            productOptions={PRODUCT_OPTIONS}
            sampleUrl="/samples/employer_sample.csv"
            sampleFilename="employer_sample.csv"
            onStepChange={setCurrentStep}
            sessionId={sessionId}
          />
        )}
      </div>
    </Layout>
  );
}
