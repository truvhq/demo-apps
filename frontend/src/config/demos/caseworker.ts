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
        "The caseworker views their assigned cases in a queue, with status indicators showing verification progress.",
      browserUrl: "benefits.gov/caseworker/queue",
      screenType: "dashboard",
      docsLinks: [
        { label: "Orders API", url: "https://docs.truv.com/reference/create-an-order" },
      ],
    },
    {
      title: "Case Detail",
      description:
        "Opening a case shows the applicant's information and any existing verification data from Truv orders.",
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
        "The caseworker triggers a new verification by creating an order. The Bridge widget opens inline for the applicant.",
      browserUrl: "benefits.gov/caseworker/case/12345/verify",
      screenType: "bridge",
      backendAction: "createOrder",
      docsLinks: [
        { label: "Create Order", url: "https://docs.truv.com/reference/create-an-order" },
        { label: "Bridge Widget", url: "https://docs.truv.com/docs/truv-bridge" },
      ],
    },
    {
      title: "Decision",
      description:
        "With verified data in hand, the caseworker approves or denies the case and records the decision.",
      browserUrl: "benefits.gov/caseworker/case/12345/decision",
      screenType: "confirmation",
      docsLinks: [],
    },
  ],
};
