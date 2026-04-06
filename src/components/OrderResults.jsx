// OrderResults -- Renders typed report components based on order data.
//
// Checks for VOIE, VOE, assets, and income-insights reports, then renders
// the matching report component (VoieReport, AssetsReport, IncomeInsightsReport).
import { Section, Row } from './reports/shared.jsx';
import { VoieReport } from './reports/VoieReport.jsx';
import { AssetsReport } from './reports/AssetsReport.jsx';
import { IncomeInsightsReport } from './reports/IncomeInsightsReport.jsx';

export function OrderResults({ data }) {
  const hasVoie = data?.voie_report?.links?.length > 0;
  const hasVoe = data?.voe_report?.links?.length > 0;
  const hasAssets = data?.voa_report?.links?.length > 0;
  const hasInsights = !!data?.income_insights_report;
  const hasAny = hasVoie || hasVoe || hasAssets || hasInsights;

  if (!hasAny) {
    return (
      <Section title="Order Details">
        <Row label="Order ID" value={data?.truv_order_id || '-'} />
        <Row label="Status" value={data?.status || '-'} />
        <Row label="Product" value={data?.product_type || '-'} />
      </Section>
    );
  }

  return (
    <div>
      {hasVoie && <VoieReport report={data.voie_report} />}
      {hasVoe && <VoieReport report={data.voe_report} />}
      {hasAssets && <AssetsReport report={data.voa_report} />}
      {hasInsights && <IncomeInsightsReport report={data.income_insights_report} />}
    </div>
  );
}
