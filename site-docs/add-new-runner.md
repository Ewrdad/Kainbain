---
title: Adding a New Runner
section: working-with
order: 20
slug: add-new-runner
---

# Adding a New Runner

This guide walks you through adding a new runner to your KainBain deployment. Runners are out-of-process task executors that enable horizontal scaling of your AI agent workloads.

## Prerequisites

Before adding a runner, ensure you have:

- A running KainBain backend (API server on port 3100 by default)
- A Runner join token (obtained from Settings › Harness › Runners)
- Node.js installed (v20.11+ recommended)
- Git installed (for repository operations)
- Appropriate permissions to install and run services on the target machine

## Types of Runners

KainBain supports two types of runners:

1. **Local Runner** - Runs on the same machine as the backend
2. **Remote Runner** - Runs on a different machine and connects to the backend

Both types use the same binary and protocol.

## Method 1: Install Local Runner (Recommended for Testing)

Local runners are ideal for development, testing, and small-scale deployments.

### Step 1: Install the Runner

From your KainBain repository root:

```bash
scripts/install-local-runner.sh --id local-<hostname>
```

This script:
- Creates a systemd service file (if on Linux)
- Installs the runner binary
- Sets up appropriate permissions

**Options:**
- `--id <name>`: Required. Unique identifier for this runner (e.g., `local-pi`, `local-workstation`)
- `--backend <url>`: Backend URL (defaults to `http://localhost:3100`)
- `--harness <name>`: Harness type (pi, muse, antigravity, mock) - defaults to `mock`
- `--manual`: Skip auto-start, useful for manual configuration

Example:

```bash
scripts/install-local-runner.sh --id local-pi --backend http://kainbain.home --harness pi
```

### Step 2: Get Runner Credentials

1. Navigate to **Settings › Harness › Runners** in the KainBain UI
2. You'll see a pending runner with your specified ID
3. Click **Approve** to add the runner to your fleet
4. Copy the **one-time credential** shown in the UI (you have 5 minutes to use it)

### Step 3: Configure the Runner

The runner configuration is environment-based. Create a systemd service file or use a shell script:

**For systemd (Linux):**

```ini
# /etc/systemd/system/kainbain-runner.service
[Unit]
Description=KainBain Runner
After=network.target

[Service]
Type=simple
User=%i
WorkingDirectory=/home/%i/kainbain-runner
Environment="KAINBAIN_RUNNER_BACKEND=http://kainbain.home:3100"
Environment="KAINBAIN_RUNNER_JOIN_TOKEN=<your-join-token>"
Environment="KAINBAIN_RUNNER_ID=local-pi"
Environment="KAINBAIN_RUNNER_HARNESS=pi"
Environment="KAINBAIN_RUNNER_MODELS=anthropic/claude-3-5-sonnet,openai/gpt-4o"
Environment="KAINBAIN_RUNNER_DISPATCH=1"
ExecStart=/usr/local/bin/kainbain-runner
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**For manual run:**

```bash
KAINBAIN_RUNNER_BACKEND=http://kainbain.home:3100 \
KAINBAIN_RUNNER_JOIN_TOKEN=<your-join-token> \
KAINBAIN_RUNNER_ID=local-pi \
KAINBAIN_RUNNER_HARNESS=pi \
KAINBAIN_RUNNER_MODELS=anthropic/claude-3-5-sonnet,openai/gpt-4o \
KAINBAIN_RUNNER_DISPATCH=1 \
node /path/to/runner/main.js
```

### Step 4: Start the Runner

**For systemd:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable kainbain-runner
sudo systemctl start kainbain-runner
```

**For manual run:**

```bash
node runner/main.js
```

### Step 5: Verify the Runner

Check the runner status in the UI at **Settings › Harness › Runners**

Or via API:

```bash
curl -X GET http://localhost:3100/runners
```

Expected response:

```json
{
  "runners": [
    {
      "id": "local-pi",
      "status": "active",
      "harness": "pi",
      "models": ["anthropic/claude-3-5-sonnet", "openai/gpt-4o"],
      "capacity": "unlimited",
      "lastHeartbeat": "2026-11-04T21:35:00Z"
    }
  ]
}
```

