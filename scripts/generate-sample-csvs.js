/**
 * FILE SUMMARY: Regenerates the bundled coverage-analysis sample CSVs.
 * Writes top-50 employer/bank lists to public/samples/. Run with `node scripts/generate-sample-csvs.js`.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { serializeCsv } from '../server/lib/csv.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'public', 'samples');

// Largest US employers by total headcount (private + federal + state/local government),
// sorted descending. Private-sector counts come from the Wikipedia "List of largest
// United States–based employers globally" page; government counts come from OPM, the
// VA, the USPS, and state OPM-equivalent agencies. Counts are approximate and vary
// year-to-year. The `employees` field is metadata only — it is NOT written to the CSV
// (which is name,state,domain) but it documents the sort order.
const employers = [
  { name: 'Department of Defense', state: 'VA', domain: 'defense.gov', employees: 2_900_000 },
  { name: 'Walmart', state: 'AR', domain: 'walmart.com', employees: 2_100_000 },
  { name: 'Amazon', state: 'WA', domain: 'amazon.com', employees: 1_525_000 },
  { name: 'Allied Universal', state: 'CA', domain: 'aus.com', employees: 800_000 },
  { name: 'Accenture', state: 'IL', domain: 'accenture.com', employees: 742_000 },
  { name: 'United States Postal Service', state: 'DC', domain: 'usps.com', employees: 600_000 },
  { name: 'FedEx', state: 'TN', domain: 'fedex.com', employees: 547_000 },
  { name: 'United Parcel Service', state: 'GA', domain: 'ups.com', employees: 536_000 },
  { name: 'Department of Veterans Affairs', state: 'DC', domain: 'va.gov', employees: 486_000 },
  { name: 'Home Depot', state: 'GA', domain: 'homedepot.com', employees: 465_000 },
  { name: 'Concentrix', state: 'CA', domain: 'concentrix.com', employees: 440_000 },
  { name: 'UnitedHealth Group', state: 'MN', domain: 'unitedhealthgroup.com', employees: 440_000 },
  { name: 'Target', state: 'MN', domain: 'target.com', employees: 415_000 },
  { name: 'Kroger', state: 'OH', domain: 'kroger.com', employees: 414_000 },
  { name: 'Marriott International', state: 'MD', domain: 'marriott.com', employees: 411_000 },
  { name: 'Ernst & Young', state: 'NY', domain: 'ey.com', employees: 395_000 },
  { name: 'Starbucks', state: 'WA', domain: 'starbucks.com', employees: 381_000 },
  { name: 'Marsh McLennan', state: 'NY', domain: 'marshmclennan.com', employees: 365_000 },
  { name: 'TJX', state: 'MA', domain: 'tjx.com', employees: 349_000 },
  { name: 'Cognizant', state: 'NJ', domain: 'cognizant.com', employees: 344_000 },
  { name: 'Walgreens Boots Alliance', state: 'IL', domain: 'walgreensbootsalliance.com', employees: 330_000 },
  { name: 'City of New York', state: 'NY', domain: 'nyc.gov', employees: 325_000 },
  { name: 'PepsiCo', state: 'NY', domain: 'pepsico.com', employees: 318_000 },
  { name: 'Costco', state: 'WA', domain: 'costco.com', employees: 316_000 },
  { name: 'JPMorgan Chase', state: 'NY', domain: 'jpmorganchase.com', employees: 310_000 },
  { name: 'Lowe\'s', state: 'NC', domain: 'lowes.com', employees: 300_000 },
  { name: 'Albertsons', state: 'ID', domain: 'albertsons.com', employees: 285_000 },
  { name: 'State of California', state: 'CA', domain: 'ca.gov', employees: 250_000 },
  { name: 'Publix', state: 'FL', domain: 'publix.com', employees: 250_000 },
  { name: 'State of New York', state: 'NY', domain: 'ny.gov', employees: 250_000 },
  { name: 'Citigroup', state: 'NY', domain: 'citigroup.com', employees: 240_000 },
  { name: 'Microsoft', state: 'WA', domain: 'microsoft.com', employees: 228_000 },
  { name: 'Department of Homeland Security', state: 'DC', domain: 'dhs.gov', employees: 228_000 },
  { name: 'Walt Disney Company', state: 'CA', domain: 'disney.com', employees: 225_000 },
  { name: 'HCA Healthcare', state: 'TN', domain: 'hcahealthcare.com', employees: 220_000 },
  { name: 'CVS Health', state: 'RI', domain: 'cvshealth.com', employees: 219_000 },
  { name: 'Wells Fargo', state: 'CA', domain: 'wellsfargo.com', employees: 213_000 },
  { name: 'Bank of America', state: 'NC', domain: 'bankofamerica.com', employees: 212_000 },
  { name: 'Dollar Tree', state: 'VA', domain: 'dollartree.com', employees: 210_000 },
  { name: 'Dollar General', state: 'TN', domain: 'dollargeneral.com', employees: 190_000 },
  { name: 'RTX', state: 'VA', domain: 'rtx.com', employees: 180_000 },
  { name: 'Boeing', state: 'VA', domain: 'boeing.com', employees: 170_000 },
  { name: 'General Motors', state: 'MI', domain: 'gm.com', employees: 163_000 },
  { name: 'AT&T', state: 'TX', domain: 'att.com', employees: 150_000 },
  { name: 'Johnson & Johnson', state: 'NJ', domain: 'jnj.com', employees: 150_000 },
  { name: 'Tesla', state: 'TX', domain: 'tesla.com', employees: 140_000 },
  { name: 'Lockheed Martin', state: 'MD', domain: 'lockheedmartin.com', employees: 122_000 },
  { name: 'Dell Technologies', state: 'TX', domain: 'dell.com', employees: 120_000 },
  { name: 'Procter & Gamble', state: 'OH', domain: 'pg.com', employees: 100_000 },
  { name: 'Northrop Grumman', state: 'VA', domain: 'northropgrumman.com', employees: 95_000 },
  { name: 'Honeywell', state: 'NC', domain: 'honeywell.com', employees: 95_000 },
  { name: '3M', state: 'MN', domain: '3m.com', employees: 90_000 },
  { name: 'Cisco', state: 'CA', domain: 'cisco.com', employees: 84_000 },
  { name: 'Nike', state: 'OR', domain: 'nike.com', employees: 80_000 },
  { name: 'Chevron', state: 'TX', domain: 'chevron.com', employees: 45_000 },
];

// Largest US consumer-banking relationships, sorted by approximate active-customer count
// (descending). Mixes traditional banks, fintech, brokerages with bank charters, payment
// apps with banking products, and the largest credit unions. The `customers` field is
// metadata only (NOT written to CSV) and documents the sort order.
//
// Excluded as defunct/acquired:
//   BBVA USA (acquired by PNC, 2021)
//   First Republic Bank (failed, 2023; absorbed by JPMorgan Chase)
//   People's United Bank (acquired by M&T, 2022)
//   Venmo (payment-only product of PayPal, no bank charter)
const banks = [
  // Tier 1 — 50M+
  { name: 'Bank of America', domain: 'bankofamerica.com', customers: 69_000_000 },
  { name: 'Chase', domain: 'chase.com', customers: 66_000_000 },
  { name: 'Wells Fargo', domain: 'wellsfargo.com', customers: 64_000_000 },
  { name: 'Cash App', domain: 'cash.app', customers: 55_000_000 },
  { name: 'Fidelity Investments', domain: 'fidelity.com', customers: 52_000_000 },
  { name: 'Vanguard', domain: 'vanguard.com', customers: 50_000_000 },
  // Tier 2 — 20-50M
  { name: 'Citibank', domain: 'citi.com', customers: 45_000_000 },
  { name: 'Charles Schwab', domain: 'schwab.com', customers: 39_000_000 },
  { name: 'U.S. Bank', domain: 'usbank.com', customers: 35_000_000 },
  { name: 'Capital One', domain: 'capitalone.com', customers: 28_000_000 },
  { name: 'PNC Bank', domain: 'pnc.com', customers: 24_000_000 },
  { name: 'TD Bank', domain: 'td.com', customers: 22_000_000 },
  { name: 'Chime', domain: 'chime.com', customers: 22_000_000 },
  // Tier 3 — 10-20M  (includes major 401k recordkeepers)
  { name: 'Truist', domain: 'truist.com', customers: 18_000_000 },
  { name: 'Empower Retirement', domain: 'empower.com', customers: 18_000_000 },
  { name: 'SoFi', domain: 'sofi.com', customers: 14_000_000 },
  { name: 'Navy Federal Credit Union', domain: 'navyfederal.org', customers: 13_000_000 },
  { name: 'USAA', domain: 'usaa.com', customers: 13_000_000 },
  { name: 'Discover Bank', domain: 'discover.com', customers: 12_000_000 },
  { name: 'Ally Bank', domain: 'ally.com', customers: 11_000_000 },
  { name: 'Regions Bank', domain: 'regions.com', customers: 10_000_000 },
  // Tier 4 — 5-10M
  { name: 'Acorns', domain: 'acorns.com', customers: 9_000_000 },
  { name: 'Huntington Bank', domain: 'huntington.com', customers: 9_000_000 },
  { name: 'Voya Financial', domain: 'voya.com', customers: 8_000_000 },
  { name: 'Fifth Third Bank', domain: '53.com', customers: 8_000_000 },
  { name: 'Edward Jones', domain: 'edwardjones.com', customers: 7_000_000 },
  { name: 'Citizens Bank', domain: 'citizensbank.com', customers: 7_000_000 },
  { name: 'Principal Financial', domain: 'principal.com', customers: 7_000_000 },
  { name: 'M&T Bank', domain: 'mtb.com', customers: 6_000_000 },
  { name: 'KeyBank', domain: 'key.com', customers: 6_000_000 },
  { name: 'LPL Financial', domain: 'lpl.com', customers: 6_000_000 },
  { name: 'Greenlight', domain: 'greenlight.com', customers: 6_000_000 },
  { name: 'BMO Harris', domain: 'bmoharris.com', customers: 5_000_000 },
  // Tier 5 — 1-5M
  { name: 'American Express', domain: 'americanexpress.com', customers: 4_000_000 },
  { name: 'State Employees Credit Union', domain: 'ncsecu.org', customers: 3_000_000 },
  { name: 'PenFed Credit Union', domain: 'penfed.org', customers: 3_000_000 },
  { name: 'Interactive Brokers', domain: 'interactivebrokers.com', customers: 3_300_000 },
  { name: 'Merrill Lynch', domain: 'ml.com', customers: 3_000_000 },
  { name: 'Webster Bank', domain: 'websterbank.com', customers: 2_800_000 },
  { name: 'Comerica Bank', domain: 'comerica.com', customers: 2_700_000 },
  { name: 'First Citizens BancShares', domain: 'firstcitizens.com', customers: 2_500_000 },
  { name: 'Zions Bank', domain: 'zionsbank.com', customers: 2_300_000 },
  { name: 'T. Rowe Price', domain: 'troweprice.com', customers: 2_000_000 },
  { name: 'Varo', domain: 'varomoney.com', customers: 2_000_000 },
  { name: 'Current', domain: 'current.com', customers: 2_000_000 },
  { name: 'Upgrade', domain: 'upgrade.com', customers: 2_000_000 },
  { name: 'Marcus by Goldman Sachs', domain: 'marcus.com', customers: 1_800_000 },
  { name: 'BECU', domain: 'becu.org', customers: 1_500_000 },
  { name: 'SchoolsFirst Federal Credit Union', domain: 'schoolsfirstfcu.org', customers: 1_400_000 },
  { name: 'Mountain America Credit Union', domain: 'macu.com', customers: 1_200_000 },
  { name: 'Golden 1 Credit Union', domain: 'golden1.com', customers: 1_100_000 },
  { name: 'First Tech Federal Credit Union', domain: 'firsttechfed.com', customers: 1_000_000 },
  { name: 'Alliant Credit Union', domain: 'alliantcreditunion.org', customers: 1_000_000 },
  { name: 'Digital Federal Credit Union', domain: 'dcu.org', customers: 1_000_000 },
  { name: 'Suncoast Credit Union', domain: 'suncoastcreditunion.com', customers: 1_000_000 },
  { name: 'VyStar Credit Union', domain: 'vystarcu.org', customers: 1_000_000 },
  { name: 'First Horizon Bank', domain: 'firsthorizon.com', customers: 1_000_000 },
  // Tier 6 — sub-1M
  { name: 'Frost Bank', domain: 'frostbank.com', customers: 800_000 },
  { name: 'Valley National Bank', domain: 'valley.com', customers: 700_000 },
  { name: 'First National Bank', domain: 'fnb-online.com', customers: 700_000 },
  { name: 'Synovus Bank', domain: 'synovus.com', customers: 700_000 },
  { name: 'Pinnacle Bank', domain: 'pnfp.com', customers: 500_000 },
];

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, 'employer_sample.csv'), serializeCsv(employers, ['name', 'state', 'domain']));
writeFileSync(resolve(OUT_DIR, 'bank_sample.csv'),     serializeCsv(banks,     ['name', 'domain']));
console.log(`Wrote ${employers.length} employers and ${banks.length} banks to ${OUT_DIR}`);
