export const $ = (n: number | undefined | null): string =>
  '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FREQ_MAP: Record<string, string> = { BW: 'Biweekly', W: 'Weekly', M: 'Monthly', SM: 'Semi-Monthly', A: 'Annual' };
export const freq = (f: string | undefined | null): string => (f && FREQ_MAP[f]) ?? (f ?? '');

export const fmtDate = (d: string | undefined | null): string => d ? new Date(d).toLocaleDateString() : '-';
