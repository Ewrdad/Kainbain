#!/usr/bin/env bash
# server2-ssh.sh <remote command...> — run a command on the server2-alpha host
# (server2@192.168.1.172) using the password file ~/.passwrd WITHOUT ever
# printing, logging, or putting it on a command line (server2-ssh skill rules).
#
# Method: sshpass -f when installed (reads the file directly); otherwise a
# pexpect driver that opens the file inside Python and answers the prompt.
#
# Failure behaviour (this matters: a failed remote probe must not look like a
# success to the caller):
#   - no command given             -> usage on stderr, exit 64
#   - password file missing/empty  -> FATAL on stderr, exit 66 (contents never shown)
#   - neither sshpass nor pexpect + python3 available -> FATAL on stderr, exit 69
#   - password file not mode 600   -> warning on stderr (contents never shown)
#   - connect/auth timeout         -> FATAL on stderr, partial output kept, exit 124
#   - otherwise the REMOTE exit code is propagated (ssh does this natively;
#     the pexpect path reads child.exitstatus/signalstatus)
#
# Read-only usage only in this task (S5 observe-only, survey q9: never
# restart/update/reap anything on the runner hosts from here).
set -euo pipefail

PASSWORD_FILE="$HOME/.passwrd"
SSH_TARGET="server2@192.168.1.172"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)

if [ $# -lt 1 ]; then
  echo "usage: server2-ssh.sh '<remote command>'" >&2
  exit 64
fi
if [ ! -f "$PASSWORD_FILE" ]; then
  echo "FATAL: password file $PASSWORD_FILE not found (expected mode 600, first line = password)" >&2
  exit 66
fi
if [ ! -s "$PASSWORD_FILE" ]; then
  echo "FATAL: password file $PASSWORD_FILE is empty — ssh auth would fail; fix the file, do not retry blindly" >&2
  exit 66
fi
MODE="$(stat -c %a "$PASSWORD_FILE")"
if [ "$MODE" != "600" ]; then
  echo "WARN: $PASSWORD_FILE has mode $MODE, expected 600 — tighten it with: chmod 600 $PASSWORD_FILE" >&2
fi

if command -v sshpass >/dev/null 2>&1; then
  # sshpass consumes the file itself; the password never enters argv or env.
  exec sshpass -f "$PASSWORD_FILE" ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "$@"
fi

# No sshpass: the pexpect fallback needs python3 + the pexpect module. Check
# up front so a bare host fails with one clear line, not a Python traceback.
if ! command -v python3 >/dev/null 2>&1 || ! python3 -c "import pexpect" 2>/dev/null; then
  echo "FATAL: need sshpass or python3 with the pexpect module to reach $SSH_TARGET — install one (e.g. apt install sshpass, or pip install pexpect)" >&2
  exit 69
fi

python3 - "$@" <<'PY'
import pathlib
import sys

import pexpect

password_file = pathlib.Path.home() / ".passwrd"
try:
    password = password_file.read_text().splitlines()[0].strip()
except OSError as exc:
    print(f"FATAL: cannot read {password_file}: {exc}", file=sys.stderr)
    sys.exit(66)
if not password:
    print(f"FATAL: {password_file} is empty", file=sys.stderr)
    sys.exit(66)

remote_cmd = " ".join(sys.argv[1:]) or "echo ok"
child = pexpect.spawn(
    "ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 server2@192.168.1.172 "
    + repr(remote_cmd),
    encoding="utf-8",
    timeout=120,
)
# No logfile is set: nothing pexpect sees (including the prompt exchange) is
# ever written anywhere.
index = child.expect(["[Pp]assword:", pexpect.EOF, pexpect.TIMEOUT])
if index == 0:
    child.sendline(password)
    index = child.expect([pexpect.EOF, pexpect.TIMEOUT])
if index == 2:  # timed out (either before or after the password prompt)
    print(child.before or "", end="")
    print("FATAL: ssh to server2@192.168.1.172 timed out", file=sys.stderr)
    child.close(force=True)
    sys.exit(124)

for line in (child.before or "").splitlines():
    if "Warning: Permanently added" in line:
        continue
    print(line)

child.close(force=True)
if child.exitstatus is not None:
    sys.exit(child.exitstatus)
if child.signalstatus is not None:
    sys.exit(128 + child.signalstatus)
sys.exit(1)
PY
