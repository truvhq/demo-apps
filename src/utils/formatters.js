export const $ = (n) => '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const freq = (f) => ({ BW: 'Biweekly', W: 'Weekly', M: 'Monthly', SM: 'Semi-Monthly', A: 'Annual' }[f] || f);
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString() : '-';
