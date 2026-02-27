import type { DemoConfig } from "@/lib/types";

export const ipEmailSmsDemo: DemoConfig = {
  id: "ip-email-sms",
  title: "Email/SMS Instead of QR",
  subtitle: "No QR code — caseworker sends verification link via email/SMS",
  description:
    "During an in-person interview, the caseworker creates an order and sends the verification link via email or SMS instead of displaying a QR code. Useful when QR scanning isn't available or when using start_client_url with state communications.",
  icon: "Mail",
  section: "in-person",
  scenarioType: "edge-case",
  category: "Share URL",
  steps: [
    {
      title: "Interview",
      description:
        "During an in-person eligibility interview, the caseworker captures the applicant's information including their email and/or phone number. Unlike the QR code flow, these contact details are essential since the verification link will be delivered electronically.",
      browserUrl: "benefits.gov/kiosk/interview",
      screenType: "form",
      docsLinks: [
        { label: "Orders API", url: "https://docs.truv.com/reference/create-an-order" },
      ],
    },
    {
      title: "Send Verification Link",
      description:
        "The caseworker creates the order via POST /v1/orders/. If Truv email/SMS is allowed, the share_url is sent directly by Truv through notification_settings. If the state manages communications, the backend uses the start_client_url from the response and embeds it in the state's own email/SMS templates. Either way, the applicant receives a link on their phone.",
      browserUrl: "benefits.gov/kiosk/send",
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
        "While the applicant completes verification on their phone (potentially while still in the office), the caseworker monitors progress via webhooks. The Webhooks tab streams events in real-time. The caseworker can assist the applicant if they encounter issues during the process.",
      browserUrl: "benefits.gov/kiosk/monitor",
      screenType: "monitor",
      docsLinks: [
        { label: "Webhooks", url: "https://docs.truv.com/docs/webhooks" },
      ],
    },
    {
      title: "Review & Confirm",
      description:
        "Once verification completes, the backend calls GET /v1/orders/{id}/ to retrieve the verified data. The caseworker reviews the information with the applicant present and confirms the verification before proceeding with the benefits application.",
      browserUrl: "benefits.gov/kiosk/review",
      screenType: "review",
      backendAction: "getOrder",
      docsLinks: [
        { label: "Get Order", url: "https://docs.truv.com/reference/get-an-order" },
      ],
    },
  ],
};
