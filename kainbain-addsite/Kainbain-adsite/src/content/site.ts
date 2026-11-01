// Edit all page copy here. Structure matches the hand-drawn layout:
// hero + installer, three value cards, about + compatibility.

export const siteContent = {
  banner: {
    event: "Made for Meta's muse hackathon 2026",
    thanks: '"Thanks!" - Edward',
  },
  hero: {
    githubLabel: "GitHub here",
    githubHref: "https://github.com/Ewrdad/Kainbain",
    title: "Kainbain",
    docsLabel: "Docs here",
    docsHref: "https://github.com/Ewrdad/Kainbain/tree/main/site-docs",
    tagline: "Compute-optimised, user-friendly, safer agents.",
  },
  installer: {
    title: "Get started",
    tabs: ["Linux", "Coming soon"] as const,
    baseCommand: "curl -fsSL https://kainbain.ewrdad.uk/install.sh | bash",
    // Defaults must match deploy/install.sh: a field left at its default
    // emits no flag, so these values ARE the installer's defaults.
    defaults: {
      backendPort: "3100",
      frontendPort: "3100",
      runners: "1",
      installDir: "~/apps/kainbain",
      harness: "pi",
      namespace: "ewrdad",
    },
  },
  features: [
    {
      title: "User Friendly",
      points: [
        "Not another chat to track",
        "Transparent behaviours",
        "AI around how you work",
      ],
    },
    {
      title: "Compute Optimised",
      points: [
        "Clearly defined tasks let you use smaller models",
        "Enhances local AI like Muse, Glimmer and Spark",
        "Distribute load across many runners",
      ],
    },
    {
      title: "Greater Confidence",
      points: [
        "Auditable workflows with key milestones",
        "Easy custom fine-tune integrations for security or more",
        "Give agents and CI tools scored feedback",
      ],
    },
  ],
  about: {
    title: "Check out me",
    roles: [
      "Senior Software Dev",
      "Full time carer",
      "DevSecOps champion",
      "Dev Philosopher",
    ],
    photoLabel: "Photo",
  },
  compatibility: {
    title: "Designed for Muse Code",
    titleHref: "https://dev.meta.ai/products/muse-code/",
    benefits: [
      "Better task following",
      "Better metrics",
      "Better tested",
    ],
    alsoSupportsTitle: "Also supports:",
    alsoSupports: [
      { label: "Pi", href: "https://pi.dev" },
      { label: "OpenCode", href: "https://opencode.ai" },
      { label: "Codex", href: "https://openai.com/codex" },
      { label: "Vibe CLI", href: "https://mistral.ai/products/vibe" },
      { label: "Antigravity", href: "https://antigravity.google" },
      { label: "Custom CLI's" },
    ],
  },
  footer: {
    text: "Kainbain install / docs / advertising site. Content is placeholder — edit src/content/site.ts.",
  },
} as const

export type SiteContent = typeof siteContent
