/** Shared "has this step's data actually been provided" checks — used both
 * by the wizard's Stepper (to show a real completion checkmark instead of a
 * purely positional one) and by each single-value step's own view/edit
 * toggle (to decide whether to open already showing a saved summary or a
 * blank form). Keeping these in one place means the two can't drift apart. */

export function hasBorrowerData(b) {
  return !!(b?.first_name && b?.last_name && b?.ssn && b?.date_of_birth && b?.email && b?.phone);
}

export function hasLoanPropertyData(lp) {
  return !!(lp?.loan_amount && lp?.property_address && lp?.estimated_property_value);
}

const DECLARATION_KEYS = [
  'intent_to_occupy_primary', 'ownership_interest_last_3_years', 'outstanding_judgments',
  'bankruptcy_last_7_years', 'foreclosure_last_7_years', 'party_to_lawsuit', 'delinquent_federal_debt',
];

export function hasDeclarationData(d) {
  return !!d && DECLARATION_KEYS.every((k) => d[k] !== null && d[k] !== undefined);
}

export function hasDemographicData(d) {
  return !!(d?.ethnicity && d?.race && d?.sex);
}
