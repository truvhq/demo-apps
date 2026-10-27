/**
 * FILE SUMMARY: The test data every Truv account has, written out so it can be searched and tried.
 *
 * Source: the Truv docs testing pages (Test Credentials, Income & Employment, Assets, Direct Deposit
 * Switch, Paycheck Linked Lending, Education, Test Documents, GSE Testing), copied on VERIFIED_ON.
 * Nothing here is invented. When the docs change, regenerate this file or edit it by hand and bump
 * VERIFIED_ON. These logins are reserved: a custom scenario cannot reuse them.
 */

export const VERIFIED_ON = '2026-10-26';
export const DOCS = 'https://docs.truv.com';

export const GROUPS = [
 {
  "id": "universal",
  "name": "Sign in, errors and waiting",
  "blurb": "Work with every product. Use them to test MFA, failures and slow tasks.",
  "docs": "/developers/testing/test-credentials"
 },
 {
  "id": "income",
  "name": "Income and employment",
  "blurb": "Payroll logins. Sign in to the Truv Payroll Provider. The password is goodpassword unless noted.",
  "docs": "/developers/testing/income-employment"
 },
 {
  "id": "assets",
  "name": "Bank accounts and assets",
  "blurb": "Bank logins. Search for Truv Bank (OAuth or non-OAuth) in Bridge.",
  "docs": "/developers/testing/assets"
 },
 {
  "id": "dds",
  "name": "Direct deposit switch",
  "blurb": "Payroll logins, with an account block on the bridge token.",
  "docs": "/developers/testing/direct-deposit-switch"
 },
 {
  "id": "pll",
  "name": "Paycheck-linked loans",
  "blurb": "Payroll logins that test eligibility rules.",
  "docs": "/developers/testing/paycheck-linked-lending"
 },
 {
  "id": "mortgage",
  "name": "Mortgage (Fannie Mae and Freddie Mac)",
  "blurb": "Borrower logins and ready-made report IDs for Day 1 Certainty and AIM.",
  "docs": "/developers/testing/gse-testing"
 },
 {
  "id": "education",
  "name": "Education",
  "blurb": "No login. The last four digits of the SSN on the order pick the student record.",
  "docs": "/developers/testing/education"
 },
 {
  "id": "documents",
  "name": "Documents",
  "blurb": "No login. The file name decides the result, not the contents.",
  "docs": "/developers/testing/test-documents"
 }
];

