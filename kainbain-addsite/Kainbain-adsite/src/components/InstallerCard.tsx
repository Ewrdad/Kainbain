import { useMemo, useState } from "react"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { siteContent } from "@/content/site"

type Mode = keyof typeof siteContent.installer.modes

function flag(value: string, fallback: string, name: string) {
  const v = value.trim()
  return v && v !== fallback.trim() ? `${name} ${v}` : null
}

export function InstallerCard() {
  const modes = siteContent.installer.modes
  const [mode, setMode] = useState<Mode>("default")

  const d = modes.default.defaults
  const [backendPort, setBackendPort] = useState<string>(d.backendPort)
  const [frontendPort, setFrontendPort] = useState<string>(d.frontendPort)
  const [runners, setRunners] = useState<string>(d.runners)
  const [installDir, setInstallDir] = useState<string>(d.installDir)

  const r = modes.runner.defaults
  const [runnerId, setRunnerId] = useState<string>(r.runnerId)
  const [runnerBackend, setRunnerBackend] = useState<string>(r.backend)
  const [runnerDir, setRunnerDir] = useState<string>(r.installDir)

  const [copied, setCopied] = useState(false)

  const command = useMemo(() => {
    if (mode === "runner") {
      const flags = [
        flag(runnerId, r.runnerId, "--id"),
        flag(runnerBackend, r.backend, "--backend"),
        flag(runnerDir, r.installDir, "--install-dir"),
      ].filter(Boolean)
      if (flags.length === 0) return modes.runner.baseCommand
      return `${modes.runner.baseCommand} -s -- ${flags.join(" ")}`
    }
    const flags = [
      flag(backendPort, d.backendPort, "--backend-port"),
      flag(frontendPort, d.frontendPort, "--frontend-port"),
      flag(runners, d.runners, "--runners"),
      flag(installDir, d.installDir, "--install-dir"),
    ].filter(Boolean)
    if (flags.length === 0) return modes.default.baseCommand
    return `${modes.default.baseCommand} -s -- ${flags.join(" ")}`
  }, [
    mode,
    modes,
    backendPort,
    frontendPort,
    runners,
    installDir,
    d,
    runnerId,
    runnerBackend,
    runnerDir,
    r,
  ])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(command)
    } catch {
      const ta = document.createElement("textarea")
      ta.value = command
      document.body.appendChild(ta)
      ta.select()
      document.execCommand("copy")
      ta.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-xl">
          {siteContent.installer.title}
        </CardTitle>
        <Tabs
          value={mode}
          onValueChange={(v) => setMode(v as Mode)}
        >
          <TabsList>
            <TabsTrigger value="default">
              {modes.default.label}
            </TabsTrigger>
            <TabsTrigger value="runner">{modes.runner.label}</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-stretch gap-2">
          <code className="flex min-w-0 flex-1 items-center overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs">
            {command}
          </code>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleCopy}
            className="shrink-0"
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          {mode === "runner" ? modes.runner.hint : modes.default.hint}
        </p>

        {mode === "runner" ? (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Runner ID</span>
              <Input
                value={runnerId}
                onChange={(e) => setRunnerId(e.target.value)}
                placeholder={r.runnerId}
                className="font-mono"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Backend URL</span>
              <Input
                value={runnerBackend}
                onChange={(e) => setRunnerBackend(e.target.value)}
                placeholder={r.backend}
                className="font-mono"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Install Location</span>
              <Input
                value={runnerDir}
                onChange={(e) => setRunnerDir(e.target.value)}
                placeholder={r.installDir}
                className="font-mono"
              />
            </label>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm font-medium">Ports</p>
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">Backend</span>
                <Input
                  value={backendPort}
                  onChange={(e) => setBackendPort(e.target.value)}
                  inputMode="numeric"
                  placeholder={d.backendPort}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">Frontend</span>
                <Input
                  value={frontendPort}
                  onChange={(e) => setFrontendPort(e.target.value)}
                  inputMode="numeric"
                  placeholder={d.frontendPort}
                />
              </label>
            </div>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">
                Default Local Runners
              </span>
              <Input
                value={runners}
                onChange={(e) => setRunners(e.target.value)}
                inputMode="numeric"
                placeholder={d.runners}
                className="max-w-40"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Install Location</span>
              <Input
                value={installDir}
                onChange={(e) => setInstallDir(e.target.value)}
                placeholder={d.installDir}
                className="font-mono"
              />
            </label>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
