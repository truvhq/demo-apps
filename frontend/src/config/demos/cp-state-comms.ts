import type { DemoConfig } from "@/lib/types";

export const cpStateCommsDemo: DemoConfig = {
  id: "cp-state-comms",
  title: "State-Managed Communications",
  subtitle: "Truv email/SMS not allowed — use start_client_url",
  description:
    "When the state doesn't allow Truv to send emails or SMS directly, use the start_client_url from the order create endpoint to embed the verification link into the state's own communication channels.",
  icon: "Link",
  section: "customer-portal",
  scenarioType: "edge-case",
  category: "Share URL",
  steps: [
    {
      title: "Applicant Info",
      description:
        "The applicant's details are captured through the state's existing intake process. Unlike other flows, Truv's notification_settings are suppressed (suppress_user_notifications: true) because the state manages all applicant communications directly.",
      browserUrl: "benefits.gov/apply",
      screenType: "form",
      docsLinks: [
        { label: "Orders API", url: "https://docs.truv.com/reference/create-an-order" },
      ],
    },
    {
      title: "Create Order",
      description:
        "The backend calls POST /v1/orders/ with suppress_user_notifications: true. The response includes a start_client_url — this is the key field. Unlike the share_url (which is a Truv-hosted page), the start_client_url is a direct link that can be embedded into the state's own emails, SMS messages, or portal notifications. Check the API tab to see the response with start_client_url.",
      browserUrl: "benefits.gov/apply/created",
      screenType: "confirmation",
      backendAction: "createOrder",
      docsLinks: [
        { label: "Create Order", url: "https://docs.truv.com/reference/create-an-order" },
        { label: "Share URL", url: "https://docs.truv.com/docs/orders#share-url" },
      ],
    },
    {
      title: "State Notification",
      description:
        "The state embeds the start_client_url into their own email template or SMS message. The applicant receives the verification link through the state's official communication channels — maintaining brand consistency and compliance with state communication policies. The link directs the applicant to complete Bridge on their own device.",
      browserUrl: "benefits.gov/apply/notify",
      screenType: "send-link",
      docsLinks: [
        { label: "Share URL", url: "https://docs.truv.com/docs/orders#share-url" },
      ],
    },
    {
      title: "Monitor Completion",
      description:
        "Track the applicant's progress via webhooks. When they click the start_client_url and complete Bridge, the standard webhook events fire: task_status_updated and order-status-updated. The order transitions through created → in_progress → completed. All monitoring works identically regardless of how the link was delivered.",
      browserUrl: "benefits.gov/apply/monitor",
      screenType: "monitor",
      docsLinks: [
        { label: "Webhooks", url: "https://docs.truv.com/docs/webhooks" },
        { label: "Order Statuses", url: "https://docs.truv.com/docs/orders#order-statuses" },
      ],
    },
  ],
};
