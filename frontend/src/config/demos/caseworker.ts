import type { DemoConfig } from "@/lib/types";

export const caseworkerDemo: DemoConfig = {
  id: "caseworker",
  title: "Caseworker Dashboard",
  subtitle: "Admin review workflow",
  description:
    "A caseworker dashboard for reviewing applicant cases, viewing verified data, and triggering new verifications.",
  icon: "LayoutDashboard",
  category: "Dashboard",
  steps: [
    {
      title: "Case Queue",
      description:
        "The caseworker views their assigned cases with verification status indicators. Each case maps to a Truv order — statuses like created, in_progress, completed, and action_required reflect where the applicant is in the verification process. In a real integration, you'd poll GET /v1/orders/{id}/ or use webhooks to keep these statuses current.",
      browserUrl: "benefits.gov/caseworker/queue",
      screenType: "dashboard",
      docsLinks: [
        { label: "Orders API", url: "https://docs.truv.com/reference/create-an-order" },
        { label: "Order Statuses", url: "https://docs.truv.com/docs/orders#order-statuses" },
      ],
    },
    {
      title: "Case Detail",
      description:
        "Opening a case calls GET /v1/orders/{id}/ to fetch the latest verification data. The API tab shows the full order response including status, connections array (each employer the applicant linked), and nested income/asset data. If the order has connections, each one includes employer name, employment status, start/end dates, income streams, and pay frequency.",
      browserUrl: "benefits.gov/caseworker/case/12345",
      screenType: "review",
      backendAction: "getOrder",
      docsLinks: [
        { label: "Get Order", url: "https://docs.truv.com/reference/get-an-order" },
      ],
    },
    {
      title: "New Verification",
      description:
        "The caseworker creates a new order via POST /v1/orders/ with the applicant's details. The API tab shows the request (products, consumer info, notification_settings) and response (bridge_token, order id). The Bridge widget opens inline — in this scenario, the caseworker would hand the screen to the applicant or share it on a second monitor. Watch the Bridge tab for onLoad, onEvent, and onSuccess callbacks. The Webhooks tab shows server-side events like task_status_updated as Truv processes the connection.",
      browserUrl: "benefits.gov/caseworker/case/12345/verify",
      screenType: "bridge",
      backendAction: "createOrder",
      docsLinks: [
        { label: "Create Order", url: "https://docs.truv.com/reference/create-an-order" },
        { label: "Bridge Widget", url: "https://docs.truv.com/docs/truv-bridge" },
        { label: "Bridge Events", url: "https://docs.truv.com/docs/bridge-events" },
      ],
    },
    {
      title: "Decision",
      description:
        "With verified income and employment data from Truv, the caseworker makes an eligibility determination. The verified data provides employer name, employment dates, pay rate, and income history — all sourced directly from the payroll provider rather than self-reported. No additional API calls are made at this step.",
      browserUrl: "benefits.gov/caseworker/case/12345/decision",
      screenType: "confirmation",
      docsLinks: [],
    },
  ],
};
