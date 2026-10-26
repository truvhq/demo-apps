import { describe, it, expect } from 'vitest';
import { statusOf, mergeByUser, foldRepeats } from '../../src/utils/panelLogs.js';

describe('statusOf', () => {
  it('reads status, and falls back to the database column status_code', () => {
    expect(statusOf({ status: 200, status_code: 500 })).toBe(200);
    expect(statusOf({ status_code: 201 })).toBe(201);
    expect(statusOf({})).toBeUndefined();
  });
});

describe('mergeByUser', () => {
  const perUser = [
    { uid: 'a', logs: [{ id: 1, endpoint: '/v1/orders/' }, { id: 4, endpoint: '/v1/orders/x/' }], whs: [{ id: 10, event_type: 'order-status-updated' }] },
    { uid: 'b', logs: [{ id: 2, endpoint: '/v1/orders/' }, { id: 3, endpoint: '/v1/tasks/' }], whs: [{ id: 9, event_type: 'order-refresh-failed' }] },
  ];

  it('puts every user\'s rows in the order they happened, whoever they belong to', () => {
    expect(mergeByUser(perUser, 'logs').map(r => r.id)).toEqual([1, 2, 3, 4]);
    expect(mergeByUser(perUser, 'whs').map(r => r.id)).toEqual([9, 10]);
  });

  it('tags each row with its applicant, and leaves rows of unlabelled users alone', () => {
    const rows = mergeByUser(perUser, 'logs', { a: 'Ana Silva' });
    expect(rows.find(r => r.id === 1).applicant).toBe('Ana Silva');
    expect(rows.find(r => r.id === 2)).not.toHaveProperty('applicant');
  });

  it('does not change the rows it was given', () => {
    mergeByUser(perUser, 'logs', { a: 'Ana Silva' });
    expect(perUser[0].logs[0]).not.toHaveProperty('applicant');
  });

  it('keeps a row once when more than one user\'s poll returned it (session-scoped company search)', () => {
    const shared = { id: 7, endpoint: '/v1/company-mappings-search/' };
    const rows = mergeByUser([{ uid: 'a', logs: [shared] }, { uid: 'b', logs: [shared] }], 'logs', { a: 'Ana', b: 'Dana' });
    expect(rows).toHaveLength(1);
  });

  it('keeps rows with no id rather than dropping them', () => {
    const rows = mergeByUser([{ uid: 'a', logs: [{ endpoint: '/x' }, { endpoint: '/y' }] }], 'logs');
    expect(rows).toHaveLength(2);
  });

  it('copes with a user whose poll returned nothing', () => {
    expect(mergeByUser([{ uid: 'a', logs: [{ id: 1 }] }, { uid: 'b' }], 'logs').map(r => r.id)).toEqual([1]);
    expect(mergeByUser([], 'logs')).toEqual([]);
  });
});

describe('foldRepeats', () => {
  const get = (extra = {}) => ({ method: 'GET', endpoint: '/v1/orders/o1/', status_code: 200, response_body: '{"status":"sent"}', applicant: 'Ana Silva', ...extra });

  it('counts an unchanged poll on the first row instead of adding another', () => {
    const rows = foldRepeats([get({ id: 1 }), get({ id: 2 }), get({ id: 3 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].repeat).toBe(3);
    expect(rows[0].id).toBe(1);
  });

  it('shows a new row when the response changes, then folds against that one', () => {
    const done = get({ response_body: '{"status":"completed"}' });
    const rows = foldRepeats([get({ id: 1 }), get({ id: 2 }), { ...done, id: 3 }, { ...done, id: 4 }]);
    expect(rows.map(r => [r.id, r.repeat])).toEqual([[1, 2], [3, 2]]);
  });

  it('shows a new row when the status code changes', () => {
    const rows = foldRepeats([get({ id: 1 }), get({ id: 2, status_code: 429 })]);
    expect(rows).toHaveLength(2);
  });

  it('never folds a POST, even an identical one', () => {
    const post = { method: 'POST', endpoint: '/v1/orders/', status_code: 201, response_body: '{}', applicant: 'Ana Silva' };
    expect(foldRepeats([{ ...post, id: 1 }, { ...post, id: 2 }])).toHaveLength(2);
  });

  it('keeps two applicants\' identical polls apart', () => {
    const rows = foldRepeats([get({ id: 1 }), get({ id: 2, applicant: 'Dana Cole' }), get({ id: 3 })]);
    expect(rows.map(r => [r.applicant, r.repeat])).toEqual([['Ana Silva', 2], ['Dana Cole', 1]]);
  });

  it('folds the same poll even with other calls in between', () => {
    const tasks = { method: 'GET', endpoint: '/v1/tasks/?user_id=u', status_code: 200, response_body: '[]', applicant: 'Ana Silva' };
    const rows = foldRepeats([get({ id: 1 }), { ...tasks, id: 2 }, get({ id: 3 }), { ...tasks, id: 4 }]);
    expect(rows.map(r => [r.endpoint, r.repeat])).toEqual([['/v1/orders/o1/', 2], ['/v1/tasks/?user_id=u', 2]]);
  });

  it('treats a missing method as a GET', () => {
    const rows = foldRepeats([{ endpoint: '/a', response_body: 'x' }, { endpoint: '/a', response_body: 'x' }]);
    expect(rows[0].repeat).toBe(2);
  });

  it('does not change the rows it was given', () => {
    const input = [get({ id: 1 }), get({ id: 2 })];
    foldRepeats(input);
    expect(input[0]).not.toHaveProperty('repeat');
  });
});
