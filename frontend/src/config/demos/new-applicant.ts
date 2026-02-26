import type { DemoConfig } from "@/lib/types";

export const newApplicantDemo: DemoConfig = {
  id: "new-applicant",
  title: "New Applicant",
  subtitle: "Inline embedded order",
  description:
    "Walk through a new benefits applicant completing income verification via an embedded Truv Bridge widget.",
  icon: "UserPlus",
  category: "Inline Embed",
  steps: [
    {
      title: "Applicant Info",
      description:
        "The applicant fills in personal information. This data is sent to the backend to create a Truv order with consumer details.",
      browserUrl: "benefits.gov/apply",
      screenType: "form",
      docsLinks: [
        { label: "Orders API", url: "https://docs.truv.com/reference/create-an-order" },
      ],
    },
    {
      title: "Create Order",
      description:
        "The backend calls POST /v1/orders/ with the applicant info. Truv returns a bridge_token for the frontend to embed the Bridge widget.",
      browserUrl: "benefits.gov/apply/verify",
      screenType: "bridge",
      backendAction: "createOrder",
      docsLinks: [
        { label: "Create Order", url: "https://docs.truv.com/reference/create-an-order" },
        { label: "Bridge Widget", url: "https://docs.truv.com/docs/truv-bridge" },
      ],
    },
    {
      title: "Review Data",
      description:
        "After the applicant completes Bridge, the backend fetches the verified data from GET /v1/orders/{id}/. The caseworker reviews employment and income details.",
      browserUrl: "benefits.gov/apply/review",
      screenType: "review",
      backendAction: "getOrder",
      docsLinks: [
        { label: "Get Order", url: "https://docs.truv.com/reference/get-an-order" },
      ],
    },
    {
      title: "Confirmation",
      description:
        "Application submitted with verified data. A reference number is generated and the applicant receives confirmation.",
      browserUrl: "benefits.gov/apply/confirmation",
      screenType: "confirmation",
      docsLinks: [],
    },
  ],
};