// Logins. status is the task status the docs say you get. products are the products the docs list it under.
export const LOGINS = [
  {"group": "universal", "section": "Sign in, errors and waiting", "id": "UNI-1", "login": "goodlogin", "password": "goodpassword", "returns": "Successful login with complete data", "products": ["income", "assets", "deposit_switch", "pll"], "status": "done"},
  {"group": "universal", "section": "Sign in, errors and waiting", "id": "UNI-2", "login": "goodlogin", "password": "no_data", "returns": "Successful login, provider returns zero records", "products": ["income", "assets"], "status": "no_data"},
  {"group": "universal", "section": "Sign in, errors and waiting", "id": "UNI-3", "login": "goodlogin", "password": "mfa", "returns": "MFA: asks for a code", "products": ["income", "assets", "pll"], "status": "mfa", "note": "Enter the code 12345."},
  {"group": "universal", "section": "Sign in, errors and waiting", "id": "UNI-4", "login": "goodlogin", "password": "mfa_captcha", "returns": "MFA: asks for a captcha answer", "products": ["income"], "status": "mfa", "note": "Enter the answer 9M4BP. Use it on the first sign-in, then refresh, to see a refresh fail with mfa_error."},
  {"group": "universal", "section": "Sign in, errors and waiting", "id": "UNI-5", "login": "goodlogin", "password": "mfa_select", "returns": "MFA: asks which way to verify", "products": ["income"], "status": "mfa", "note": "Pick a verification method."},
  {"group": "universal", "section": "Sign in, errors and waiting", "id": "UNI-6", "login": "goodlogin", "password": "longcheck", "returns": "Takes about 30 seconds to finish", "products": ["income"], "status": "done", "note": "The task takes about 30 seconds."},
  {"group": "universal", "section": "Sign in, errors and waiting", "id": "UNI-7", "login": "error.user", "password": "login_error", "returns": "Incorrect credentials", "products": ["income", "assets", "deposit_switch", "pll"], "status": "login_error"},
  {"group": "universal", "section": "Sign in, errors and waiting", "id": "UNI-8", "login": "error.user", "password": "mfa_error", "returns": "MFA verification failed", "products": ["income", "deposit_switch", "pll"], "status": "mfa_error"},
  {"group": "universal", "section": "Sign in, errors and waiting", "id": "UNI-9", "login": "error.user", "password": "account_locked", "returns": "Account locked by provider", "products": ["income", "assets", "deposit_switch", "pll"], "status": "account_locked"},
  {"group": "universal", "section": "Sign in, errors and waiting", "id": "UNI-10", "login": "error.user", "password": "unavailable", "returns": "Provider under maintenance", "products": ["income", "assets"], "status": "unavailable"},
  {"group": "universal", "section": "Sign in, errors and waiting", "id": "UNI-11", "login": "error.user", "password": "error", "returns": "Generic login error", "products": ["income", "assets"], "status": "error"},
  {"group": "universal", "section": "Sign in, errors and waiting", "id": "UNI-12", "login": "error.user", "password": "config_error", "returns": "Organization ID configuration failure", "products": ["income", "deposit_switch", "pll"], "status": "config_error"},
  {"group": "income", "section": "Pay frequency", "id": "VOIE-PF1", "login": "goodlogin", "password": "goodpassword", "returns": "The standard login: a complete report with bi-weekly (BW) paystubs, an annual income summary, W-2s and bank account allocations", "products": ["income", "employment"], "status": "done", "sample": "https://truv.com/wp-content/uploads/2025/11/report-goodlogin.pdf?v=1"},
  {"group": "income", "section": "Pay frequency", "id": "VOIE-PF2", "login": "goodlogin.weekly", "password": "goodpassword", "returns": "Paid weekly (W)", "products": ["income", "employment"], "status": "done", "sample": "https://truv.com/wp-content/uploads/2025/11/report-goodlogin.weekly.pdf?v=1"},
  {"group": "income", "section": "Pay frequency", "id": "VOIE-PF3", "login": "goodlogin.semimonthly", "password": "goodpassword", "returns": "Paid semi-monthly (SM)", "products": ["income", "employment"], "status": "done", "sample": "https://truv.com/wp-content/uploads/2025/11/report-goodlogin.semimonthly.pdf?v=1"},
  {"group": "income", "section": "Pay frequency", "id": "VOIE-PF4", "login": "goodlogin.monthly", "password": "goodpassword", "returns": "Paid monthly (M)", "products": ["income", "employment"], "status": "done", "sample": "https://truv.com/wp-content/uploads/2025/11/report-goodlogin.monthly.pdf?v=1"},
  {"group": "income", "section": "Pay frequency", "id": "VOIE-PF5", "login": "goodlogin.semiannually", "password": "goodpassword", "returns": "Paid semi-annual (SA)", "products": ["income", "employment"], "status": "done"},
  {"group": "income", "section": "Pay frequency", "id": "VOIE-PF6", "login": "goodlogin.nofrequency", "password": "goodpassword", "returns": "No pay frequency reported, and none can be worked out. Also returns no pay rate and hourly income.", "products": ["income", "employment"], "status": "done"},
  {"group": "income", "section": "Earnings composition", "id": "VOIE-C1", "login": "goodlogin.bonus", "password": "goodpassword", "returns": "Wages plus periodic bonus payments (bonus, bonus_ytd, earnings[].category: \"bonus\")", "products": ["income", "employment"], "status": "done"},
  {"group": "income", "section": "Earnings composition", "id": "VOIE-C2", "login": "goodlogin.bonus.commission", "password": "goodpassword", "returns": "Wages plus bonus and commission on the same statements", "products": ["income", "employment"], "status": "done"},
  {"group": "income", "section": "Earnings composition", "id": "VOIE-C3", "login": "goodlogin.commission", "password": "goodpassword", "returns": "Commission only earner. Monthly statements where gross pay equals commission, with no hourly or salary base", "products": ["income", "employment"], "status": "done"},
  {"group": "income", "section": "Employment type", "id": "VOIE-E1", "login": "fulltime", "password": "goodpassword", "returns": "Full-time salesperson with regular salaried paystubs", "products": ["income", "employment"], "status": "done", "ssn": "2211"},
  {"group": "income", "section": "Employment type", "id": "VOIE-E2", "login": "hourly.part-time", "password": "goodpassword", "returns": "Hourly part-time worker with variable hours per stub", "products": ["income", "employment"], "status": "done", "ssn": "666382548"},
  {"group": "income", "section": "Employment type", "id": "VOIE-E3", "login": "partial.data", "password": "goodpassword", "returns": "Payroll connection succeeds but returns sparse employment metadata - job_title, job_type, and original_hire_date come back null. Use to validate your handling of null fields on the employment object.", "products": ["income", "employment"], "status": "done", "ssn": "2222"},
  {"group": "income", "section": "Employment type", "id": "VOIE-E4", "login": "goodlogin.min-data", "password": "goodpassword", "returns": "Minimal information returned (no W-2s, sparse statements)", "products": ["income", "employment"], "status": "done", "ssn": "991-91-9991"},
  {"group": "income", "section": "Employment type", "id": "VOIE-E5", "login": "multiple.employments", "password": "goodpassword", "returns": "Multiple different employers attached to one applicant", "products": ["income", "employment"], "status": "done"},
  {"group": "income", "section": "Employment type", "id": "VOIE-E6", "login": "multiple.employments2", "password": "goodpassword", "returns": "Multiple same-employer positions (e.g. transferred roles)", "products": ["income", "employment"], "status": "done", "ssn": "7740"},
  {"group": "income", "section": "Employment type", "id": "VOIE-E7", "login": "nonactive", "password": "goodpassword", "returns": "Employment with an end_date set and is_active: false", "products": ["income", "employment"], "status": "done", "ssn": "1890"},
  {"group": "income", "section": "Employment type", "id": "VOIE-E8", "login": "hourly.fulltime", "password": "goodpassword", "returns": "Hourly full-time worker - job_type is F and income_unit is HOURLY. Hours alternate between pay periods, so gross_pay moves with them. Use alongside VOIE-E1 (salaried full-time) and VOIE-E2 (hourly part-time) to cover both axes.", "products": ["income", "employment"], "status": "done", "ssn": "1122"},
  {"group": "income", "section": "Tenure", "id": "VOIE-T1", "login": "goodlogin.tn1", "password": "goodpassword", "returns": "Active employment with less than 12 months tenure at the current employer", "products": ["income", "employment"], "status": "done"},
  {"group": "income", "section": "Tenure", "id": "VOIE-T2", "login": "goodlogin.tn2", "password": "goodpassword", "returns": "Less than 12 months tenure, already ended - is_active: false with an end_date set shortly after the start date, and no statements", "products": ["income", "employment"], "status": "done"},
  {"group": "income", "section": "Benefits and special cases", "id": "VOIE-B1", "login": "military", "password": "goodpassword", "returns": "Military MyPay data via the DFAS myPay provider", "products": ["income", "employment"], "status": "done"},
  {"group": "income", "section": "Benefits and special cases", "id": "VOIE-B2", "login": "unemployment", "password": "goodpassword", "returns": "Weekly unemployment benefits", "products": ["income", "employment"], "status": "done"},
  {"group": "income", "section": "Gig and shift workers", "id": "VOIE-G1", "login": "goodlogin.shift", "password": "goodpassword", "returns": "Gig worker with earned wage access - use for testing gig-payroll VOIE flows where hours and earnings cadence differ from W-2 payroll", "products": ["income", "employment"], "status": "done"},
  {"group": "income", "section": "Income changes and outliers", "id": "VOIE-D1", "login": "pay.raise", "password": "goodpassword", "returns": "Ongoing pay increase. gross_pay steps up across consecutive statements", "products": ["income", "employment"], "status": "done"},
  {"group": "income", "section": "Income changes and outliers", "id": "VOIE-D2", "login": "pay.reduction", "password": "goodpassword", "returns": "Ongoing pay decrease. gross_pay steps down across consecutive statements", "products": ["income", "employment"], "status": "done"},
  {"group": "income", "section": "Income changes and outliers", "id": "VOIE-D3", "login": "extreme.income", "password": "goodpassword", "returns": "Very high values for gross_pay, hours, and bonus on every statement", "products": ["income", "employment"], "status": "done"},
  {"group": "income", "section": "Income changes and outliers", "id": "VOIE-D4", "login": "outlier.paystub", "password": "goodpassword", "returns": "A steady history with one outlier statement far larger than the rest", "products": ["income", "employment"], "status": "done"},
  {"group": "assets", "section": "Quick start", "id": "VOA-0", "login": "goodlogin", "password": "goodpassword", "returns": "Complete asset data: accounts, balances, transactions, derived income sources", "products": ["assets"], "status": "done"},
  {"group": "assets", "section": "Account types", "id": "VOA-A1", "login": "goodlogin.checking", "password": "goodpassword", "returns": "Checking", "products": ["assets"], "status": "done"},
  {"group": "assets", "section": "Account types", "id": "VOA-A2", "login": "goodlogin.checking.savings", "password": "goodpassword", "returns": "Checking, Savings", "products": ["assets"], "status": "done"},
  {"group": "assets", "section": "Account types", "id": "VOA-A3", "login": "goodlogin.card", "password": "goodpassword", "returns": "Checking, Savings", "products": ["assets"], "status": "done"},
  {"group": "assets", "section": "Account types", "id": "VOA-A4", "login": "goodlogin.inv", "password": "goodpassword", "returns": "Investment", "products": ["assets"], "status": "done"},
  {"group": "assets", "section": "Account types", "id": "VOA-A5", "login": "goodlogin.all", "password": "goodpassword", "returns": "Checking, Savings, Investment", "products": ["assets"], "status": "done"},
  {"group": "assets", "section": "Account types", "id": "VOA-A6", "login": "sit", "password": "goodpassword", "returns": "Certificate of Deposit, Stocks, Bonds", "products": ["assets"], "status": "done"},
  {"group": "assets", "section": "Bank income sources", "id": "VOA-I1", "login": "goodlogin.gig", "password": "goodpassword", "returns": "income_category: GIG_ECONOMY", "products": ["assets"], "status": "done"},
  {"group": "assets", "section": "Bank income sources", "id": "VOA-I2", "login": "goodlogin.gov.employee", "password": "goodpassword", "returns": "income_category: GOVERNMENT_EMPLOYMENT", "products": ["assets"], "status": "done"},
  {"group": "assets", "section": "Bank income sources", "id": "VOA-I3", "login": "goodlogin.ewa", "password": "goodpassword", "returns": "income_category: EWA_PAYROLL", "products": ["assets"], "status": "done"},
  {"group": "assets", "section": "Bank income sources", "id": "VOA-I4", "login": "goodlogin.retirement", "password": "goodpassword", "returns": "income_category: RETIREMENT", "products": ["assets"], "status": "done"},
  {"group": "assets", "section": "Bank income sources", "id": "VOA-I5", "login": "goodlogin.rental", "password": "goodpassword", "returns": "income_category: RENTAL", "products": ["assets"], "status": "done"},
  {"group": "assets", "section": "Bank income sources", "id": "VOA-I6", "login": "goodlogin.unemployment", "password": "goodpassword", "returns": "income_category: UNEMPLOYMENT", "products": ["assets"], "status": "done"},
  {"group": "assets", "section": "Bank income sources", "id": "VOA-I7", "login": "goodlogin.gov.benefits", "password": "goodpassword", "returns": "income_category: GOVERNMENT_BENEFITS", "products": ["assets"], "status": "done"},
  {"group": "assets", "section": "Bank income sources", "id": "VOA-I8", "login": "goodlogin.benefits", "password": "goodpassword", "returns": "income_category: PRIVATE_BENEFITS", "products": ["assets"], "status": "done"},
  {"group": "assets", "section": "Bank income sources", "id": "VOA-I9", "login": "goodlogin.tax.credits", "password": "goodpassword", "returns": "income_category: PAYCHECK", "products": ["assets"], "status": "done"},
  {"group": "assets", "section": "Bank income sources", "id": "VOA-I10", "login": "goodlogin.interest", "password": "goodpassword", "returns": "income_category: PAYCHECK", "products": ["assets"], "status": "done"},
  {"group": "assets", "section": "Risk profiles", "id": "VOA-R1", "login": "goodlogin", "password": "good_asset", "returns": "30 days of data - use to test recency-based decisioning", "products": ["assets"], "status": "done"},
  {"group": "assets", "section": "Risk profiles", "id": "VOA-R2", "login": "goodlogin", "password": "low_risk", "returns": "Low-risk consumer profile", "products": ["assets"], "status": "done"},
  {"group": "assets", "section": "Risk profiles", "id": "VOA-R3", "login": "goodlogin", "password": "high_risk", "returns": "High-risk consumer profile", "products": ["assets"], "status": "done"},
  {"group": "pll", "section": "Eligibility", "id": "PLL-T1", "login": "goodlogin.tn1", "password": "goodpassword", "returns": "Active employment with less than 12 months tenure - use to confirm your eligibility check correctly declines or routes this borrower", "products": ["pll"], "status": "done"},
  {"group": "pll", "section": "Eligibility", "id": "PLL-T2", "login": "goodlogin.tn2", "password": "goodpassword", "returns": "Active employment with less than 12 months tenure (alternate profile when your QA matrix needs multiple sub-12-month test cases)", "products": ["pll"], "status": "done"},
  {"group": "dds", "section": "Switch behavior", "id": "DDS-A", "login": "goodlogin", "password": "goodpassword", "returns": "A successful switch. Choose the allocation type on the bridge token: entire, amount (such as 500.00) or percent (such as 50).", "products": ["deposit_switch"], "status": "done"},
  {"group": "dds", "section": "Switch behavior", "id": "DDS-X1", "login": "goodlogin", "password": "goodpassword", "returns": "Fails with config_error when the customer is already at 100% allocation", "products": ["deposit_switch"], "status": "config_error", "note": "The failure comes from the account already being fully allocated, not from the login."},
  {"group": "mortgage", "section": "Fannie Mae Day 1 Certainty borrowers", "id": "GSE-firsttimeborrower", "login": "firsttimeborrower", "password": "goodpassword", "returns": "Borrower Alice Firstimer, SSN 991-91-9991", "products": ["income"], "status": "done", "sample": "https://truv.com/wp-content/uploads/2025/01/report-firsttimeborrower.pdf?v=1"},
  {"group": "mortgage", "section": "Fannie Mae Day 1 Certainty borrowers", "id": "GSE-fannie-test.case4", "login": "fannie-test.case4", "password": "goodpassword", "returns": "Borrower Pitt Rock, SSN 666-00-6666", "products": ["income"], "status": "done", "sample": "https://truv.com/wp-content/uploads/2025/01/report-fannie-test.case4_.pdf?v=1"},
  {"group": "mortgage", "section": "Fannie Mae Day 1 Certainty borrowers", "id": "GSE-fannie-test.case5", "login": "fannie-test.case5", "password": "goodpassword", "returns": "Borrower Suzi Builder, SSN 999-60-6666", "products": ["income"], "status": "done", "sample": "https://truv.com/wp-content/uploads/2025/01/report-fannie-test.case5_.pdf?v=1"},
  {"group": "mortgage", "section": "Fannie Mae Day 1 Certainty borrowers", "id": "GSE-fannie-test.case6", "login": "fannie-test.case6", "password": "goodpassword", "returns": "Borrower John Homeowner, SSN 999-40-5000", "products": ["income"], "status": "done", "sample": "https://truv.com/wp-content/uploads/2025/01/report-fannie-test.case6_.pdf?v=1"},
  {"group": "mortgage", "section": "Fannie Mae Day 1 Certainty borrowers", "id": "GSE-fannie-test.case7", "login": "fannie-test.case7", "password": "goodpassword", "returns": "Borrower Lucky Knowscore, SSN 999-42-2345", "products": ["income"], "status": "done", "sample": "https://truv.com/wp-content/uploads/2025/01/report-fannie-test.case7_.pdf?v=1"},
];

