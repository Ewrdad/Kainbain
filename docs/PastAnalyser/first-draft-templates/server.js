#!/usr/bin/env node
/**
 * Simple Node HTTP Server for Past Analyser UI Prototypes
 * Zero external dependencies.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const DEFAULT_PORT = parseInt(process.env.PORT || "3344", 10);
const BASE_DIR = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  if (pathname === "/" || pathname === "") {
    pathname = "/index.html";
  }

  // Prevent directory traversal
  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, "");
  let filePath = path.join(BASE_DIR, safePath);

  // If directory requested, look for index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`
        <div style="font-family:sans-serif; padding:40px; text-align:center; background:#0b0f17; color:#fff; min-height:100vh;">
          <h1 style="color:#f43f5e;">404 Not Found</h1>
          <p style="color:#94a3b8;">The requested path <code>${pathname}</code> was not found.</p>
          <a href="/index.html" style="color:#38bdf8; text-decoration:none; font-weight:bold;">← Return to Past Analyser Hub</a>
        </div>
      `);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache"
    });
    res.end(data);
  });
});

function startServer(port) {
  server.listen(port, "0.0.0.0", () => {
    console.log("\n=======================================================");
    console.log("⚡ Past Analyser UI Prototypes Host Server Running");
    console.log("=======================================================");
    console.log(`\n  🏠 Main Hub:        http://localhost:${port}/index.html`);
    console.log(`  📊 1. Ops Cockpit:  http://localhost:${port}/designs/1-ops-cockpit/index.html`);
    console.log(`  🌐 2. Graph Canvas: http://localhost:${port}/designs/2-workflow-graph/index.html`);
    console.log(`  🛠️  3. DevTools:    http://localhost:${port}/designs/3-devtools-studio/index.html`);
    console.log(`  ✨ 4. Copilot Feed: http://localhost:${port}/designs/4-copilot-feed/index.html`);
    console.log(`  📈 5. Pivot Matrix: http://localhost:${port}/designs/5-pivot-matrix/index.html`);
    console.log("\nPress Ctrl+C to stop the server.\n");
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`Port ${port} in use, trying port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error("Server error:", err);
    }
  });
}

startServer(DEFAULT_PORT);
