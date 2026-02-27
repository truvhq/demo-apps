import type { DemoConfig } from "@/lib/types";

export const cwPartialCompleteDemo: DemoConfig = {
  id: "cw-partial-complete",
  title: "Partial Completion",
  subtitle: "Primary completed but household member didn't or link was stale",
  description:
    "The primary applicant completed verification, but a household member's link expired or they never finished. The caseworker reviews completed data and re-initiates verification for the remaining member.",
  icon: "ClipboardCheck",
  section: "caseworker-portal",
  scenarioType: "edge-case",
  category: "Dashboard",
  steps: [
    {
      title: "Case Queue",
      description:
        "The caseworker views their assigned cases. This case shows mixed status: the primary applicant's order is 'completed' but the household member's order is 'action_required' or 'created' (never finished). The dashboard distinguishes between fully complete and partially complete cases.",
      browserUrl: "benefits.gov/caseworker/queue",
      screenType: "dashboard",
      docsLinks: [
        { label: "Order Statuses", url: "https://docs.truv.com/docs/orders#order-statuses" },
      ],
    },
    {
      title: "Review Complete Data",
      description:
        "The caseworker opens the case and reviews the primary applicant's verified data via GET /v1/orders/{id}/. The API tab shows complete income, employment, and asset data for the primary applicant. The household member's data is missing or incomplete.",
      browserUrl: "benefits.gov/caseworker/case/12345",
      screenType: "review",
      backendAction: "getOrder",
      docsLinks: [
        { label: "Get Order", url: "https://docs.truv.com/reference/get-an-order" },
        { label: "Certifications", url: "https://docs.truv.com/reference/orders_certifications_results" },
      ],
    },
    {
      title: "Re-Send to Household",
      description:
        "The caseworker clicks a 'Reinitiate' button to trigger a new Truv order for the household member. The backend calls POST /v1/orders/ with the household member's details and sends an email & SMS with the share_url. This gives the household member a fresh link to complete verification.",
      browserUrl: "benefits.gov/caseworker/case/12345/resend",
      screenType: "send-link",
      backendAction: "createOrder",
      docsLinks: [
        { label: "Create Order", url: "https://docs.truv.com/reference/create-an-order" },
        { label: "Share URL", url: "https://docs.truv.com/docs/orders#share-url" },
      ],
    },
    {
      title: "Monitor Household",
      description:
        "The caseworker monitors the household member's progress via webhooks. The Webhooks tab streams events as the member completes Bridge on their own device. Once completed, the case transitions to fully verified and is ready for eligibility determination.",
      browserUrl: "benefits.gov/caseworker/case/12345/monitor",
      screenType: "monitor",
      docsLinks: [
        { label: "Webhooks", url: "https://docs.truv.com/docs/webhooks" },
      ],
    },
  ],
};
