/**
 * Kimi WebBridge v2.0 — export_results Tool Handler
 *
 * Exports batch results to CSV or JSON format.
 */

import type { BridgeResponse } from "../shared/protocol.js";
import { createResponse, createErrorResponse } from "../protocol/v2.js";
import { errorFactory } from "../protocol/errors.js";
import type { ToolContext } from "./registry.js";
import type { BatchResult } from "../workflow/batchRunner.js";

function escapeCsvField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n") || field.includes("\r")) {
    return `"${field.replace(/"/g, "\"\"")}"`;
  }
  return field;
}

function batchResultsToCsv(results: BatchResult[]): string {
  const headers = ["rowIndex", "success", "durationMs", "stepId", "stepSuccess", "stepError"];
  const lines: string[] = [headers.join(",")];

  for (const result of results) {
    if (result.stepResults.length === 0) {
      const row = [
        String(result.rowIndex),
        String(result.success),
        String(result.durationMs),
        "",
        "",
        "",
      ];
      lines.push(row.map(escapeCsvField).join(","));
      continue;
    }

    for (const step of result.stepResults) {
      const row = [
        String(result.rowIndex),
        String(result.success),
        String(result.durationMs),
        step.stepId,
        String(step.success),
        step.error ?? "",
      ];
      lines.push(row.map(escapeCsvField).join(","));
    }
  }

  return lines.join("\n");
}

export async function handleExportResults(args: unknown, ctx: ToolContext): Promise<BridgeResponse> {
  const start = Date.now();

  if (typeof args !== "object" || args === null) {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument("args must be an object"));
  }

  const obj = args as Record<string, unknown>;

  if (!Array.isArray(obj.results)) {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument("Missing 'results' array"));
  }

  const results = obj.results as BatchResult[];
  const format = obj.format === "csv" ? "csv" : "json";

  if (format === "csv") {
    return createResponse(
      ctx.command,
      { csv: batchResultsToCsv(results) },
      { durationMs: Date.now() - start },
    );
  }

  return createResponse(
    ctx.command,
    { json: results },
    { durationMs: Date.now() - start },
  );
}
