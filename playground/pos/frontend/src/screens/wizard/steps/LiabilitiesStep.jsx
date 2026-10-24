import React from 'react';

import { LIABILITIES } from '../../../api.js';
import { RecordListStep } from '../RecordListStep.jsx';

const FIELDS = [
  { name: 'liability_type', label: 'Type', options: [
    { value: 'revolving', label: 'Revolving' }, { value: 'installment', label: 'Installment' },
    { value: 'mortgage', label: 'Mortgage' }, { value: 'heloc', label: 'HELOC' }, { value: 'other', label: 'Other' },
  ] },
  { name: 'creditor_name', label: 'Creditor Name' },
  { name: 'account_number_masked', label: 'Account Number' },
  { name: 'monthly_payment', label: 'Monthly Payment' },
  { name: 'unpaid_balance', label: 'Unpaid Balance' },
  { name: 'credit_limit', label: 'Credit Limit' },
  { name: 'interest_rate', label: 'Interest Rate (%)' },
];

export function LiabilitiesStep(props) {
  return (
    <RecordListStep
      {...props}
      title="Liabilities"
      emptyLabel="No liabilities added yet. Add one, or verify with Truv to pull credit cards, loans, and mortgages from a connected bank account."
      sectionApi={LIABILITIES}
      fields={FIELDS}
      fieldKeyPrefix="liability"
      verifyLabel="Verify Liabilities with Truv"
      verifyDescription="Connect the borrower's bank account to pull credit cards, loans, and mortgages, including balances and payments (Verification of Assets)."
      verifyBadge="VOA"
    />
  );
}
