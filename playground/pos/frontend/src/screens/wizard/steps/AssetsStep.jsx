import React from 'react';

import { ASSETS } from '../../../api.js';
import { RecordListStep } from '../RecordListStep.jsx';

const FIELDS = [
  { name: 'financial_institution_name', label: 'Financial Institution' },
  { name: 'account_type', label: 'Account Type', options: [
    { value: 'checking', label: 'Checking' }, { value: 'savings', label: 'Savings' },
    { value: 'retirement', label: 'Retirement' }, { value: 'other', label: 'Other' },
  ] },
  { name: 'account_number_masked', label: 'Account Number' },
  { name: 'cash_or_market_value', label: 'Cash / Market Value' },
];

export function AssetsStep(props) {
  return (
    <RecordListStep
      {...props}
      title="Assets"
      emptyLabel="No accounts added yet. Add one, or run a Truv assets verification to auto-fill this section."
      sectionApi={ASSETS}
      fields={FIELDS}
      fieldKeyPrefix="assets"
      verifyLabel="Verify Assets with Truv"
      verifyDescription="Connect the borrower's bank account and auto-fill this section from direct-source data (Verification of Assets)."
      verifyBadge="VOA"
    />
  );
}
