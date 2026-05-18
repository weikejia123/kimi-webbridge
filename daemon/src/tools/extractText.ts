/**
 * Kimi WebBridge v2.0 — extract_text Tool Handler
 *
 * Extracts page text with chunking support.
 */

import { z } from "zod";
import type { BridgeResponse } from "../shared/protocol.js";
import { createErrorResponse } from "../protocol/v2.js";
import { errorFactory } from "../protocol/errors.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";

const ScopeSchema = z.union([
  z.enum(["document", "viewport"]),
  z.object({ ref: z.string().optional(), selector: z.string().optional() }),
]);

const ExtractTextArgsSchema = z.object({
  scope: ScopeSchema.optional().default("document"),
  visibleOnly: z.boolean().optional().default(true),
  includeInputs: z.boolean().optional().default(true),
  includeButtons: z.boolean().optional().default(false),
  includeLinks: z.boolean().optional().default(true),
  format: z.enum(["plain", "markdown", "blocks"]).optional().default("plain"),
  chunkSize: z.number().min(100).max(50000).optional().default(8000),
  cursor: z.string().optional(),
});

export async function handleExtractText(args: unknown, ctx: ToolContext): Promise<BridgeResponse> {
  const parsed = ExtractTextArgsSchema.safeParse(args);
  if (!parsed.success) {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument(parsed.error.message));
  }

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "extract_text",
    parsed.data,
    ctx.timeoutMs ?? 30000,
    ctx.command.id,
  );

  return { ...response, id: ctx.command.id, tool: ctx.command.tool };
}
