import type { DemoConfig } from "@/lib/types";

export const cpPendingHouseholdDemo: DemoConfig = {
  id: "cp-pending-household",
  title: "Pending Household Member",
  subtitle: "Primary completes but household member hasn't verified",
  description:
    "The primary applicant completes their verification, but a household member still needs to finish. The system sends reminders via email/SMS and tracks progress until all members are verified.",
  icon: "Clock",
  section: "customer-portal",
  scenarioType: "edge-case",
  category: "Inline Embed",
  steps: [
    {
      title: "Primary Applicant Info",
      description:
        "The primary applicant has already completed their verification. Their order shows status 'completed' with verified income and employment data. Now the household member needs to complete their own verification. The system creates a separate order for the household member.",
      browserUrl: "benefits.gov/apply",
      screenType: "form",
      docsLinks: [
        { label: "Orders API", url: "https://docs.truv.com/reference/create-an-order" },
      ],
    },
    {
      title: "Primary Verification",
      description:
        "The primary applicant completes Bridge successfully. Their onSuccess callback fires and the order transitions to 'completed'. The API tab shows the full verified data. But the case isn't fully complete — a household member still needs to verify. A new order is created for the household member.",
      browserUrl: "benefits.gov/apply/verify",
      screenType: "bridge",
      backendAction: "createOrder",
      docsLinks: [
        { label: "Bridge Widget", url: "https://docs.truv.com/docs/truv-bridge" },
        { label: "Create Order", url: "https://docs.truv.com/reference/create-an-order" },
      ],
    },
    {
      title: "Send Household Reminder",
      description:
        "The system sends a reminder to the household member via email and/or SMS using the share_url from their order. If follow-up tasks are configured, a to-do item appears in the customer portal when the household member logs in. The reminder brings them back to complete their own verification.",
      browserUrl: "benefits.gov/apply/household-reminder",
      screenType: "send-link",
      docsLinks: [
        { label: "Share URL", url: "https://docs.truv.com/docs/orders#share-url" },
      ],
    },
    {
      title: "Monitor Household Progress",
      description:
        "Track the household member's progress via webhooks. The Webhooks tab shows events as they complete Bridge on their own device. The dashboard shows the overall case status: primary applicant 'completed', household member 'pending' or 'in_progress'. Once all members complete, the case is ready for caseworker review.",
      browserUrl: "benefits.gov/apply/monitor",
      screenType: "monitor",
      docsLinks: [
        { label: "Webhooks", url: "https://docs.truv.com/docs/webhooks" },
        { label: "Order Statuses", url: "https://docs.truv.com/docs/orders#order-statuses" },
      ],
    },
  ],
};