## Method 2: Install Remote Runner (Recommended for Production)

Remote runners are ideal for:
- Distributed workloads across multiple machines
- GPU-accelerated workloads
- Geographic distribution
- Load balancing

### Step 1: Prepare the Remote Machine

On the target machine:

```bash
# Install Node.js (v20.11+)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Git
git --version || sudo apt-get install -y git

# Clone the KainBain repository (or copy the runner binary)
git clone https://github.com/Ewrdad/KainBain.git
cd KainBain
```

### Step 2: Install Runner Binary

Option A: Install from repository

```bash
npm install -g .
```

Option B: Copy binary manually

```bash
# Copy the runner directory to the remote machine
scp -r runner/ user@remote-host:/opt/kainbain-runner/
```

### Step 3: Get Runner Credentials

1. In the KainBain UI, go to **Settings › Harness › Runners**
2. Note the pending runner entry for your remote host
3. Click **Approve** and copy the one-time credential

### Step 4: Configure Remote Runner

Create a configuration file or use environment variables:

**/opt/kainbain-runner/.env:**

```ini
KAINBAIN_RUNNER_BACKEND=https://kainbain.yourdomain.com:3100
KAINBAIN_RUNNER_JOIN_TOKEN=<your-join-token>
KAINBAIN_RUNNER_ID=gpu-server-1
KAINBAIN_RUNNER_HARNESS=pi
KAINBAIN_RUNNER_MODELS=anthropic/claude-3-5-sonnet,openai/gpt-4o,meta/llama-3-70b
KAINBAIN_RUNNER_DISPATCH=1
KAINBAIN_RUNNER_WORK_ROOT=/var/lib/kainbain/runner-work
```

### Step 5: Create Systemd Service (Linux)

