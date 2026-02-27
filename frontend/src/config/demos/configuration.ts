import type { DemoConfig } from "@/lib/types";

export const configurationDemo: DemoConfig = {
  id: "configuration",
  title: "Configuration",
  subtitle: "Set up API keys, templates & webhooks",
  description:
    "Walk through setting up the demo app — enter API credentials, configure a Bridge template, and register an ngrok webhook to receive real-time events.",
  icon: "Settings",
  category: "Setup",
  steps: [
    {
      title: "API Keys",
      description:
        "Enter your Truv API credentials. These are sent as X-Access-Client-Id and X-Access-Secret headers on every Truv API call. You can find them in the Truv Dashboard under Settings → API Keys. Optionally override the base URL (defaults to prod.truv.com/v1).",
      browserUrl: "dashboard.truv.com/settings/api-keys",
      screenType: "setup",
      screenProps: { section: "env" },
      docsLinks: [
        { label: "Authentication", url: "https://docs.truv.com/docs/authentication" },
      ],
    },
    {
      title: "Templates",
      description:
        "Templates control how the Bridge widget looks and behaves — branding, search customization, and landing pages. Create or edit templates in the Truv Dashboard, then paste the template_id here. It will be passed in every POST /v1/orders/ request.",
      browserUrl: "dashboard.truv.com/app/customization/templates",
      screenType: "setup",
      screenProps: { section: "templates" },
      docsLinks: [
        { label: "Customization", url: "https://docs.truv.com/docs/customization" },
      ],
    },
    {
      title: "Webhooks",
      description:
        "Register a webhook so Truv sends real-time event notifications (task-status-updated, order-status-updated) to your backend. Use ngrok to expose your local server, then paste the public URL here. The backend will call POST /v1/webhooks/ to register it.",
      browserUrl: "dashboard.truv.com/settings/webhooks",
      screenType: "setup",
      screenProps: { section: "webhooks" },
      docsLinks: [
        { label: "Webhooks", url: "https://docs.truv.com/docs/webhooks" },
      ],
    },
  ],
};
