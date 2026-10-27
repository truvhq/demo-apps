/**
 * FILE SUMMARY: Runs a sandbox login and reads the result, with no screen attached, so the Try dialog and the
 * suite runner follow a run the same way. A run is started with POST /api/sandbox/run, then read by polling
 * GET /api/sandbox/run/:orderId until its task ends.
 */
import { readRun, describeError, statusName } from './model.js';
import { isOk } from './api.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const POLL_MS = 2000;
const GIVE_UP_MS = 150_000;     // a scenario can make the task wait up to 120 seconds

// Start a headless run. `logins` is a list of { login, password }: one order with one employer per login.
export function startHeadless(call, { product, logins }) {
  const first = logins[0];
  return call('POST', '/run', logins.length > 1 ? { mode: 'headless', product, logins } : { mode: 'headless', product, login: first.login, password: first.password });
}

// Truv runs one connection per user at a time, so the second and third logins of an order start only after the one before has ended.
export function startNextCheck(call, { orderId, userId, index, login, password, product }) {
  return call('POST', `/run/${orderId}/check`, { user_id: userId, index, login, password, product });
}

// Read an order until its task ends (and, for income, until paystubs arrive).
//   ids         { order_id, user_id }
//   live()      false once the caller has moved on; the loop then stops without a word
//   logins      with more than one, the later logins are started here, each once the one before has ended
//   skipTasks   tasks that existed before this run started (a refresh reads the same user), so an old 'done' is not taken for the new one
//   note(label, tone), waiting(text), logCalls(calls), onError(err) are optional callbacks
// Returns { run, order, failed, timedOut } or null if the caller moved on.
export async function watchRun({ call, ids, product, live = () => true, skipTasks = 0, logins = [], note, waiting, logCalls, onError }) {
  const begun = Date.now();
  let lastStatus = null;
  let latest = { run: readRun({}), order: null };
  let failed = false;
  const read = async (logIt) => {
    // A reading that fails on the way (no answer, a 5xx, rate limiting) is tried again a few times before it ends the run.
    let env = null;
    for (let attempt = 0; attempt < 4 && live(); attempt++) {
      env = await call('GET', `/run/${ids.order_id}?user_id=${ids.user_id}`, undefined, { quiet: true });
      if (isOk(env) || !(env.status === 0 || env.status === 429 || env.status >= 500)) break;
      await sleep(POLL_MS * (attempt + 1));
    }
    if (!live() || !env) return null;
    if (!isOk(env)) { failed = true; logCalls?.(env.calls); onError?.(describeError(env)); return null; }
    const tasks = (Array.isArray(env.data.tasks) ? env.data.tasks : []).slice(skipTasks);
    const run = readRun({ tasks, order: env.data.order, names: ids.employers?.map(e => e.company_name) });
    latest = { run, order: env.data.order, taskCount: skipTasks + tasks.length };
    if (logIt || run.status !== lastStatus || run.settled) logCalls?.(env.calls);
    return run;
  };
  let started = 1;
  waiting?.('Waiting for the sign-in to finish');
  while (live() && Date.now() - begun < GIVE_UP_MS * Math.max(1, logins.length)) {
    const first = lastStatus === null;
    const run = await read(first);
    if (!run) break;
    while (started < logins.length && run.employers[started - 1]?.settled) {
      const next = logins[started];
      // Truv may still count the earlier connection as busy for a moment: ask again a few times before giving up.
      let env = null;
      for (let attempt = 0; attempt < 4 && live(); attempt++) {
        env = await startNextCheck(call, { orderId: ids.order_id, userId: ids.user_id, index: started, login: next.login, password: next.password, product });
        if (isOk(env) || !(env.status === 409 || env.status === 429 || env.status === 0 || env.status >= 500)) break;
        await sleep(POLL_MS * (attempt + 1));
      }
      if (!live() || !env) return null;
      if (!isOk(env)) { failed = true; onError?.(describeError(env)); break; }
      note?.(`Signed in as ${next.login}`, 'good');
      started++;
    }
    if (failed) break;
    if (run.status && run.status !== lastStatus) {
      lastStatus = run.status;
      note?.(run.ok ? 'Sign-in succeeded' : `Task ${run.settled ? 'ended as' : 'is'} ${statusName(run.status).toLowerCase()}`, run.settled ? (run.ok ? 'good' : 'bad') : 'plain');
    }
    if (run.settled) break;
    await sleep(POLL_MS);
  }
  // Paystubs fill in a little after the task reports done. Employment returns none, so it does not wait.
  if (live() && latest.run.ok && product !== 'employment') {
    waiting?.('Waiting for paystubs to arrive');
    for (let i = 0; i < 8 && live(); i++) {
      if (latest.run.employers.filter(x => x.ok).every(x => x.employments.some(e => e.statements > 0))) break;
      await sleep(POLL_MS);
      if (!(await read(false))) break;
    }
  }
  const timedOut = !failed && !latest.run.settled;
  if (live() && timedOut) note?.('Still not finished after 2 and a half minutes. Stopped waiting.', 'bad');
  return live() ? { ...latest, failed, timedOut } : null;
}

// Ask Truv to refresh a finished order and return the refresh order's ids.
export async function startRefresh(call, { orderId, userId, product }) {
  return call('POST', `/run/${orderId}/refresh`, { user_id: userId, product });
}

// Concurrency-limited map: runs `fn` over `items` with at most `limit` in flight, stopping early when `live()` is false.
export async function mapLimit(items, limit, fn, live = () => true) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (live()) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
