import React from 'react';

import { EMPLOYMENT } from '../../../api.js';
import { RecordListStep } from '../RecordListStep.jsx';

const FIELDS = [
  { name: 'employer_name', label: 'Employer Name' },
  { name: 'employer_address', label: 'Employer Address' },
  { name: 'position_title', label: 'Position / Title' },
  { name: 'start_date', label: 'Start Date', type: 'date' },
  { name: 'employment_type', label: 'Employment Type', options: [
    { value: 'w2', label: 'W-2' }, { value: 'self_employed', label: 'Self-Employed' },
    { value: 'military', label: 'Military' }, { value: 'other', label: 'Other' },
  ] },
  { name: 'monthly_income_base', label: 'Base Monthly Income' },
  { name: 'monthly_income_overtime', label: 'Overtime' },
  { name: 'monthly_income_bonus', label: 'Bonus' },
  { name: 'monthly_income_commission', label: 'Commission' },
];

export function EmploymentStep(props) {
  return (
    <RecordListStep
      {...props}
      title="Employment & Income"
      emptyLabel="No employers added yet. Add one, or run a Truv verification to auto-fill this section."
      sectionApi={EMPLOYMENT}
      fields={FIELDS}
      fieldKeyPrefix="employment"
      verifyLabel="Verify Income with Truv"
      verifyDescription="Connect the borrower's payroll and auto-fill this section from direct-source data (Verification of Income & Employment)."
      verifyBadge="VOIE"
    />
  );
}