// Education: no login. Put these last four digits at the end of the applicant's SSN.
export const IDENTITIES = [
  {"section": "Completed degrees, no enrollment", "ssnLast4": "9901", "dob": "04/21/1982", "returns": "Bachelor of Science"},
  {"section": "Completed degrees, no enrollment", "ssnLast4": "9902", "dob": "12/22/1980", "returns": "Bachelor of Arts"},
  {"section": "Completed degrees, no enrollment", "ssnLast4": "9903", "dob": "04/21/1968", "returns": "Associate of Applied Science"},
  {"section": "Completed degrees, no enrollment", "ssnLast4": "9904", "dob": "03/25/1981", "returns": "Master's"},
  {"section": "Completed degrees, no enrollment", "ssnLast4": "9905", "dob": "09/06/1964", "returns": "PhD"},
  {"section": "Completed degrees, no enrollment", "ssnLast4": "9906", "dob": "04/09/1980", "returns": "Doctor of Optometry"},
  {"section": "Completed degrees, no enrollment", "ssnLast4": "9907", "dob": "01/20/1982", "returns": "Certificate of Completion in Medical Technology"},
  {"section": "Completed degrees, no enrollment", "ssnLast4": "9908", "dob": "01/16/1980", "returns": "Two master's degrees awarded in the same term - MBA and Master of Science"},
  {"section": "Completed degrees, no enrollment", "ssnLast4": "9909", "dob": "05/28/1967", "returns": "Master of Arts and Bachelor of Arts, awarded years apart"},
  {"section": "Completed degrees, no enrollment", "ssnLast4": "9910", "dob": "07/11/1993", "returns": "Master of Public Health"},
  {"section": "Completed degrees, no enrollment", "ssnLast4": "9911", "dob": "05/27/1991", "returns": "Master of Science and Bachelor of Science, awarded two years apart"},
  {"section": "Current enrollment", "ssnLast4": "9916", "dob": "03/26/1980", "returns": "A currently enrolled student at two schools - one full time, one whose enrollment type the school withheld - plus two completed nursing degrees"},
  {"section": "Past enrollment", "ssnLast4": "9914", "dob": "10/24/1988", "returns": "Enrollment type withheld by the school. Also: Master of Arts and Bachelor of Arts"},
  {"section": "Past enrollment", "ssnLast4": "9915", "dob": "05/24/1996", "returns": "Enrolled less than half time, at two schools. Also: Bachelor of Sciences"},
  {"section": "Past enrollment", "ssnLast4": "9917", "dob": "09/23/2001", "returns": "Enrolled full time. Also: Bachelor of Sciences"},
  {"section": "Past enrollment", "ssnLast4": "9918", "dob": "02/10/1985", "returns": "Enrolled three-quarter time. Also: Master of Arts"},
  {"section": "Past enrollment", "ssnLast4": "9919", "dob": "08/19/1977", "returns": "Enrolled full time. Also: Master's"},
  {"section": "Past enrollment", "ssnLast4": "9921", "dob": "10/16/2003", "returns": "Enrollment type withheld by the school"},
  {"section": "Past enrollment", "ssnLast4": "9922", "dob": "01/12/1978", "returns": "Enrolled full time"},
  {"section": "Past enrollment", "ssnLast4": "9923", "dob": "06/20/1994", "returns": "Enrolled full time"},
  {"section": "Past enrollment", "ssnLast4": "9924", "dob": "08/18/1979", "returns": "Enrolled half time, at two schools"},
  {"section": "Past enrollment", "ssnLast4": "9925", "dob": "02/16/1968", "returns": "Enrolled half time"},
  {"section": "Past enrollment", "ssnLast4": "9928", "dob": "02/03/1998", "returns": "Enrolled full time"},
  {"section": "Empty and unconfirmed records", "ssnLast4": "9912", "dob": "-", "returns": "No education record found for the student"},
  {"section": "Empty and unconfirmed records", "ssnLast4": "9920", "dob": "-", "returns": "No education record found for the student"},
  {"section": "Empty and unconfirmed records", "ssnLast4": "9927", "dob": "04/09/1999", "returns": "No education record found for the student"},
  {"section": "Empty and unconfirmed records", "ssnLast4": "9929", "dob": "08/14/2002", "returns": "No education record found for the student"},
  {"section": "Empty and unconfirmed records", "ssnLast4": "9913", "dob": "09/20/1955", "returns": "A record was located, but the Clearinghouse could not confirm the student's identity"},
  {"section": "Empty and unconfirmed records", "ssnLast4": "9926", "dob": "05/28/1967", "returns": "A record was located, but the Clearinghouse could not confirm the student's identity"},
];

