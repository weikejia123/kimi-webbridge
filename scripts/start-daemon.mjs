#!/usr/bin/env node
/**
 * Convenience wrapper to start the WebBridge daemon.
 */

import { spawn } from "node:child_process";

const proc = spawn("node", ["daemon/dist/server/websocketServer.js"], {
  cwd: process.cwd(),
  stdio: "inherit",
});

proc.on("close", (code) => {
  process.exit(code ?? 0);
});
