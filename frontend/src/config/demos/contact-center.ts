import type { DemoConfig } from "@/lib/types";

export const contactCenterDemo: DemoConfig = {
  id: "contact-center",
  title: "Contact Center",
  subtitle: "Share URL via SMS/email",
  description:
    "An agent creates a verification order and sends the share URL via SMS or email. The applicant completes on their own device while the agent monitors progress.",
  icon: "Phone",
  category: "Share URL",
  steps: [
    {
      title: "Caller Info",
      description:
        "The contact center agent captures the caller's basic information to create a verification order.",
      browserUrl: "benefits.gov/agent/new-call",
      screenType: "form",
      docsLinks: [
        { label: "Orders API", url: "https://docs.truv.com/reference/create-an-order" },
      ],
    },
    {
      title: "Send Link",
      description:
        "The backend creates an order and gets a share_url. The agent sends it via SMS or email to the applicant.",
      browserUrl: "benefits.gov/agent/send-link",
      screenType: "send-link",
      backendAction: "createOrder",
      docsLinks: [
        { label: "Create Order", url: "https://docs.truv.com/reference/create-an-order" },
        { label: "Share URL", url: "https://docs.truv.com/docs/truv-bridge" },
      ],
    },
    {
      title: "Monitor Progress",
      description:
        "The agent monitors the applicant's progress in real-time via webhooks. Events stream in as the applicant connects their employer.",
      browserUrl: "benefits.gov/agent/monitor",
      screenType: "monitor",
      docsLinks: [
        { label: "Webhooks", url: "https://docs.truv.com/docs/webhooks" },
      ],
    },
    {
      title: "Retrieve Data",
      description:
        "Once the applicant completes verification, the agent retrieves the verified data and proceeds with the case.",
      browserUrl: "benefits.gov/agent/review",
      screenType: "review",
      backendAction: "getOrder",
      docsLinks: [
        { label: "Get Order", url: "https://docs.truv.com/reference/get-an-order" },
      ],
    },
  ],
};