// Documents: upload a file with exactly this name. Add the prefix suspicious. to any of them to flag it.
export const FILES = [
  {"section": "Pay stubs", "filename": "most.recent.paystub.pdf", "label": "Most recent paystub", "url": "https://prod.truv.com/v1/permalink/most.recent.paystub.pdf"},
  {"section": "Pay stubs", "filename": "next.recent.paystub.pdf", "label": "Next recent paystub", "url": "https://prod.truv.com/v1/permalink/next.recent.paystub.pdf"},
  {"section": "Pay stubs", "filename": "first.paystub.pdf", "label": "First paystub", "url": "https://prod.truv.com/v1/permalink/first.paystub.pdf"},
  {"section": "High income earner", "filename": "hi.most.recent.paystub.pdf", "label": "Most recent paystub", "url": "https://prod.truv.com/v1/permalink/hi.most.recent.paystub.pdf"},
  {"section": "High income earner", "filename": "hi.next.recent.paystub.pdf", "label": "Next recent paystub", "url": "https://prod.truv.com/v1/permalink/hi.next.recent.paystub.pdf"},
  {"section": "High income earner", "filename": "hi.first.paystub.pdf", "label": "First paystub", "url": "https://prod.truv.com/v1/permalink/hi.first.paystub.pdf"},
  {"section": "High income earner", "filename": "hi.w2.pdf", "label": "W-2", "url": "https://prod.truv.com/v1/permalink/hi.w2.pdf"},
  {"section": "Tax documents", "filename": "w2.pdf", "label": "W-2", "url": "https://prod.truv.com/v1/permalink/w2.pdf"},
  {"section": "Tax documents", "filename": "1099div.pdf", "label": "1099-DIV", "url": "https://prod.truv.com/v1/permalink/1099div.pdf"},
  {"section": "Tax documents", "filename": "1099g.pdf", "label": "1099-G", "url": "https://prod.truv.com/v1/permalink/1099g.pdf"},
  {"section": "Tax documents", "filename": "1099int.pdf", "label": "1099-INT", "url": "https://prod.truv.com/v1/permalink/1099int.pdf"},
  {"section": "Tax documents", "filename": "1099misc.pdf", "label": "1099-MISC", "url": "https://prod.truv.com/v1/permalink/1099misc.pdf"},
  {"section": "Tax documents", "filename": "1099nec.pdf", "label": "1099-NEC", "url": "https://prod.truv.com/v1/permalink/1099nec.pdf"},
  {"section": "Tax documents", "filename": "1099r.pdf", "label": "1099-R", "url": "https://prod.truv.com/v1/permalink/1099r.pdf"},
  {"section": "Tax documents", "filename": "ssa1099.pdf", "label": "SSA-1099", "url": "https://prod.truv.com/v1/permalink/ssa1099.pdf"},
  {"section": "Tax documents", "filename": "f1040.pdf", "label": "1040", "url": "https://prod.truv.com/v1/permalink/f1040.pdf"},
  {"section": "Volunteer documents", "filename": "volunteer_letter.pdf", "label": "Volunteer letter", "url": "https://prod.truv.com/v1/permalink/volunteer_letter.pdf"},
  {"section": "Volunteer documents", "filename": "volunteer_timesheet.pdf", "label": "Volunteer timesheet", "url": "https://prod.truv.com/v1/permalink/volunteer_timesheet.pdf"},
  {"section": "Flagged as suspicious or inconsistent", "filename": "f1.paystub.pdf", "label": "Tampered documents: Information is falsified or manipulated", "url": "https://citadelid-resources.s3.us-west-2.amazonaws.com/doc_upload/f1.paystub.pdf"},
  {"section": "Flagged as suspicious or inconsistent", "filename": "f2.paystub.pdf", "label": "Tampered documents: Information is falsified or manipulated", "url": "https://citadelid-resources.s3.us-west-2.amazonaws.com/doc_upload/f2.paystub.pdf"},
  {"section": "Flagged as suspicious or inconsistent", "filename": "f3.paystub.pdf", "label": "Tampered documents: Information is falsified or manipulated", "url": "https://citadelid-resources.s3.us-west-2.amazonaws.com/doc_upload/f3.paystub.pdf"},
  {"section": "Flagged as suspicious or inconsistent", "filename": "ssn1.paystub.pdf", "label": "Different SSNs: Personal information is inconsistent across documents", "url": "https://citadelid-resources.s3.us-west-2.amazonaws.com/doc_upload/ssn1.paystub.pdf"},
  {"section": "Flagged as suspicious or inconsistent", "filename": "ssn2.paystub.pdf", "label": "Different SSNs: Personal information is inconsistent across documents", "url": "https://citadelid-resources.s3.us-west-2.amazonaws.com/doc_upload/ssn2.paystub.pdf"},
  {"section": "Flagged as suspicious or inconsistent", "filename": "ssn3.paystub.pdf", "label": "Different SSNs: Personal information is inconsistent across documents", "url": "https://citadelid-resources.s3.us-west-2.amazonaws.com/doc_upload/ssn3.paystub.pdf"},
  {"section": "Flagged as suspicious or inconsistent", "filename": "p1.paystub.pdf", "label": "Different applicant names: Personal information is inconsistent across documents", "url": "https://citadelid-resources.s3.us-west-2.amazonaws.com/doc_upload/p1.paystub.pdf"},
  {"section": "Flagged as suspicious or inconsistent", "filename": "p2.paystub.pdf", "label": "Different applicant names: Personal information is inconsistent across documents", "url": "https://citadelid-resources.s3.us-west-2.amazonaws.com/doc_upload/p2.paystub.pdf"},
  {"section": "Flagged as suspicious or inconsistent", "filename": "p3.paystub.pdf", "label": "Different applicant names: Personal information is inconsistent across documents", "url": "https://citadelid-resources.s3.us-west-2.amazonaws.com/doc_upload/p3.paystub.pdf"},
  {"section": "Flagged as suspicious or inconsistent", "filename": "nd1.paystub.pdf", "label": "No data or invalid data: Information is missing or unable to be parsed", "url": "https://citadelid-resources.s3.us-west-2.amazonaws.com/doc_upload/nd1.paystub.pdf"},
  {"section": "Flagged as suspicious or inconsistent", "filename": "nd2.paystub.pdf", "label": "No data or invalid data: Information is missing or unable to be parsed", "url": "https://citadelid-resources.s3.us-west-2.amazonaws.com/doc_upload/nd2.paystub.pdf"},
  {"section": "Flagged as suspicious or inconsistent", "filename": "nd3.paystub.pdf", "label": "No data or invalid data: Information is missing or unable to be parsed", "url": "https://citadelid-resources.s3.us-west-2.amazonaws.com/doc_upload/nd3.paystub.pdf"},
  {"section": "Fails validation", "filename": "duplicate.pdf", "label": "Duplicate file", "url": "https://citadelid-resources.s3.us-west-2.amazonaws.com/doc_upload/duplicate.pdf", "returns": "is_unique: false - upload any file twice in the same collection, or use the provided file"},
  {"section": "Fails validation", "filename": "unreadable.pdf", "label": "Unreadable file", "url": "https://citadelid-resources.s3.us-west-2.amazonaws.com/doc_upload/unreadable.pdf", "returns": "is_readable: false"},
  {"section": "Fails validation", "filename": "password.pdf", "label": "Password-protected file", "url": "https://citadelid-resources.s3.us-west-2.amazonaws.com/doc_upload/password.pdf", "returns": "is_accessible: false (password: paystub123)"},
  {"section": "Fails validation", "filename": "unsupported_type.pdf", "label": "Unsupported MIME type", "url": "https://citadelid-resources.s3.us-west-2.amazonaws.com/doc_upload/unsupported_type.pdf", "returns": "is_supported_type: false"},
  {"section": "Fails validation", "filename": "failed.pdf", "label": "Processing failure", "url": "https://citadelid-resources.s3.us-west-2.amazonaws.com/doc_upload/failed.pdf", "returns": "status: failed after validation passes"},
];

