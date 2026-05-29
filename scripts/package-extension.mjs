#!/usr/bin/env node
/**
 * Package the Chrome extension into a .zip for Web Store upload.
 */

import { spawn } from "node:child_process";
import { access } from "node:fs/promises";

const EXT_DIR = "extension";
const OUT_FILE = "fahds-webbridge-extension.zip";

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const manifestExists = await fileExists(`${EXT_DIR}/manifest.json`);
  const distExists = await fileExists(`${EXT_DIR}/dist`);

  if (!manifestExists) {
    console.error("Error: extension/manifest.json not found. Run npm run build first.");
    process.exit(1);
  }
  if (!distExists) {
    console.error("Error: extension/dist/ not found. Run npm run build first.");
    process.exit(1);
  }

  const proc = spawn("zip", ["-r", "-9", OUT_FILE, "manifest.json", "dist/"], {
    cwd: EXT_DIR,
    stdio: "inherit",
  });

  await new Promise((resolve, reject) => {
    proc.on("close", (code) => {
      if (code === 0) {
        console.log(`\nPackaged extension to ${OUT_FILE}`);
        resolve();
      } else {
        reject(new Error(`zip exited with code ${code}`));
      }
    });
  });
}

main().catch((err) => {
  console.error("Packaging failed:", err.message);
  process.exit(1);
});
