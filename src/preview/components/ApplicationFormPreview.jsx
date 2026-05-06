import { ApplicationForm } from '../../components/ApplicationForm.jsx';
import { postEvent } from '../protocol.js';

export function ApplicationFormPreview({ sessionId, productType = 'income', submitting = false, dataSource, employerLabel, showEmployer }) {
  return (
    <ApplicationForm
      sessionId={sessionId}
      productType={productType}
      submitting={submitting}
      dataSource={dataSource}
      employerLabel={employerLabel}
      showEmployer={showEmployer}
      onSubmit={(data) => postEvent('form:submit', [data])}
    />
  );
}
