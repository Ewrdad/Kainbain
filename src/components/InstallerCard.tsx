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

export function InstallerCard() {
  const d = siteContent.installer.defaults
  const [backendPort, setBackendPort] = useState<string>(d.backendPort)
  const [frontendPort, setFrontendPort] = useState<string>(d.frontendPort)
  const [runners, setRunners] = useState<string>(d.runners)
  const [installDir, setInstallDir] = useState<string>(d.installDir)
  const [harness, setHarness] = useState<string>(d.harness)
  const [namespace, setNamespace] = useState<string>(d.namespace)
  const [copied, setCopied] = useState(false)

  const command = useMemo(() => {
    const flags = [
      backendPort.trim() && backendPort.trim() !== d.backendPort.trim()
        ? `--backend-port ${backendPort.trim()}`
        : null,
      frontendPort.trim() && frontendPort.trim() !== d.frontendPort.trim()
        ? `--frontend-port ${frontendPort.trim()}`
        : null,
      runners.trim() && runners.trim() !== d.runners.trim()
        ? `--runners ${runners.trim()}`
        : null,
      installDir.trim() && installDir.trim() !== d.installDir.trim()
        ? `--install-dir ${installDir.trim()}`
        : null,
      harness.trim() && harness.trim() !== d.harness.trim()
        ? `--harness ${harness.trim()}`
        : null,
      namespace.trim() && namespace.trim() !== d.namespace.trim()
        ? `--namespace ${namespace.trim()}`
        : null,
    ].filter(Boolean)
    if (flags.length === 0) return siteContent.installer.baseCommand
    return `${siteContent.installer.baseCommand} -s -- ${flags.join(" ")}`
  }, [backendPort, frontendPort, runners, installDir, harness, namespace, d])

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
        <Tabs defaultValue="Linux">
          <TabsList>
            <TabsTrigger value="Linux">Linux</TabsTrigger>
            <TabsTrigger value="Coming soon" disabled>
              Coming soon
            </TabsTrigger>
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
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Runner Harness</span>
              <Input
                value={harness}
                onChange={(e) => setHarness(e.target.value)}
                placeholder={d.harness}
                className="font-mono"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Image Namespace</span>
              <Input
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
                placeholder={d.namespace}
                className="font-mono"
              />
            </label>
          </div>
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
      </CardContent>
    </Card>
  )
}
