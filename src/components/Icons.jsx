/**
 * FILE SUMMARY: SVG icon components
 * DATA FLOW: Presentational: no direct backend communication
 *
 * Collection of Lucide-inspired SVG icon functions rendered at 20x20 by default.
 * Each icon accepts optional size and className props. Also includes the Truv
 * wordmark logo with a custom viewBox.
 */

// Helper: wraps SVG path data in a standard 24x24 stroked SVG element
const I = (d, { size = 20, className = '' } = {}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class={className}>
    {d}
  </svg>
);

// Icon definitions grouped by category
export const Icons = {
  // Industries
  building: (p) => I(<><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" /><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" /><path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" /></>, p),
  landmark: (p) => I(<><line x1="3" x2="21" y1="22" y2="22" /><line x1="6" x2="6" y1="18" y2="11" /><line x1="10" x2="10" y1="18" y2="11" /><line x1="14" x2="14" y1="18" y2="11" /><line x1="18" x2="18" y1="18" y2="11" /><polygon points="12 2 20 7 4 7" /></>, p),
  creditCard: (p) => I(<><rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" /></>, p),
  wallet: (p) => I(<><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></>, p),

  // Verification methods
  briefcase: (p) => I(<><rect width="20" height="14" x="2" y="7" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>, p),
  bankBuilding: (p) => I(<><line x1="3" x2="21" y1="22" y2="22" /><line x1="6" x2="6" y1="18" y2="11" /><line x1="10" x2="10" y1="18" y2="11" /><line x1="14" x2="14" y1="18" y2="11" /><line x1="18" x2="18" y1="18" y2="11" /><polygon points="12 2 20 7 4 7" /></>, p),
  fileText: (p) => I(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><polyline points="14 2 14 8 20 8" /><line x1="16" x2="8" y1="13" y2="13" /><line x1="16" x2="8" y1="17" y2="17" /><polyline points="10 9 9 9 8 9" /></>, p),
  upload: (p) => I(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></>, p),

  // Actions & status
  search: (p) => I(<><circle cx="11" cy="11" r="8" /><line x1="21" x2="16.65" y1="21" y2="16.65" /></>, p),
  barChart: (p) => I(<><line x1="12" x2="12" y1="20" y2="10" /><line x1="18" x2="18" y1="20" y2="4" /><line x1="6" x2="6" y1="20" y2="16" /></>, p),
  shuffle: (p) => I(<><polyline points="16 3 21 3 21 8" /><line x1="4" x2="21" y1="20" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" x2="21" y1="15" y2="21" /><line x1="4" x2="9" y1="4" y2="9" /></>, p),
  dollarSign: (p) => I(<><line x1="12" x2="12" y1="2" y2="22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>, p),
  clipboard: (p) => I(<><rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /></>, p),
  arrowRightLeft: (p) => I(<><path d="m16 3 4 4-4 4" /><path d="M20 7H4" /><path d="m8 21-4-4 4-4" /><path d="M4 17h16" /></>, p),
  repeat: (p) => I(<><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></>, p),
  shieldCheck: (p) => I(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>, p),
  users: (p) => I(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>, p),
  chevronRight: (p) => I(<polyline points="9 18 15 12 9 6" />, p),
  arrowLeft: (p) => I(<><line x1="19" x2="5" y1="12" y2="12" /><polyline points="12 19 5 12 12 5" /></>, p),
  sparkles: (p) => I(<><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /><path d="M5 3v4" /><path d="M19 17v4" /><path d="M3 5h4" /><path d="M17 19h4" /></>, p),
  zap: (p) => I(<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />, p),
  link2: (p) => I(<><path d="M9 17H7A5 5 0 0 1 7 7h2" /><path d="M15 7h2a5 5 0 1 1 0 10h-2" /><line x1="8" x2="16" y1="12" y2="12" /></>, p),

  // Truv wordmark logo: filled paths, not stroked. Custom viewBox (69x25).
  truvLogo: ({ height = 18, className = '' } = {}) => {
    const w = Math.round(height * (69 / 25));
    return (
      <svg width={w} height={height} viewBox="0 0 69 25" fill="currentColor" class={className}>
        <path d="M5.85522 23.7673C4.18138 23.7673 2.86445 23.2873 1.90445 22.3273C0.969068 21.3673 0.501372 20.0627 0.501372 18.4135V0.210419H4.71061V18.2289C4.71061 18.795 4.88292 19.2627 5.22753 19.632C5.57215 19.9766 6.02753 20.1489 6.59368 20.1489H10.5444V23.7673H5.85522ZM0.5 8.55503V4.93657H10.5814V8.55503H0.5Z" />
        <path d="M14.4254 23.7673V10.2904C14.4254 8.61657 14.8931 7.31196 15.8285 6.37657C16.7885 5.41657 18.1054 4.93657 19.7792 4.93657H24.3208V8.55503H20.5546C19.9638 8.55503 19.4962 8.72734 19.1515 9.07196C18.8315 9.41657 18.6716 9.88427 18.6716 10.475V23.7673H14.4254Z" />
        <path d="M36.2746 24.2104C34.4531 24.2104 32.8654 23.8535 31.5115 23.1397C30.1577 22.4012 29.1115 21.392 28.3731 20.112C27.6346 18.832 27.2654 17.392 27.2654 15.792V4.93657H31.5115V15.755C31.5115 16.715 31.7208 17.5643 32.1392 18.3027C32.5823 19.0166 33.1608 19.5827 33.8746 20.0012C34.6131 20.395 35.4131 20.592 36.2746 20.592C37.1361 20.592 37.9238 20.395 38.6377 20.0012C39.3761 19.5827 39.9546 19.0166 40.373 18.3027C40.8161 17.5643 41.0377 16.715 41.0377 15.755V4.93657H45.2838V15.792C45.2838 17.392 44.9023 18.832 44.1392 20.112C43.4007 21.392 42.3546 22.4012 41.0007 23.1397C39.6715 23.8535 38.0961 24.2104 36.2746 24.2104Z" />
        <path d="M58.4645 24.2104C57.4799 24.2104 56.5937 23.9397 55.806 23.3981C55.0429 22.8566 54.4891 22.1304 54.1445 21.2196L48.3845 4.93657H52.9999L57.9106 19.5581C57.9845 19.7304 58.0706 19.8535 58.1691 19.9273C58.2676 20.0012 58.3783 20.0381 58.5014 20.0381C58.6245 20.0381 58.7352 20.0012 58.8337 19.9273C58.9568 19.8535 59.0429 19.7304 59.0922 19.5581L64.0399 4.93657H68.5814L62.7845 21.2196C62.4645 22.1304 61.9106 22.8566 61.1229 23.3981C60.3352 23.9397 59.4491 24.2104 58.4645 24.2104Z" />
      </svg>
    );
  },
};
