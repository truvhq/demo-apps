import type { DemoConfig } from "@/lib/types";

export const cpRenewalReauthDemo: DemoConfig = {
  id: "cp-renewal-reauth",
  title: "Renewal — Re-Auth Required",
  subtitle: "Backend refresh fails, applicant must re-authenticate",
  description:
    "During renewal, the backend refresh fails (e.g., expired credentials, provider changes). The applicant receives an email/SMS 30-90 days before renewal to re-authenticate and refresh their data.",
  icon: "AlertTriangle",
  section: "customer-portal",
  scenarioType: "edge-case",
  category: "Inline Embed",
  steps: [
    {
      title: "Load Profile",
      description:
        "The system loads the applicant's existing profile and previous verification data. Benefits renewal is approaching (30-90 days out). The backend attempts an automatic refresh via the Refresh Order API, but it will fail because the applicant's credentials are no longer valid.",
      browserUrl: "benefits.gov/recertify",
      screenType: "form",
      screenProps: { prefilled: true },
      docsLinks: [
        { label: "Get Order", url: "https://docs.truv.com/reference/get-an-order" },
        { label: "Refresh Order", url: "https://docs.truv.com/reference/refresh-an-order" },
      ],
    },
    {
      title: "Refresh Fails",
      description:
        "The backend calls POST /v1/orders/{id}/refresh/ but the refresh fails — the applicant's payroll credentials have expired, the employer switched providers, or MFA settings changed. The API tab shows the error response. The system now needs to send the applicant through Bridge again to re-authenticate. An email/SMS is queued with a share_url or start_client_url to bring them back.",
      browserUrl: "benefits.gov/recertify/failed",
      screenType: "confirmation",
      backendAction: "createOrder",
      docsLinks: [
        { label: "Refresh Order", url: "https://docs.truv.com/reference/refresh-an-order" },
        { label: "Order Statuses", url: "https://docs.truv.com/docs/orders#order-statuses" },
      ],
    },
    {
      title: "Re-Verification",
      description:
        "The applicant clicks the link from the email/SMS and re-authenticates through Bridge. This is a full Bridge flow — they select their employer, enter updated credentials, complete MFA. Watch the Bridge tab for the full callback sequence. Because this is a renewal, the applicant's information is already on file; only the payroll connection needs to be re-established.",
      browserUrl: "benefits.gov/recertify/verify",
      screenType: "bridge",
      docsLinks: [
        { label: "Bridge Widget", url: "https://docs.truv.com/docs/truv-bridge" },
        { label: "Bridge Events", url: "https://docs.truv.com/docs/bridge-events" },
      ],
    },
    {
      title: "Review Updated Data",
      description:
        "After successful re-authentication, the backend calls GET /v1/orders/{id}/ and GET /v1/orders/{id}/certifications/ to retrieve the refreshed data. Compare against previous verification to identify changes. The renewal determination can now proceed with fresh, verified data.",
      browserUrl: "benefits.gov/recertify/review",
      screenType: "review",
      backendAction: "getOrder",
      docsLinks: [
        { label: "Get Order", url: "https://docs.truv.com/reference/get-an-order" },
        { label: "Certifications", url: "https://docs.truv.com/reference/orders_certifications_results" },
      ],
    },
  ],
};
