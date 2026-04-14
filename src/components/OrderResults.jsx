/**
 * FILE SUMMARY: Displays fetched report data after order/bridge completion
 * DATA FLOW: Receives report data via props (fetched upstream by useReportFetch)
 * INTEGRATION PATTERN: Used by both Orders and Bridge flows
 *
 * Inspects the order data object for VOIE, VOE, assets, and income-insights
 * reports, then delegates rendering to the appropriate typed report component.
 * Falls back to a minimal order summary when no report data is available.
 */

// Imports: shared layout primitives and typed report components
import { Section, Row } from './reports/shared.jsx';
import { VoieReport } from './reports/VoieReport.jsx';
import { AssetsReport } from './reports/AssetsReport.jsx';
import { IncomeInsightsReport } from './reports/IncomeInsightsReport.jsx';

// Component: OrderResults
// Props:
//   data : order/report object returned from the Truv API
export function OrderResults({ data }) {
  // Determine which report types are present in the response
  const hasVoie = data?.voie_report?.links?.length > 0;
  const hasVoe = data?.voe_report?.links?.length > 0;
  const hasAssets = data?.voa_report?.links?.length > 0;
  const hasInsights = !!data?.income_insights_report;
  const hasAny = hasVoie || hasVoe || hasAssets || hasInsights;

  // Fallback: show basic order metadata when no detailed reports exist
  if (!hasAny) {
    return (
      <Section title="Order Details">
        <Row label="Order ID" value={data?.truv_order_id || '-'} />
        <Row label="Status" value={data?.status || '-'} />
        <Row label="Product" value={data?.product_type || '-'} />
      </Section>
    );
  }

  // Rendering: delegate to typed report components based on available data
  return (
    <div>
      {hasVoie && <VoieReport report={data.voie_report} />}
      {hasVoe && <VoieReport report={data.voe_report} />}
      {hasAssets && <AssetsReport report={data.voa_report} />}
      {hasInsights && <IncomeInsightsReport report={data.income_insights_report} />}
    </div>
  );
}
