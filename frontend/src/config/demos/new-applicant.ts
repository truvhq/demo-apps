import type { DemoConfig } from "@/lib/types";

export const newApplicantDemo: DemoConfig = {
  id: "cp-apply-complete",
  title: "New Applicant — Full Completion",
  subtitle: "Primary applicant applies online and completes verification",
  description:
    "Walk through a new benefits applicant completing income verification via an embedded Truv Bridge widget. The applicant enters their info, connects their employer through Bridge, and the caseworker reviews the verified data.",
  icon: "UserPlus",
  section: "customer-portal",
  scenarioType: "happy-path",
  category: "Inline Embed",
  steps: [
    {
      title: "Applicant Info",
      description:
        "The applicant enters their personal details (name, SSN). When submitted, the backend calls POST /v1/orders/ with products: [\"income\", \"assets\"], the consumer's first_name, last_name, SSN, an order_number, and notification_settings. Check the API tab to see the full request payload and Truv's response — it returns an order id, bridge_token (used to launch Bridge), and a share_url.",
      browserUrl: "benefits.gov/apply",
      screenType: "form",
      docsLinks: [
        { label: "Orders API", url: "https://docs.truv.com/reference/create-an-order" },
      ],
    },
    {
      title: "Verification",
      description:
        "The bridge_token from the previous step is passed to the TruvBridge inline widget (via @truv/react). The widget renders directly in the page — the applicant selects their employer, logs in, and connects their payroll account. Watch the Bridge tab for real-time callback events: onLoad fires when the widget initializes, onEvent fires during each user interaction (employer selected, credentials entered, MFA completed), and onSuccess fires with a public_token when the connection succeeds. The API tab shows the initial POST /v1/orders/ call. If webhooks are configured, the Webhooks tab streams events like task_status_updated as Truv processes the connection. When the order completes, the page auto-advances to Review Data.",
      browserUrl: "benefits.gov/apply/verify",
      screenType: "bridge",
      backendAction: "createOrder",
      docsLinks: [
        { label: "Create Order", url: "https://docs.truv.com/reference/create-an-order" },
        { label: "Bridge Widget", url: "https://docs.truv.com/docs/truv-bridge" },
        { label: "Bridge Events", url: "https://docs.truv.com/docs/bridge-events" },
      ],
    },
    {
      title: "Review Data",
      description:
        "When the order completes (via webhook order-status-updated with status: completed), the backend automatically calls GET /v1/orders/{id}/certifications/ to retrieve self-certification results, then GET /v1/orders/{id}/ to fetch the full verified data. Check the API tab to see the responses — certifications include what the applicant confirmed during Bridge, and the order response includes employer info, income statements, and asset data.",
      browserUrl: "benefits.gov/apply/review",
      screenType: "review",
      backendAction: "getOrder",
      docsLinks: [
        { label: "Get Order", url: "https://docs.truv.com/reference/get-an-order" },
        { label: "Certifications", url: "https://docs.truv.com/reference/orders_certifications_results" },
        { label: "Order Statuses", url: "https://docs.truv.com/docs/orders#order-statuses" },
      ],
    },
  ],
};
