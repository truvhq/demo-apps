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
        "The caseworker captures applicant information during an in-person interview at the office.",
      browserUrl: "benefits.gov/kiosk/interview",
      screenType: "form",
      docsLinks: [
        { label: "Orders API", url: "https://docs.truv.com/reference/create-an-order" },
      ],
    },
    {
      title: "Display QR Code",
      description:
        "The backend creates an order with a share_url. A QR code is generated from the share URL for the applicant to scan.",
      browserUrl: "benefits.gov/kiosk/qr",
      screenType: "qr-code",
      backendAction: "createOrder",
      docsLinks: [
        { label: "Create Order", url: "https://docs.truv.com/reference/create-an-order" },
        { label: "Share URL", url: "https://docs.truv.com/docs/truv-bridge" },
      ],
    },
    {
      title: "Monitor Progress",
      description:
        "While the applicant completes verification on their phone, the caseworker monitors progress via live webhooks.",
      browserUrl: "benefits.gov/kiosk/monitor",
      screenType: "monitor",
      docsLinks: [
        { label: "Webhooks", url: "https://docs.truv.com/docs/webhooks" },
      ],
    },
    {
      title: "Review & Confirm",
      description:
        "The verified data is retrieved and reviewed. The caseworker confirms the verification is complete.",
      browserUrl: "benefits.gov/kiosk/review",
      screenType: "review",
      backendAction: "getOrder",
      docsLinks: [
        { label: "Get Order", url: "https://docs.truv.com/reference/get-an-order" },
      ],
    },
  ],
};
