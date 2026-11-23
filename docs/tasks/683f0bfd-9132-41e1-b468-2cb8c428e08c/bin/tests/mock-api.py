#!/usr/bin/env python3
"""mock-api.py — a tiny local stand-in for the KainBain backend API, used ONLY
by bin/tests/run-tests.sh so the ops scripts can be integration-tested without
touching prod.

Routes:
  GET /tasks?projectId=...   -> [{"id": <name>}, ...] for every <name>.json in
                                --tasks-dir ([] when MOCK_EMPTY=1)
  GET /tasks/<id>?projectId=... -> the contents of <id>.json (200);
                                500 when <id> is in MOCK_FAIL_IDS;
                                200 + invalid JSON when <id> == MOCK_BADJSON_ID
  GET /runners               -> contents of --runners-file (200)
  GET /deploy/status         -> contents of --deploy-file (200)

--port 0 picks a free port and writes it to --port-file once listening.
"""
import argparse
import json
import os
import pathlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tasks-dir", required=True)
    parser.add_argument("--runners-file")
    parser.add_argument("--deploy-file")
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--port-file", required=True)
    args = parser.parse_args()

    tasks_dir = pathlib.Path(args.tasks_dir)
    fail_ids = set(filter(None, os.environ.get("MOCK_FAIL_IDS", "").split(",")))
    badjson_id = os.environ.get("MOCK_BADJSON_ID", "")
    mock_empty = os.environ.get("MOCK_EMPTY", "") == "1"

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):  # keep test output clean
            pass

        def _send(self, code, body, content_type="application/json"):
            data = body.encode()
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            parsed = urlparse(self.path)
            path = parsed.path.rstrip("/")
            if path == "/tasks":
                if mock_empty:
                    self._send(200, "[]")
                    return
                ids = sorted(p.stem for p in tasks_dir.glob("*.json"))
                self._send(200, json.dumps([{"id": i} for i in ids]))
                return
            if path.startswith("/tasks/"):
                task_id = path[len("/tasks/"):]
                if task_id in fail_ids:
                    self._send(500, json.dumps({"error": "mock failure"}))
                    return
                if task_id == badjson_id:
                    self._send(200, "<html>not json</html>", "text/html")
                    return
                f = tasks_dir / f"{task_id}.json"
                if f.is_file():
                    self._send(200, f.read_text())
                else:
                    self._send(404, json.dumps({"error": "no such task"}))
                return
            if path == "/runners" and args.runners_file:
                self._send(200, pathlib.Path(args.runners_file).read_text())
                return
            if path == "/deploy/status" and args.deploy_file:
                self._send(200, pathlib.Path(args.deploy_file).read_text())
                return
            self._send(404, json.dumps({"error": "not found", "path": path}))

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    pathlib.Path(args.port_file).write_text(str(server.server_address[1]))
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
