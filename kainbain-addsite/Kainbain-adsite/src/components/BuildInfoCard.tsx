import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { siteContent } from "@/content/site"
import type { BuildInfo, BuildInfoScan } from "@/content/buildInfo"

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"]

function severityVariant(
  severity: string
): "destructive" | "secondary" | "outline" {
  if (severity === "CRITICAL" || severity === "HIGH") return "destructive"
  if (severity === "MEDIUM") return "outline"
  return "secondary"
}

function shortHash(hash: string) {
  return hash.length > 19 ? `${hash.slice(0, 19)}…` : hash
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

function ScanSummary({ scan }: { scan: BuildInfoScan }) {
  const labels = siteContent.build.labels
  if (scan.scanned === false) {
    return (
      <p className="text-xs text-muted-foreground">
        {labels.notScanned}
        {scan.reason ? ` — ${scan.reason}` : ""}
      </p>
    )
  }
  const counts = scan.counts ?? {}
  const shown = SEVERITY_ORDER.filter((s) => (counts[s] ?? 0) > 0)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {shown.length === 0 ? (
          <Badge variant="secondary">0 {labels.findings}</Badge>
        ) : (
          shown.map((s) => (
            <Badge key={s} variant={severityVariant(s)}>
              {s} {counts[s]}
            </Badge>
          ))
        )}
        <span className="text-xs text-muted-foreground">
          {scan.total ?? 0} {labels.findings}
        </span>
      </div>
      {(scan.top ?? []).slice(0, 3).map((f) => (
        <p
          key={`${f.id}-${f.pkg}`}
          className="truncate text-xs text-muted-foreground"
          title={`${f.id} ${f.pkg}@${f.installed} — ${f.title}`}
        >
          {f.id} · {f.pkg}@{f.installed}
        </p>
      ))}
    </div>
  )
}

export function BuildInfoCard() {
  const { build } = siteContent
  const [info, setInfo] = useState<BuildInfo | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const base = import.meta.env.BASE_URL ?? "/"
    fetch(`${base}build-info.json`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<BuildInfo>
      })
      .then(setInfo)
      .catch(() => setFailed(true))
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{build.title}</CardTitle>
        <CardDescription>{build.subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {info === null && !failed && (
          <p className="text-sm text-muted-foreground">{build.loading}</p>
        )}
        {failed && (
          <p className="text-sm text-muted-foreground">{build.unavailable}</p>
        )}
        {info !== null && (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{build.labels.build}</dt>
              <dd className="font-mono">#{info.buildNumber}</dd>
              <dt className="text-muted-foreground">
                {build.labels.published}
              </dt>
              <dd>{formatDate(info.publishedAt ?? info.generatedAt)}</dd>
              <dt className="text-muted-foreground">{build.labels.commit}</dt>
              <dd>
                <a
                  href={`${build.githubCommitBase}${info.commit}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono underline-offset-4 hover:underline"
                  title={info.commit}
                >
                  {info.shortCommit || info.commit}
                </a>
              </dd>
            </dl>

            {Object.keys(info.images).length > 0 && (
              <div className="flex flex-col gap-2 border-t pt-3">
                <p className="text-sm font-medium">{build.labels.images}</p>
                {Object.entries(info.images).map(([name, img]) => (
                  <div key={name} className="flex flex-col gap-0.5 text-xs">
                    <p className="font-medium">
                      {name} <span className="font-mono">:{img.tag}</span>
                    </p>
                    <p
                      className="font-mono text-muted-foreground"
                      title={img.digest ?? img.image}
                    >
                      {build.labels.digest}{" "}
                      {img.digest
                        ? shortHash(img.digest)
                        : build.labels.noDigest}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {info.runner && (
              <div className="flex flex-col gap-0.5 border-t pt-3 text-xs">
                <p className="text-sm font-medium">
                  {build.labels.runnerArtifact}
                </p>
                <p className="font-mono">{info.runner.artifact}</p>
                <p
                  className="font-mono text-muted-foreground"
                  title={info.runner.sha256}
                >
                  {build.labels.sha256} {shortHash(info.runner.sha256)}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2 border-t pt-3">
              <p className="text-sm font-medium">{build.labels.trivy}</p>
              {!info.trivy.available ? (
                <p className="text-xs text-muted-foreground">
                  {build.labels.trivyUnavailable}
                  {info.trivy.reason ? ` — ${info.trivy.reason}` : ""}
                </p>
              ) : (
                <>
                  {Object.entries(info.trivy.images).map(([name, scan]) => (
                    <div key={name} className="flex flex-col gap-1">
                      <p className="text-xs font-medium">{name}</p>
                      <ScanSummary scan={scan} />
                    </div>
                  ))}
                  {info.trivy.source && (
                    <div className="flex flex-col gap-1">
                      <p className="text-xs font-medium">source</p>
                      <ScanSummary scan={info.trivy.source} />
                    </div>
                  )}
                  {Object.keys(info.trivy.images).length === 0 &&
                    !info.trivy.source && (
                      <p className="text-xs text-muted-foreground">
                        {build.labels.notScanned}
                      </p>
                    )}
                </>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
