/**
 * Kimi WebBridge v2.0 — describe_element Tool Handler
 *
 * Get detailed information about a specific element by ref or selector.
 */

import { z } from "zod";
import type { BridgeResponse } from "../shared/protocol.js";
import { createErrorResponse } from "../protocol/v2.js";
import { errorFactory } from "../protocol/errors.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";

const TargetSchema = z.object({
  ref: z.string().optional(),
  selector: z.string().optional(),
});

const DescribeElementArgsSchema = z.object({
  target: TargetSchema,
  includeHtml: z.boolean().optional().default(false),
  includeNeighbors: z.boolean().optional().default(false),
  includeComputedStyle: z.boolean().optional().default(false),
});

export async function handleDescribeElement(args: unknown, ctx: ToolContext): Promise<BridgeResponse> {
  const parsed = DescribeElementArgsSchema.safeParse(args);
  if (!parsed.success) {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument(parsed.error.message));
  }

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "describe_element",
    parsed.data,
    ctx.timeoutMs ?? 30000,
    ctx.command.id,
  );

  return { ...response, id: ctx.command.id, tool: ctx.command.tool };
}
