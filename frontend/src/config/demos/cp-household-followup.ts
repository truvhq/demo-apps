import type { DemoConfig } from "@/lib/types";

export const cpHouseholdFollowupDemo: DemoConfig = {
  id: "cp-household-followup",
  title: "Household Member Follows Up",
  subtitle: "Household member completes verification after primary applicant",
  description:
    "After the primary applicant finishes, a household member follows a to-do task or link in the customer portal to complete their own income verification.",
  icon: "Users",
  section: "customer-portal",
  scenarioType: "happy-path",
  category: "Inline Embed",
  steps: [
    {
      title: "Household Member Info",
      description:
        "The household member logs into the customer portal and sees a follow-up task or to-do item requiring income verification. They enter their personal details (name, SSN). When submitted, the backend calls POST /v1/orders/ to create a new order specifically for this household member, linked to the same case. Alternatively, if using Truv's customizable templates or the state's channels with start_client_url, the member may have received an email or SMS directing them here.",
      browserUrl: "benefits.gov/apply/household",
      screenType: "form",
      docsLinks: [
        { label: "Orders API", url: "https://docs.truv.com/reference/create-an-order" },
      ],
    },
    {
      title: "Verification",
      description:
        "The bridge_token from the order is passed to the TruvBridge inline widget. The household member selects their employer, logs in, and connects their payroll account. Watch the Bridge tab for onLoad, onEvent, and onSuccess callbacks. The Webhooks tab streams events as Truv processes the connection. When the order completes, the page auto-advances to Review Data.",
      browserUrl: "benefits.gov/apply/household/verify",
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
        "Once the household member's order completes, the backend calls GET /v1/orders/{id}/certifications/ and GET /v1/orders/{id}/ to retrieve verified data. The caseworker can now review all household members' data together to make an eligibility determination.",
      browserUrl: "benefits.gov/apply/household/review",
      screenType: "review",
      backendAction: "getOrder",
      docsLinks: [
        { label: "Get Order", url: "https://docs.truv.com/reference/get-an-order" },
        { label: "Certifications", url: "https://docs.truv.com/reference/orders_certifications_results" },
      ],
    },
  ],
};
