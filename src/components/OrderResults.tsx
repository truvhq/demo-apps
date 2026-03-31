import { Section, Row } from './reports/shared';
import { VoieReport } from './reports/VoieReport';
import { AssetsReport } from './reports/AssetsReport';
import { IncomeInsightsReport } from './reports/IncomeInsightsReport';

interface OrderData {
  voie_report?: { links?: unknown[] };
  voe_report?: { links?: unknown[] };
  voa_report?: { links?: unknown[] };
  income_insights_report?: unknown;
  truv_order_id?: string;
  status?: string;
  product_type?: string;
}

export function OrderResults({ data }: { data?: OrderData }) {
  const hasVoie = (data?.voie_report?.links?.length ?? 0) > 0;
  const hasVoe = (data?.voe_report?.links?.length ?? 0) > 0;
  const hasAssets = (data?.voa_report?.links?.length ?? 0) > 0;
  const hasInsights = !!data?.income_insights_report;
  const hasAny = hasVoie || hasVoe || hasAssets || hasInsights;

  if (!hasAny) {
    return (
      <Section title="Order Details">
        <Row label="Order ID" value={data?.truv_order_id ?? '-'} />
        <Row label="Status" value={data?.status ?? '-'} />
        <Row label="Product" value={data?.product_type ?? '-'} />
      </Section>
    );
  }

  return (
    <div>
      {hasVoie && <VoieReport report={data!.voie_report as Parameters<typeof VoieReport>[0]['report']} />}
      {hasVoe && <VoieReport report={data!.voe_report as Parameters<typeof VoieReport>[0]['report']} />}
      {hasAssets && <AssetsReport report={data!.voa_report as Parameters<typeof AssetsReport>[0]['report']} />}
      {hasInsights && <IncomeInsightsReport report={data!.income_insights_report as Parameters<typeof IncomeInsightsReport>[0]['report']} />}
    </div>
  );
}
