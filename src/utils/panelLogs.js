/**
 * FILE SUMMARY: Pure helpers behind the Dev panel's API and Webhooks tabs.
 *
 * A demo that creates one Truv user per person (Renewals) follows all of them at once. These
 * helpers merge what each user's polls returned into one list, and fold a run of unchanged
 * status checks into one row. They have no state and no network, so they are unit tested.
 */

// The database column is status_code; older callers pass status.
export const statusOf = (log) => log.status ?? log.status_code;

// Merge per-user rows into one list in the order they happened.
//   perUser: [{ uid, logs: [...], whs: [...] }]   key: 'logs' | 'whs'   labels: { uid: 'Ana Silva' }
// Rows get increasing ids as they are written, so sorting by id is sorting by time. A row that
// more than one user's poll returned (session-scoped company searches come back for every user)
// is kept once. Rows from a user with a label are tagged `applicant`.
export function mergeByUser(perUser, key, labels = {}) {
  const seen = new Set();
  const out = [];
  for (const { uid, [key]: rows } of perUser) {
    for (const row of rows || []) {
      if (row.id != null) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
      }
      out.push(labels[uid] ? { ...row, applicant: labels[uid] } : row);
    }
  }
  return out.sort((x, y) => (x.id ?? 0) - (y.id ?? 0));
}

// A GET that returns exactly what the same GET returned last time (same applicant, same status,
// same body) is counted on that earlier row instead of added again, so a demo that polls for a
// result shows each change once, not every check. Anything else, including every POST, is kept.
export function foldRepeats(logs) {
  const rows = [];
  const lastByKey = new Map();
  for (const log of logs) {
    const key = `${log.method}|${log.endpoint || log.url}|${log.applicant || ''}`;
    const prev = lastByKey.get(key);
    const same = prev && (log.method || 'GET').toUpperCase() === 'GET'
      && statusOf(prev) === statusOf(log) && prev.response_body === log.response_body;
    if (same) { prev.repeat += 1; continue; }
    const row = { ...log, repeat: 1 };
    rows.push(row);
    lastByKey.set(key, row);
  }
  return rows;
}
