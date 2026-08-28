// Module-level store (not React state) tracking live progress through
// whichever integration-method flow is currently running, so the Dev
// Panel's "Guide" tab can highlight the active step regardless of which
// screen is on top — mirrors the reference demo app's `setCurrentStep()`
// pattern (`/Users/brian/demo-apps/src/demos/PayrollIncome.jsx`), adapted so
// any screen driving a verification (Configure Truv console, the borrower's
// "Verify with Truv" flow) can report progress from wherever its own phase
// state machine already lives, without needing a shared React context.
let state = { flowKey: null, stepIndex: -1 };
const listeners = new Set();

function notify() {
  listeners.forEach((listener) => listener(state));
}

export function setGuideProgress(flowKey, stepIndex) {
  state = { flowKey, stepIndex };
  notify();
}

export function getGuideProgress() {
  return state;
}

export function subscribeGuideProgress(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
