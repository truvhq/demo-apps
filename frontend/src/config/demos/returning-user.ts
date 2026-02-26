import type { DemoConfig } from "@/lib/types";

export const returningUserDemo: DemoConfig = {
  id: "returning-user",
  title: "Returning User",
  subtitle: "Order refresh flow",
  description:
    "Demonstrate how a returning applicant's previously verified data can be refreshed without re-entering credentials.",
  icon: "RefreshCw",
  category: "Inline Embed",
  steps: [
    {
      title: "Load Profile",
      description:
        "The system loads the applicant's existing profile and prior verification data from a previous order.",
      browserUrl: "benefits.gov/recertify",
      screenType: "form",
      screenProps: { prefilled: true },
      docsLinks: [
        { label: "Get Order", url: "https://docs.truv.com/reference/get-an-order" },
      ],
    },
    {
      title: "Refresh Order",
      description:
        "The backend calls POST /v1/orders/{id}/refresh/ to pull updated income data without requiring the applicant to re-authenticate.",
      browserUrl: "benefits.gov/recertify/refresh",
      screenType: "bridge",
      backendAction: "createOrder",
      docsLinks: [
        { label: "Refresh Order", url: "https://docs.truv.com/reference/refresh-an-order" },
      ],
    },
    {
      title: "Compare Data",
      description:
        "Side-by-side comparison of previous and refreshed verification data to identify changes in employment or income.",
      browserUrl: "benefits.gov/recertify/compare",
      screenType: "review",
      backendAction: "getOrder",
      docsLinks: [
        { label: "Get Order", url: "https://docs.truv.com/reference/get-an-order" },
      ],
    },
    {
      title: "Decision",
      description:
        "Based on the refreshed data, the system makes an eligibility determination and notifies the applicant.",
      browserUrl: "benefits.gov/recertify/decision",
      screenType: "confirmation",
      docsLinks: [],
    },
  ],
};
