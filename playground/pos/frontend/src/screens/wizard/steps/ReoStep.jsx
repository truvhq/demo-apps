import React from 'react';

import { REO } from '../../../api.js';
import { RecordListStep } from '../RecordListStep.jsx';

const FIELDS = [
  { name: 'address', label: 'Property Address' },
  { name: 'property_type', label: 'Property Type' },
  { name: 'status', label: 'Status', options: [
    { value: 'retained', label: 'Retained' }, { value: 'sold', label: 'Sold' }, { value: 'pending', label: 'Pending' },
  ] },
  { name: 'market_value', label: 'Market Value' },
  { name: 'monthly_rental_income', label: 'Monthly Rental Income' },
  { name: 'mortgage_balance', label: 'Mortgage Balance' },
];

export function ReoStep(props) {
  return (
    <RecordListStep
      {...props}
      title="Real Estate Owned"
      emptyLabel="No properties added yet. Truv does not supply this data — it must be entered manually."
      sectionApi={REO}
      fields={FIELDS}
      fieldKeyPrefix="reo"
    />
  );
}
