#!/usr/bin/env node
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { fork } = require("node:child_process");

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let port = 0; // 0 = let the OS assign a free port
let logFile = null;
let pidFile = null;
let portFile = null;
let showHelp = false;
let hadArgumentError = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--help" || args[i] === "-h") {
    showHelp = true;
  } else if (args[i] === "--port" && args[i + 1]) {
    port = parseInt(args[++i], 10);
  } else if (args[i] === "--logFile" && args[i + 1]) {
    logFile = path.resolve(args[++i]);
  } else if (args[i] === "--pidFile" && args[i + 1]) {
    pidFile = path.resolve(args[++i]);
  } else if (args[i] === "--portFile" && args[i + 1]) {
    portFile = path.resolve(args[++i]);
  } else {
    process.stderr.write(`Error: unknown argument "${args[i]}"\n\n`);
    showHelp = true;
    hadArgumentError = true;
  }
}

function writeHelp(output) {
  output.write(
    "Usage: node http-log-ingest.js --logFile <path> [--port <port>] [--pidFile <path>] [--portFile <path>]\n" +
      "\n" +
      "Start a detached HTTP log ingest server for browser-side debug instrumentation.\n" +
      "\n" +
      "Options:\n" +
      "  --logFile   Path to the log file (required)\n" +
      "  --port      Port to listen on (default: 0 = OS-assigned)\n" +
      "  --pidFile   Path to write the PID file (default: ./debug-ingest.pid)\n" +
      "  --portFile  Path to write the assigned port (default: ./debug-ingest.port)\n" +
      "  --help, -h  Show this help message\n" +
      "\n" +
      "Example:\n" +
      "  node scripts/http-log-ingest.js --logFile ./debug-output.log\n"
  );
}

if (showHelp) {
  writeHelp(hadArgumentError ? process.stderr : process.stdout);
  process.exit(hadArgumentError ? 1 : 0);
}

if (!logFile) {
  process.stderr.write("Error: --logFile is required.\n\n");
  writeHelp(process.stderr);
  process.exit(1);
}

if (!pidFile) {
  pidFile = path.resolve("./debug-ingest.pid");
}
if (!portFile) {
  portFile = path.resolve("./debug-ingest.port");
}

// ---------------------------------------------------------------------------
// Self-daemonize: if not already the child, fork a detached copy and exit.
// This allows the agent to run this script as a normal blocking command —
// it returns in ~1s and the server keeps running in the background.
// ---------------------------------------------------------------------------

if (!process.env.__LOG_INGEST_CHILD) {
  // Clean up stale files from a previous run
  try { fs.unlinkSync(pidFile); } catch {}
  try { fs.unlinkSync(portFile); } catch {}

  const child = fork(__filename, args, {
    env: { ...process.env, __LOG_INGEST_CHILD: "1" },
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  // Wait for the child to write the port file (confirms it's listening)
  const deadline = Date.now() + 5000;
  const poll = setInterval(() => {
    if (fs.existsSync(portFile)) {
      clearInterval(poll);
      const assignedPort = fs.readFileSync(portFile, "utf8").trim();
      process.stdout.write(
        `[log-ingest] Server started (PID ${child.pid}, port ${assignedPort})\n`
      );
      process.exit(0);
    }
    if (Date.now() > deadline) {
      clearInterval(poll);
      process.stderr.write("[log-ingest] Timed out waiting for server to start\n");
      process.exit(1);
    }
  }, 100);

  return; // stop executing the rest of this file in the parent
}

// ---------------------------------------------------------------------------
// Everything below runs only in the detached child process.
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(res, status, body) {
  res.writeHead(status, { ...CORS_HEADERS, "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function appendLines(lines) {
  const data = lines.map((l) => (l.endsWith("\n") ? l : l + "\n")).join("");
  fs.appendFileSync(logFile, data, "utf8");
}

const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  // Health check
  if (req.method === "GET" && req.url === "/health") {
    return jsonResponse(res, 200, { status: "running" });
  }

  // Log ingestion
  if (req.method === "POST" && req.url === "/log") {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      try {
        const payload = JSON.parse(body);
        const lines = [];

        if (typeof payload.message === "string") {
          lines.push(payload.message);
        }
        if (Array.isArray(payload.lines)) {
          for (const line of payload.lines) {
            if (typeof line === "string") lines.push(line);
          }
        }

        if (lines.length === 0) {
          return jsonResponse(res, 400, {
            error: 'Provide "message" (string) and/or "lines" (string[])',
          });
        }

        appendLines(lines);
        return jsonResponse(res, 200, { ok: true, ingested: lines.length });
      } catch {
        return jsonResponse(res, 400, { error: "Invalid JSON" });
      }
    });
    return;
  }

  // Everything else
  jsonResponse(res, 405, { error: "Method not allowed. Use POST /log" });
});

server.listen(port, () => {
  const assignedPort = server.address().port;
  fs.writeFileSync(pidFile, String(process.pid));
  fs.writeFileSync(portFile, String(assignedPort));
});

// Graceful shutdown
function shutdown() {
  try { fs.unlinkSync(pidFile); } catch {}
  try { fs.unlinkSync(portFile); } catch {}
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
