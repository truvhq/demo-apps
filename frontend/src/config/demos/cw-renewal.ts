import type { DemoConfig } from "@/lib/types";

export const cwRenewalDemo: DemoConfig = {
  id: "cw-renewal",
  title: "Renewal Experience",
  subtitle: "Send reminders 30-90 days before renewal to refresh data",
  description:
    "As benefits renewal approaches, the caseworker portal sends automated reminders. Data is refreshed and accounts reconnected ahead of the renewal deadline.",
  icon: "RefreshCw",
  section: "caseworker-portal",
  scenarioType: "happy-path",
  category: "Dashboard",
  steps: [
    {
      title: "Renewal Queue",
      description:
        "The caseworker views cases approaching their renewal deadline (30-90 days out). Each case shows the last verification date, renewal deadline, and current refresh status. Cases are sorted by urgency — nearest deadlines first.",
      browserUrl: "benefits.gov/caseworker/renewals",
      screenType: "dashboard",
      docsLinks: [
        { label: "Order Statuses", url: "https://docs.truv.com/docs/orders#order-statuses" },
      ],
    },
    {
      title: "Send Reminders",
      description:
        "The system sends automated reminders to applicants via email and SMS with a share_url to reconnect their accounts if needed. The backend may also attempt automatic data refresh via POST /v1/orders/{id}/refresh/ for cases where credentials are still valid. Check the API tab to see refresh attempts.",
      browserUrl: "benefits.gov/caseworker/renewals/remind",
      screenType: "send-link",
      backendAction: "createOrder",
      docsLinks: [
        { label: "Refresh Order", url: "https://docs.truv.com/reference/refresh-an-order" },
        { label: "Share URL", url: "https://docs.truv.com/docs/orders#share-url" },
      ],
    },
    {
      title: "Review Refreshed Data",
      description:
        "Once the refresh completes (either automatically or after the applicant reconnects), the backend calls GET /v1/orders/{id}/ to retrieve updated verification data. Compare against previous data to identify income changes, new employers, or updated asset balances.",
      browserUrl: "benefits.gov/caseworker/renewals/review",
      screenType: "review",
      backendAction: "getOrder",
      docsLinks: [
        { label: "Get Order", url: "https://docs.truv.com/reference/get-an-order" },
        { label: "Certifications", url: "https://docs.truv.com/reference/orders_certifications_results" },
      ],
    },
    {
      title: "Renewal Decision",
      description:
        "With refreshed verification data, the caseworker makes a renewal determination. Compare current income against benefit thresholds and either continue, adjust, or terminate benefits based on the verified data. No additional API calls are made at this step.",
      browserUrl: "benefits.gov/caseworker/renewals/decision",
      screenType: "confirmation",
      docsLinks: [],
    },
  ],
};
