import type { DemoConfig } from "@/lib/types";

export const cpIncompleteDemo: DemoConfig = {
  id: "cp-incomplete",
  title: "Applicant Doesn't Complete",
  subtitle: "Primary applicant starts but abandons verification",
  description:
    "The applicant begins the online application but doesn't finish verification. The system sends follow-up reminders via email/SMS or creates to-do tasks to bring them back.",
  icon: "UserX",
  section: "customer-portal",
  scenarioType: "edge-case",
  category: "Inline Embed",
  steps: [
    {
      title: "Applicant Info",
      description:
        "The applicant enters their personal details and submits the form. The backend calls POST /v1/orders/ to create the order. The order is created with status 'created' and a bridge_token is returned, but the applicant hasn't completed Bridge yet.",
      browserUrl: "benefits.gov/apply",
      screenType: "form",
      docsLinks: [
        { label: "Orders API", url: "https://docs.truv.com/reference/create-an-order" },
      ],
    },
    {
      title: "Start Verification",
      description:
        "The Bridge widget loads and the applicant may begin selecting an employer, but they abandon the flow before completing — they close the browser, get distracted, or encounter an issue. The Bridge tab shows onLoad and possibly some onEvent callbacks, but never fires onSuccess. The order remains in 'created' or 'action_required' status.",
      browserUrl: "benefits.gov/apply/verify",
      screenType: "bridge",
      backendAction: "createOrder",
      docsLinks: [
        { label: "Bridge Widget", url: "https://docs.truv.com/docs/truv-bridge" },
        { label: "Order Statuses", url: "https://docs.truv.com/docs/orders#order-statuses" },
      ],
    },
    {
      title: "Send Reminder",
      description:
        "Since the applicant didn't complete, the system triggers a follow-up. Option 1: Follow-up tasks or to-do items appear in the customer portal when they log back in. Option 2: Email & SMS reminders are sent using Truv's notification_settings or the State's own channels with the share_url from the order. The share_url lets the applicant resume verification on any device.",
      browserUrl: "benefits.gov/apply/reminder",
      screenType: "send-link",
      docsLinks: [
        { label: "Share URL", url: "https://docs.truv.com/docs/orders#share-url" },
      ],
    },
    {
      title: "Monitor Completion",
      description:
        "The system monitors for the applicant's return via webhooks. If they click the share_url and complete Bridge, task_status_updated and order-status-updated webhooks fire. The order transitions from action_required → in_progress → completed. If they never return, the order stays in its current status and may eventually be flagged for caseworker follow-up.",
      browserUrl: "benefits.gov/apply/monitor",
      screenType: "monitor",
      docsLinks: [
        { label: "Webhooks", url: "https://docs.truv.com/docs/webhooks" },
        { label: "Order Statuses", url: "https://docs.truv.com/docs/orders#order-statuses" },
      ],
    },
  ],
};
