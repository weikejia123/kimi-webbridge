/**
 * Kimi WebBridge v2.0 — get_full_text Tool Handler
 *
 * Convenience API that drains all text chunks internally.
 */

import { z } from "zod";
import type { BridgeResponse, FullTextResult, TextExtractionResult } from "../shared/protocol.js";
import { createResponse, createErrorResponse } from "../protocol/v2.js";
import { errorFactory } from "../protocol/errors.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";

const ScopeSchema = z.union([
  z.enum(["document", "viewport"]),
  z.object({ ref: z.string().optional(), selector: z.string().optional() }),
]);

const GetFullTextArgsSchema = z.object({
  scope: ScopeSchema.optional().default("document"),
  visibleOnly: z.boolean().optional().default(true),
  format: z.enum(["plain", "markdown"]).optional().default("plain"),
  maxChars: z.number().min(100).max(500000).optional().default(100000),
});

export async function handleGetFullText(args: unknown, ctx: ToolContext): Promise<BridgeResponse> {
  const parsed = GetFullTextArgsSchema.safeParse(args);
  if (!parsed.success) {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument(parsed.error.message));
  }

  const { scope, visibleOnly, format, maxChars } = parsed.data;
  const start = Date.now();

  let accumulatedText = "";
  let truncated = false;
  let cursor: string | undefined;

  const baseArgs = {
    scope,
    visibleOnly,
    format,
    includeInputs: true,
    includeButtons: false,
    includeLinks: true,
    chunkSize: 8000,
  };

  do {
    const requestArgs = cursor ? { ...baseArgs, cursor } : baseArgs;

    const response = await extensionRouter.sendCommand(
      ctx.tabId,
      ctx.frameId,
      "extract_text",
      requestArgs,
      ctx.timeoutMs ?? 30000,
      ctx.command.id,
    );

    if (!response.ok || response.result === null) {
      return { ...response, id: ctx.command.id, tool: ctx.command.tool };
    }

    const result = response.result as TextExtractionResult;

    if (result.text) {
      accumulatedText += result.text;
    }

    truncated = result.truncated;
    cursor = result.nextCursor;

    if (accumulatedText.length >= maxChars) {
      accumulatedText = accumulatedText.slice(0, maxChars);
      truncated = true;
      break;
    }
  } while (truncated && cursor);

  const finalResult: FullTextResult = {
    text: accumulatedText,
    chars: accumulatedText.length,
    truncated,
  };

  return createResponse(ctx.command, finalResult, {
    durationMs: Date.now() - start,
  });
}
