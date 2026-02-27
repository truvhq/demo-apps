import type { DemoConfig } from "@/lib/types";

export const cpPartialEmployerDemo: DemoConfig = {
  id: "cp-partial-employer",
  title: "Partial Employer Connection",
  subtitle: "Connects 1 employer but not self-employment",
  description:
    "The applicant connects one employer through Bridge but doesn't connect self-employment or bank accounts. The system catches income gaps via bank transactions and self-certification.",
  icon: "Briefcase",
  section: "customer-portal",
  scenarioType: "edge-case",
  category: "Inline Embed",
  steps: [
    {
      title: "Applicant Info",
      description:
        "The applicant enters their personal details. When creating the order, always include products for both income and assets — this ensures the applicant can connect both Employers and Bank accounts. Bank account connections catch income streams from bank transactions if the applicant doesn't connect all employers.",
      browserUrl: "benefits.gov/apply",
      screenType: "form",
      docsLinks: [
        { label: "Orders API", url: "https://docs.truv.com/reference/create-an-order" },
      ],
    },
    {
      title: "Verification",
      description:
        "The applicant opens Bridge and connects one employer's payroll account. However, they have self-employment income that they don't connect — they may skip the option to add another employer or not realize they need to. The Bridge widget fires onSuccess for the connected employer, and the order completes. Watch the Bridge tab for events. The key insight: the order will show only partial income data.",
      browserUrl: "benefits.gov/apply/verify",
      screenType: "bridge",
      backendAction: "createOrder",
      docsLinks: [
        { label: "Bridge Widget", url: "https://docs.truv.com/docs/truv-bridge" },
        { label: "Bridge Events", url: "https://docs.truv.com/docs/bridge-events" },
      ],
    },
    {
      title: "Review Partial Data",
      description:
        "The backend calls GET /v1/orders/{id}/ to retrieve verified data. The connections array shows only one employer. Self-certification results from GET /v1/orders/{id}/certifications/ may reveal discrepancies — the applicant may have declared additional income sources during the self-certification step in Bridge. This is where the caseworker identifies the gap.",
      browserUrl: "benefits.gov/apply/review",
      screenType: "review",
      backendAction: "getOrder",
      docsLinks: [
        { label: "Get Order", url: "https://docs.truv.com/reference/get-an-order" },
        { label: "Certifications", url: "https://docs.truv.com/reference/orders_certifications_results" },
      ],
    },
    {
      title: "Self-Certification",
      description:
        "The applicant's self-certification data is compared against connected employer data. If there are discrepancies (e.g., declared self-employment income but no payroll connection for it), the caseworker can request additional documentation or the applicant can connect bank accounts to verify the remaining income streams via bank transaction data.",
      browserUrl: "benefits.gov/apply/certify",
      screenType: "confirmation",
      docsLinks: [
        { label: "Certifications", url: "https://docs.truv.com/reference/orders_certifications_results" },
      ],
    },
  ],
};
