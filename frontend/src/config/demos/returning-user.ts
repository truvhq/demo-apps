import type { DemoConfig } from "@/lib/types";

export const returningUserDemo: DemoConfig = {
  id: "cp-renewal",
  title: "Renewal — Happy Path",
  subtitle: "Returning applicant refreshes verified data without re-auth",
  description:
    "Demonstrate how a returning applicant's previously verified data can be refreshed without re-entering credentials. The backend refresh pulls updated income data automatically.",
  icon: "RefreshCw",
  section: "customer-portal",
  scenarioType: "happy-path",
  category: "Inline Embed",
  steps: [
    {
      title: "Load Profile",
      description:
        "The system loads the applicant's existing profile and their previous Truv order via GET /v1/orders/{id}/. The API tab shows the stored order data including the original verification results, connection status, and employer details. The form fields are pre-filled from the previous application — name, SSN, and employer are already on file.",
      browserUrl: "benefits.gov/recertify",
      screenType: "form",
      screenProps: { prefilled: true },
      docsLinks: [
        { label: "Get Order", url: "https://docs.truv.com/reference/get-an-order" },
      ],
    },
    {
      title: "Refresh Order",
      description:
        "The backend calls POST /v1/orders/{id}/refresh/ to pull updated income data without requiring the applicant to re-authenticate. This is the key advantage of Truv's refresh flow — the applicant doesn't need to re-enter credentials or go through Bridge again. Check the API tab to see the refresh request and response. Truv returns a new bridge_token and updated status. The Bridge widget opens inline in case additional user interaction is needed (e.g., MFA re-verification). Watch the Webhooks tab for task_status_updated events as Truv re-fetches data from the payroll provider.",
      browserUrl: "benefits.gov/recertify/refresh",
      screenType: "bridge",
      backendAction: "createOrder",
      docsLinks: [
        { label: "Refresh Order", url: "https://docs.truv.com/reference/refresh-an-order" },
      ],
    },
    {
      title: "Compare Data",
      description:
        "The backend calls GET /v1/orders/{id}/ and GET /v1/orders/{id}/certifications/ to fetch the refreshed verification data and self-certification results. Compare the new data against the previous verification to spot changes — new employer, salary increase/decrease, employment gap, or updated asset balances.",
      browserUrl: "benefits.gov/recertify/compare",
      screenType: "review",
      backendAction: "getOrder",
      docsLinks: [
        { label: "Get Order", url: "https://docs.truv.com/reference/get-an-order" },
        { label: "Certifications", url: "https://docs.truv.com/reference/orders_certifications_results" },
      ],
    },
    {
      title: "Decision",
      description:
        "With refreshed verification data, the system makes an eligibility determination. In production, this is where you'd compare current income against benefit thresholds and either continue, adjust, or terminate benefits. No additional API calls are made at this step.",
      browserUrl: "benefits.gov/recertify/decision",
      screenType: "confirmation",
      docsLinks: [],
    },
  ],
};
