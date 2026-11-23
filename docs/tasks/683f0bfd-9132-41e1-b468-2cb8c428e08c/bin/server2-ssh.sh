#!/usr/bin/env bash
# server2-ssh.sh '<remote command>' — run a command on the server2-alpha host
# (192.168.1.172, user server2) using the password file without exposing it
# (pexpect fallback; sshpass is not installed on the local-alpha host).
# Read-only usage only in this task.
set -euo pipefail
python3 - "$@" <<'PY'
import pathlib, sys, pexpect
pwd = pathlib.Path.home().joinpath(".passwrd").read_text().splitlines()[0].strip()
remote_cmd = " ".join(sys.argv[1:]) or "echo ok"
child = pexpect.spawn(
    f"ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 server2@192.168.1.172 {remote_cmd!r}",
    encoding="utf-8", timeout=120,
)
i = child.expect(["[Pp]assword:", pexpect.EOF, pexpect.TIMEOUT])
if i == 0:
    child.sendline(pwd)
    child.expect([pexpect.EOF, pexpect.TIMEOUT])
out = child.before or ""
print("\n".join(l for l in out.splitlines() if "Warning: Permanently added" not in l))
PY
