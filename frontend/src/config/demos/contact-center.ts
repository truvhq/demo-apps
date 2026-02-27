import type { DemoConfig } from "@/lib/types";

export const contactCenterDemo: DemoConfig = {
  id: "cc-send-link",
  title: "Inbound Call — Completes",
  subtitle: "Agent sends share URL, applicant completes verification",
  description:
    "An agent creates a verification order and sends the share URL via SMS or email. The applicant completes on their own device while the agent monitors progress in real-time.",
  icon: "Phone",
  section: "contact-center",
  scenarioType: "happy-path",
  category: "Share URL",
  steps: [
    {
      title: "Caller Info",
      description:
        "The contact center agent captures the caller's name, SSN, and contact information (email and/or phone). The email and phone are important here — they determine how Truv delivers the share URL to the applicant. When the order is created, Truv can automatically send an SMS or email with the verification link based on notification_settings.",
      browserUrl: "benefits.gov/agent/new-call",
      screenType: "form",
      docsLinks: [
        { label: "Orders API", url: "https://docs.truv.com/reference/create-an-order" },
      ],
    },
    {
      title: "Send Link",
      description:
        "The backend calls POST /v1/orders/ with the caller's details. The API tab shows the request — note the email/phone fields and notification_settings (suppress_user_notifications: false, first_notification_delay_hours: 24). The response includes a share_url — this is a hosted Truv page where the applicant can complete Bridge on their own device. The agent can copy this URL and send it via SMS, email, or read it over the phone. Unlike the inline embed flow, no bridge_token is needed on the agent's side.",
      browserUrl: "benefits.gov/agent/send-link",
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
        "While the applicant completes verification on their own device, the agent monitors progress in real-time. The Webhooks tab is the key panel here — events stream in via Server-Sent Events as the applicant progresses. Look for task_status_updated events with statuses like login, mfa, parsing, and done. The order status transitions from created → in_progress → completed. You can also poll GET /v1/orders/{id}/ to check the current status, visible in the API tab.",
      browserUrl: "benefits.gov/agent/monitor",
      screenType: "monitor",
      docsLinks: [
        { label: "Webhooks", url: "https://docs.truv.com/docs/webhooks" },
        { label: "Order Statuses", url: "https://docs.truv.com/docs/orders#order-statuses" },
      ],
    },
    {
      title: "Retrieve Data",
      description:
        "Once webhooks confirm the order is completed, the backend calls GET /v1/orders/{id}/ to fetch the full verified data. The API tab shows the complete response — the connections array contains each employer the applicant linked, with income statements, pay stubs, employment dates, and asset data. This data is sourced directly from the payroll provider and can be used for eligibility determination.",
      browserUrl: "benefits.gov/agent/review",
      screenType: "review",
      backendAction: "getOrder",
      docsLinks: [
        { label: "Get Order", url: "https://docs.truv.com/reference/get-an-order" },
      ],
    },
  ],
};
