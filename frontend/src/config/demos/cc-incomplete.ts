import type { DemoConfig } from "@/lib/types";

export const ccIncompleteDemo: DemoConfig = {
  id: "cc-incomplete",
  title: "Caller Doesn't Complete",
  subtitle: "Agent sends link but applicant doesn't finish verification",
  description:
    "The applicant calls the contact center and the agent sends a verification link, but the applicant never completes the process. The system tracks the pending order for follow-up.",
  icon: "PhoneOff",
  section: "contact-center",
  scenarioType: "edge-case",
  category: "Share URL",
  steps: [
    {
      title: "Caller Info",
      description:
        "The contact center agent captures the caller's name, SSN, email, and phone number. This information is used to create the Truv order and deliver the verification link.",
      browserUrl: "benefits.gov/agent/new-call",
      screenType: "form",
      docsLinks: [
        { label: "Orders API", url: "https://docs.truv.com/reference/create-an-order" },
      ],
    },
    {
      title: "Send Link",
      description:
        "The backend calls POST /v1/orders/ and the agent sends the share_url to the caller via SMS or email while they're on the phone. The applicant receives the link but doesn't complete verification during the call — they may say they'll do it later or need to find their employer login credentials.",
      browserUrl: "benefits.gov/agent/send-link",
      screenType: "send-link",
      backendAction: "createOrder",
      docsLinks: [
        { label: "Create Order", url: "https://docs.truv.com/reference/create-an-order" },
        { label: "Share URL", url: "https://docs.truv.com/docs/orders#share-url" },
      ],
    },
    {
      title: "Monitor — No Completion",
      description:
        "The agent monitors for progress but no webhook events arrive — the applicant hasn't clicked the link or started Bridge. The order remains in 'created' status. After the call ends, the order stays pending in the system for follow-up by the contact center or caseworker team.",
      browserUrl: "benefits.gov/agent/monitor",
      screenType: "monitor",
      docsLinks: [
        { label: "Webhooks", url: "https://docs.truv.com/docs/webhooks" },
        { label: "Order Statuses", url: "https://docs.truv.com/docs/orders#order-statuses" },
      ],
    },
    {
      title: "Schedule Follow-Up",
      description:
        "Since the applicant didn't complete, the agent notes the case for follow-up. The existing order with its share_url remains valid — the applicant can still click the link later. Additional reminder emails/SMS can be sent. If the applicant calls back, the agent can reference the existing order rather than creating a new one.",
      browserUrl: "benefits.gov/agent/followup",
      screenType: "confirmation",
      docsLinks: [
        { label: "Get Order", url: "https://docs.truv.com/reference/get-an-order" },
      ],
    },
  ],
};