```ini
# /etc/systemd/system/kainbain-remote-runner.service
[Unit]
Description=KainBain Remote Runner
After=network.target

[Service]
Type=simple
User=kainbain
WorkingDirectory=/opt/kainbain-runner
EnvironmentFile=/opt/kainbain-runner/.env
ExecStart=/usr/bin/node /opt/kainbain-runner/main.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Step 6: Start the Remote Runner

```bash
sudo systemctl daemon-reload
sudo systemctl enable kainbain-remote-runner
sudo systemctl start kainbain-remote-runner
```

### Step 7: Verify Remote Runner

Check the UI or API to confirm the runner is active and can serve models.

## Runner Configuration Reference

### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `KAINBAIN_RUNNER_BACKEND` | Yes | Backend API URL | None |
| `KAINBAIN_RUNNER_JOIN_TOKEN` | Yes | Runner join token from UI | None |
| `KAINBAIN_RUNNER_ID` | Yes | Unique runner identifier | None |
| `KAINBAIN_RUNNER_HARNESS` | Yes | Harness type (pi, muse, antigravity, mock) | mock |
| `KAINBAIN_RUNNER_MODELS` | No | CSV of models this runner can serve | All discovered models |
| `KAINBAIN_RUNNER_DISPATCH` | No | Enable dispatch mode (auto-claim tasks) | 0 (disabled) |
| `KAINBAIN_RUNNER_PROJECTS` | No | Comma-separated project ID allowlist | All projects |
| `KAINBAIN_RUNNER_WORK_ROOT` | No | Working directory for runner files | /tmp/kainbain-runner |
| `KAINBAIN_RUNNER_DISPATCH_POLL_MS` | No | Poll interval for dispatch mode | 5000 |
| `KAINBAIN_RUNNER_DISPATCH_IDLE_LIMIT` | No | Idle limit before exiting | 3 |

### Runner Status Values

- **pending**: Runner registered but not yet approved
- **active**: Runner approved and operational
- **heartbeat_stale**: Runner hasn't checked in recently
- **revoked**: Runner was manually revoked
- **error**: Runner encountered a fatal error

### Capacity Management

Runners advertise their capacity through:

1. **Harness support**: Which harness types are installed
2. **Model support**: Which models are available (via discovery or manual config)
3. **Disk space**: Available disk headroom
4. **CPU/RAM**: System resources (reported in heartbeat)

## Troubleshooting

### Runner Won't Register

**Symptoms:** Runner shows as "pending" indefinitely

**Solutions:**

1. Verify backend is reachable:
   ```bash
   curl -v http://localhost:3100/status
   ```

2. Check join token is correct:
   - Regenerate token in UI if needed
   - Ensure no special characters are being escaped

3. Verify network connectivity:
   ```bash
   ping kainbain.yourdomain.com
   telnet kainbain.yourdomain.com 3100
   ```

### Runner Approved but Not Active

**Symptoms:** Runner shows "pending" after approval

**Solutions:**

1. Check runner logs:
   ```bash
   journalctl -u kainbain-runner -n 100 --no-pager
   ```

2. Verify credential was used correctly:
   - The credential is a one-time use token
   - Must be set in `KAINBAIN_RUNNER_CREDENTIAL` environment variable

3. Check backend logs:
   ```bash
   cd api && PORT=3100 node index.js
   ```

### Runner Heartbeat Stale

**Symptoms:** Runner shows "heartbeat_stale" status

**Solutions:**

1. Check runner process is running:
   ```bash
   ps aux | grep runner
   ```

2. Verify network connectivity between runner and backend

3. Check for resource exhaustion on runner machine

4. Increase heartbeat interval if needed (adjust `KAINBAIN_RUNNER_HEARTBEAT_MS`)

### Model Not Available

**Symptoms:** Runner doesn't advertise expected models

**Solutions:**

1. For manual model configuration:
   ```bash
   export KAINBAIN_RUNNER_MODELS="anthropic/claude-3-5-sonnet"
   ```

2. For harness-based discovery (muse harness):
   - Ensure harness CLI is installed and logged in
   - Verify model is available in the harness

3. Check runner logs for discovery errors

## Best Practices

### Runner Naming

Use descriptive names that indicate:
- Location: `us-east-gpu-1`, `eu-west-workstation`
- Purpose: `code-review-runner`, `heavy-llm-runner`
- Harness: `pi-runner-1`, `muse-runner-gpu`

### Capacity Planning

- Match runner capacity to workload needs
- GPU runners for LLM tasks
- CPU runners for code analysis and orchestration
- Distribute runners geographically for latency-sensitive tasks

### Security

- Use HTTPS for all remote runner connections
- Store join tokens securely (use secret management tools)
- Rotate join tokens periodically
- Restrict network access to backend API port

### Monitoring

Set up monitoring for:
- Runner heartbeat frequency
- Task completion rates
- Model serving availability
- Resource utilization

## Advanced: Runner Auto-Discovery

Runners can automatically discover available models based on harness capabilities:

```bash
# For muse harness (auto-discovers installed models)
export KAINBAIN_RUNNER_HARNESS=muse
export KAINBAIN_RUNNER_DISPATCH=1

# For pi harness (uses LiteLLM, models configured in LiteLLM)
export KAINBAIN_RUNNER_HARNESS=pi
export KAINBAIN_RUNNER_MODELS=anthropic/claude-3-5-sonnet,openai/gpt-4o
```

## Cleanup

To remove a runner:

1. Revoke it in the UI (**Settings › Harness › Runners**)
2. Stop the service:
   ```bash
   sudo systemctl stop kainbain-runner
   sudo systemctl disable kainbain-runner
   ```
3. Remove service file:
   ```bash
   sudo rm /etc/systemd/system/kainbain-runner.service
   sudo systemctl daemon-reload
   ```
4. Delete runner files (optional)

---

**See Also:**
- [#/docs/first-time-setup](/docs/first-time-setup) - Initial setup guide
- [#/docs/ports-env](/docs/ports-env) - Port and environment configuration
- [#/docs/harness-pi](/docs/harness-pi) - PI Harness configuration
- [#/docs/harness-muse](/docs/harness-muse) - Muse Harness configuration