// Pre-generated mortgage reports you can fetch without signing in to anything.
export const REPORT_IDS = [
  {"agency": "Fannie Mae", "kind": "Income and employment", "id": "456bdef4a7e944679c613f03fea436f6", "ssn": "999-60-1111", "borrower": "Homer Loanseeker", "sample": "https://truv.com/wp-content/uploads/2025/07/report-456bdef4a7e944679c613f03fea436f6.pdf"},
  {"agency": "Fannie Mae", "kind": "Income and employment", "id": "57d2e327e2a5436798519917bf36a958", "ssn": "999-00-1147", "borrower": "Jess Sea", "sample": "https://truv.com/wp-content/uploads/2025/07/report-57d2e327e2a5436798519917bf36a958.pdf"},
  {"agency": "Fannie Mae", "kind": "Income and employment", "id": "c92799ae5fb541b29c727c35b5433b2f", "ssn": "999-00-9066", "borrower": "Ann Sea", "sample": "https://truv.com/wp-content/uploads/2025/07/report-c92799ae5fb541b29c727c35b5433b2f.pdf"},
  {"agency": "Fannie Mae", "kind": "Income and employment", "id": "193dba3298c140479172a8129e16c36e", "ssn": "999-60-6666", "borrower": "Suzi Builder", "sample": "https://truv.com/wp-content/uploads/2025/07/report-193dba3298c140479172a8129e16c36e.pdf"},
  {"agency": "Fannie Mae", "kind": "Assets", "id": "be953ec913ac4f2b9086529377e087f8", "ssn": "999-60-1111", "borrower": "Homer Loanseeker", "sample": "https://truv.com/wp-content/uploads/2025/07/report-be953ec913ac4f2b9086529377e087f8.pdf"},
  {"agency": "Fannie Mae", "kind": "Assets", "id": "394fe28b784d4f6a96a746e56c575d69", "ssn": "999-12-1234", "borrower": "Patrick Purchaser", "sample": "https://truv.com/wp-content/uploads/2025/07/report-394fe28b784d4f6a96a746e56c575d69.pdf"},
  {"agency": "Fannie Mae", "kind": "Assets", "id": "2a144c7b7af9419692ce6f1661245425", "ssn": "999-56-5678", "borrower": "Lorraine Purchaser", "sample": "https://truv.com/wp-content/uploads/2025/07/report-2a144c7b7af9419692ce6f1661245425.pdf"},
  {"agency": "Fannie Mae", "kind": "Assets", "id": "d3366e56821540f8b00cceafcfdf6944", "ssn": "999-60-6666", "borrower": "Suzi Builder", "sample": "https://truv.com/wp-content/uploads/2025/07/report-d3366e56821540f8b00cceafcfdf6944.pdf"},
  {"agency": "Freddie Mac", "kind": "Income and employment", "id": "5abf3fddc6cd44a38038c0c6bfd4f26f", "ssn": "990-50-0005", "borrower": "Patrick Freddie", "sample": "https://truv.com/wp-content/uploads/2025/07/report-5abf3fddc6cd44a38038c0c6bfd4f26f.pdf"},
  {"agency": "Freddie Mac", "kind": "Income and employment", "id": "bf23a64ceaf74988b14570a549d0b1c8", "ssn": "990-40-0004", "borrower": "Amy Freddie", "sample": "https://truv.com/wp-content/uploads/2025/07/report-bf23a64ceaf74988b14570a549d0b1c8.pdf"},
  {"agency": "Freddie Mac", "kind": "Income and employment", "id": "57868adf572f46fb989adf16a30c1ebd", "ssn": "990-70-0007", "borrower": "Suzi Freddie", "sample": "https://truv.com/wp-content/uploads/2025/07/report-57868adf572f46fb989adf16a30c1ebd.pdf"},
  {"agency": "Freddie Mac", "kind": "Income and employment", "id": "1a531ae648254ec3a27c4e259ab507f3", "ssn": "990-11-0011", "borrower": "Mom Freddie", "sample": "https://truv.com/wp-content/uploads/2025/07/report-1a531ae648254ec3a27c4e259ab507f3.pdf"},
  {"agency": "Freddie Mac", "kind": "Income and employment", "id": "776f4e58b115428f94776c884c073d4d", "ssn": "990-08-0008", "borrower": "Alice Freddie", "sample": "https://truv.com/wp-content/uploads/2025/07/report-776f4e58b115428f94776c884c073d4d.pdf"},
  {"agency": "Freddie Mac", "kind": "Income and employment", "id": "729851aad6404bf9b30248a11445fec5", "ssn": "990-30-0003", "borrower": "Andy Freddie", "sample": "https://truv.com/wp-content/uploads/2025/07/report-729851aad6404bf9b30248a11445fec5.pdf"},
  {"agency": "Freddie Mac", "kind": "Assets", "id": "b8aa127afb1246428f0c8868c863080b", "ssn": "990-80-0008", "borrower": "Alice Freddie", "sample": "https://truv.com/wp-content/uploads/2025/07/report-b8aa127afb1246428f0c8868c863080b.pdf"},
  {"agency": "Freddie Mac", "kind": "Assets", "id": "4f6bfd8bdc6645f199408fd2a35213c4", "ssn": "991-10-0011", "borrower": "Mom Freddie", "sample": "https://truv.com/wp-content/uploads/2025/07/report-4f6bfd8bdc6645f199408fd2a35213c4.pdf"},
  {"agency": "Freddie Mac", "kind": "Assets", "id": "cb893b4564f949bcb20eca3b05c547af", "ssn": "991-00-0010", "borrower": "Dad Freddie", "sample": "https://truv.com/wp-content/uploads/2025/07/report-cb893b4564f949bcb20eca3b05c547af.pdf"},
  {"agency": "Freddie Mac", "kind": "Assets", "id": "415d91bd02a64954a15f254a8b1bb5b5", "ssn": "990-20-0002", "borrower": "Mary Freddie", "sample": "https://truv.com/wp-content/uploads/2025/07/report-415d91bd02a64954a15f254a8b1bb5b5.pdf"},
  {"agency": "Freddie Mac", "kind": "Assets", "id": "668a2ff8101f420e94f0b04c5ada6337", "ssn": "990-10-0001", "borrower": "John Freddie", "sample": "https://truv.com/wp-content/uploads/2025/07/report-668a2ff8101f420e94f0b04c5ada6337.pdf"},
  {"agency": "Freddie Mac", "kind": "Assets", "id": "36d0a637117041c098ee39b8d8f364f1", "ssn": "990-70-0007", "borrower": "Suzi Freddie", "sample": "https://truv.com/wp-content/uploads/2025/07/report-36d0a637117041c098ee39b8d8f364f1.pdf"},
];
