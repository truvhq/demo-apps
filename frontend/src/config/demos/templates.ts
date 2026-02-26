import type { DemoConfig } from "@/lib/types";

export const templatesDemo: DemoConfig = {
  id: "templates",
  title: "Customization Templates",
  subtitle: "Branding & configuration",
  description:
    "Configure how the Truv Bridge widget looks and behaves. Set branding, colors, search experience, and landing pages.",
  icon: "Palette",
  category: "Templates",
  steps: [
    {
      title: "Select Product",
      description:
        "Choose which product type (VOIE, VOE, VOA) the template applies to. Different products may have different customization options.",
      browserUrl: "dashboard.truv.com/templates/new",
      screenType: "template",
      screenProps: { section: "product" },
      docsLinks: [
        { label: "Customization", url: "https://docs.truv.com/docs/customization" },
      ],
    },
    {
      title: "Configure Branding",
      description:
        "Set company name, logo, colors (background, button, accent), and toggle confetti on success.",
      browserUrl: "dashboard.truv.com/templates/branding",
      screenType: "template",
      screenProps: { section: "branding" },
      docsLinks: [
        { label: "Customization", url: "https://docs.truv.com/docs/customization" },
        { label: "Bridge Widget", url: "https://docs.truv.com/docs/truv-bridge" },
      ],
    },
    {
      title: "Customize Search",
      description:
        "Set search header text, control visible provider categories, and choose popular vs. custom provider list.",
      browserUrl: "dashboard.truv.com/templates/search",
      screenType: "template",
      screenProps: { section: "search" },
      docsLinks: [
        { label: "Customization", url: "https://docs.truv.com/docs/customization" },
      ],
    },
    {
      title: "Landing Pages",
      description:
        "Configure initial, expired, and success landing page content. Set email/SMS text with dynamic variables.",
      browserUrl: "dashboard.truv.com/templates/landing",
      screenType: "template",
      screenProps: { section: "landing" },
      docsLinks: [
        { label: "Customization", url: "https://docs.truv.com/docs/customization" },
      ],
    },
    {
      title: "Preview",
      description:
        "Preview how the Bridge widget looks with your template configuration applied. See before/after comparison.",
      browserUrl: "dashboard.truv.com/templates/preview",
      screenType: "template",
      screenProps: { section: "preview" },
      docsLinks: [
        { label: "Customization", url: "https://docs.truv.com/docs/customization" },
        { label: "Bridge Widget", url: "https://docs.truv.com/docs/truv-bridge" },
      ],
    },
  ],
};
