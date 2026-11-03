import { ArrowUpRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { BrandIcon } from "@/components/BrandIcon"
import { InstallerCard } from "@/components/InstallerCard"
import { siteContent } from "@/content/site"

export function App() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6">
        <p className="text-center text-xs text-muted-foreground">
          {siteContent.banner.event}
          <span className="mx-2" aria-hidden="true">
            ·
          </span>
          {siteContent.banner.thanks}
        </p>

        <section className="grid items-center gap-6 lg:grid-cols-[1fr_1.5fr]">
          <div className="flex flex-col items-start gap-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={siteContent.hero.githubHref}>
                  {siteContent.hero.githubLabel}
                  <ArrowUpRight data-icon="inline-end" />
                </a>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <a href={siteContent.hero.docsHref}>
                  {siteContent.hero.docsLabel}
                  <ArrowUpRight data-icon="inline-end" />
                </a>
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <BrandIcon className="size-12 shrink-0 sm:size-14" />
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                {siteContent.hero.title}
              </h1>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              {siteContent.hero.tagline}
            </p>
          </div>

          <InstallerCard />
        </section>

        <section
          aria-label="Features"
          className="grid gap-4 md:grid-cols-3"
        >
          {siteContent.features.map((feature) => (
            <Card key={feature.title}>
              <CardHeader>
                <CardTitle>{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2 text-sm leading-relaxed">
                  {feature.points.map((point) => (
                    <li key={point} className="flex gap-2">
                      <span
                        aria-hidden="true"
                        className="mt-2 size-1 shrink-0 rounded-full bg-primary"
                      />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Card>
            <div className="grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="flex flex-col gap-3">
                <h2 className="font-semibold">{siteContent.about.title}</h2>
                <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                  {siteContent.about.roles.map((role) => (
                    <li key={role}>- {role}</li>
                  ))}
                </ul>
              </div>
              <div
                aria-label={siteContent.about.photoLabel}
                className="flex h-36 w-full items-center justify-center rounded-lg border border-dashed bg-muted text-sm text-muted-foreground sm:w-56"
              >
                {siteContent.about.photoLabel}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <a
                  href={siteContent.compatibility.titleHref}
                  target="_blank"
                  rel="noreferrer"
                  className="underline-offset-4 hover:underline"
                >
                  {siteContent.compatibility.title}
                </a>
              </CardTitle>
              <CardDescription>
                <ul className="mt-1 flex flex-col gap-1">
                  {siteContent.compatibility.benefits.map((benefit) => (
                    <li key={benefit}>+ {benefit}</li>
                  ))}
                </ul>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 border-t pt-4">
              <p className="text-sm font-medium">
                {siteContent.compatibility.alsoSupportsTitle}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {siteContent.compatibility.alsoSupports.map((item) =>
                  "href" in item && item.href ? (
                    <Badge key={item.label} variant="secondary" asChild>
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {item.label}
                      </a>
                    </Badge>
                  ) : (
                    <Badge key={item.label} variant="secondary">
                      {item.label}
                    </Badge>
                  )
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        <footer className="pb-4 text-center text-xs text-muted-foreground">
          {siteContent.footer.text}
        </footer>
      </div>
    </div>
  )
}

export default App
