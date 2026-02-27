import type { DemoConfig } from "@/lib/types";

export const cwRenewalReauthDemo: DemoConfig = {
  id: "cw-renewal-reauth",
  title: "Renewal — Refresh Fails",
  subtitle: "Backend refresh fails, applicant needs re-authentication",
  description:
    "During caseworker-initiated renewal, the automatic data refresh fails. The caseworker sends the applicant an email/SMS to re-authenticate through Bridge and refresh their verification data.",
  icon: "AlertTriangle",
  section: "caseworker-portal",
  scenarioType: "edge-case",
  category: "Dashboard",
  steps: [
    {
      title: "Renewal Queue",
      description:
        "The caseworker views renewal cases where automatic refresh has failed. These cases are flagged with a 'refresh failed' status indicating the applicant's credentials are no longer valid and manual re-authentication is required.",
      browserUrl: "benefits.gov/caseworker/renewals",
      screenType: "dashboard",
      docsLinks: [
        { label: "Refresh Order", url: "https://docs.truv.com/reference/refresh-an-order" },
        { label: "Order Statuses", url: "https://docs.truv.com/docs/orders#order-statuses" },
      ],
    },
    {
      title: "Trigger Re-Auth",
      description:
        "The caseworker clicks a 'Re-authenticate' button to create a new order and send the applicant an email/SMS with a share_url. The backend calls POST /v1/orders/ with the applicant's information. The applicant needs to go through Bridge again to re-establish their payroll connection. Start sending reminders 30-90 days before the renewal deadline.",
      browserUrl: "benefits.gov/caseworker/renewals/reauth",
      screenType: "send-link",
      backendAction: "createOrder",
      docsLinks: [
        { label: "Create Order", url: "https://docs.truv.com/reference/create-an-order" },
        { label: "Share URL", url: "https://docs.truv.com/docs/orders#share-url" },
      ],
    },
    {
      title: "Monitor Re-Auth",
      description:
        "The caseworker monitors the applicant's re-authentication progress via webhooks. Task_status_updated events stream in as the applicant completes Bridge on their own device. If they don't respond within the reminder window, additional notifications can be sent.",
      browserUrl: "benefits.gov/caseworker/renewals/monitor",
      screenType: "monitor",
      docsLinks: [
        { label: "Webhooks", url: "https://docs.truv.com/docs/webhooks" },
      ],
    },
    {
      title: "Review Updated Data",
      description:
        "Once the applicant re-authenticates and the order completes, the backend calls GET /v1/orders/{id}/ to retrieve fresh verification data. The caseworker reviews the updated income and employment data to make the renewal determination.",
      browserUrl: "benefits.gov/caseworker/renewals/review",
      screenType: "review",
      backendAction: "getOrder",
      docsLinks: [
        { label: "Get Order", url: "https://docs.truv.com/reference/get-an-order" },
      ],
    },
  ],
};
