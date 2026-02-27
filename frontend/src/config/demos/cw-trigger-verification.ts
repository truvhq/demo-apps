import type { DemoConfig } from "@/lib/types";

export const cwTriggerVerificationDemo: DemoConfig = {
  id: "cw-trigger-verification",
  title: "Trigger Verification",
  subtitle: "Applicant in portal but didn't complete — caseworker initiates",
  description:
    "The applicant appeared in the customer portal but never completed verification. The caseworker creates an order from the portal and sends email/SMS notifications to prompt the applicant.",
  icon: "Send",
  section: "caseworker-portal",
  scenarioType: "edge-case",
  category: "Dashboard",
  steps: [
    {
      title: "Case Queue",
      description:
        "The caseworker views cases where applicants have been in the system but haven't completed verification. These cases show no Truv order or an order in 'created' status that was never started. The caseworker selects a case to initiate verification.",
      browserUrl: "benefits.gov/caseworker/queue",
      screenType: "dashboard",
      docsLinks: [
        { label: "Order Statuses", url: "https://docs.truv.com/docs/orders#order-statuses" },
      ],
    },
    {
      title: "Create Order",
      description:
        "The caseworker enters or confirms the applicant's details and creates a new Truv order. The backend calls POST /v1/orders/ with the applicant's information, email, and phone. The order is configured with email and SMS notifications so the applicant receives a link to complete verification.",
      browserUrl: "benefits.gov/caseworker/case/12345/create",
      screenType: "form",
      docsLinks: [
        { label: "Orders API", url: "https://docs.truv.com/reference/create-an-order" },
      ],
    },
    {
      title: "Send Notification",
      description:
        "The order is created and the applicant receives email and SMS notifications with the share_url. The caseworker can also copy the share_url to send through additional channels. The API tab shows the order creation response with share_url and notification_settings.",
      browserUrl: "benefits.gov/caseworker/case/12345/sent",
      screenType: "send-link",
      backendAction: "createOrder",
      docsLinks: [
        { label: "Create Order", url: "https://docs.truv.com/reference/create-an-order" },
        { label: "Share URL", url: "https://docs.truv.com/docs/orders#share-url" },
      ],
    },
    {
      title: "Monitor Progress",
      description:
        "The caseworker monitors the applicant's progress via webhooks. Task_status_updated events stream in as the applicant completes Bridge on their own device. If the applicant doesn't respond, the caseworker can re-send notifications or escalate the case.",
      browserUrl: "benefits.gov/caseworker/case/12345/monitor",
      screenType: "monitor",
      docsLinks: [
        { label: "Webhooks", url: "https://docs.truv.com/docs/webhooks" },
      ],
    },
  ],
};
