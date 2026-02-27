import type { DemoConfig } from "@/lib/types";

export const inPersonDemo: DemoConfig = {
  id: "in-person",
  title: "In-Person Kiosk",
  subtitle: "QR code from share URL",
  description:
    "For in-person visits: a caseworker creates an order, displays a QR code, and the applicant scans it to complete verification on their phone.",
  icon: "QrCode",
  category: "QR Code",
  steps: [
    {
      title: "Interview",
      description:
        "During an in-person visit, the caseworker captures the applicant's information (name, SSN). Unlike the contact center flow, no email or phone is strictly needed — the applicant is physically present and will scan a QR code instead of receiving a link remotely.",
      browserUrl: "benefits.gov/kiosk/interview",
      screenType: "form",
      docsLinks: [
        { label: "Orders API", url: "https://docs.truv.com/reference/create-an-order" },
      ],
    },
    {
      title: "Display QR Code",
      description:
        "The backend calls POST /v1/orders/ and receives a share_url in the response. This share_url is encoded into a QR code displayed on the caseworker's screen. The applicant scans it with their phone to open Truv Bridge on their own device — they never need to hand over their phone or enter credentials on the caseworker's computer. Check the API tab to see the order creation request and the share_url in the response.",
      browserUrl: "benefits.gov/kiosk/qr",
      screenType: "qr-code",
      backendAction: "createOrder",
      docsLinks: [
        { label: "Create Order", url: "https://docs.truv.com/reference/create-an-order" },
        { label: "Share URL", url: "https://docs.truv.com/docs/orders#share-url" },
      ],
    },
    {
      title: "Monitor Progress",
      description:
        "As the applicant completes Bridge on their phone, the caseworker's screen updates in real-time via webhooks. The Webhooks tab streams task_status_updated events showing the applicant's progress — login, mfa, parsing, done. This lets the caseworker know when the applicant has finished without looking over their shoulder. The order status transitions from created → in_progress → completed. If something goes wrong (wrong credentials, MFA timeout), the status reflects it.",
      browserUrl: "benefits.gov/kiosk/monitor",
      screenType: "monitor",
      docsLinks: [
        { label: "Webhooks", url: "https://docs.truv.com/docs/webhooks" },
        { label: "Order Statuses", url: "https://docs.truv.com/docs/orders#order-statuses" },
      ],
    },
    {
      title: "Review & Confirm",
      description:
        "The backend calls GET /v1/orders/{id}/ to retrieve the verified data. The API tab shows the full response with connections, income statements, employment details, and asset data. The caseworker reviews the verified information with the applicant present and confirms the verification is complete before proceeding with the benefits application.",
      browserUrl: "benefits.gov/kiosk/review",
      screenType: "review",
      backendAction: "getOrder",
      docsLinks: [
        { label: "Get Order", url: "https://docs.truv.com/reference/get-an-order" },
      ],
    },
  ],
};
