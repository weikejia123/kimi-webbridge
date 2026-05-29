/**
 * Kimi WebBridge v2.0 — select_option Tool Handler
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

const SelectOptionArgsSchema = z.object({
  target: TargetSchema,
  values: z.array(z.string()).optional(),
  labels: z.array(z.string()).optional(),
  indices: z.array(z.number()).optional(),
  clear: z.boolean().optional().default(true),
});

export async function handleSelectOption(args: unknown, ctx: ToolContext): Promise<BridgeResponse> {
  const parsed = SelectOptionArgsSchema.safeParse(args);
  if (!parsed.success) {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument(parsed.error.message));
  }

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "select_option",
    parsed.data,
    ctx.timeoutMs ?? 30000,
    ctx.command.id,
  );

  return { ...response, id: ctx.command.id, tool: ctx.command.tool };
}
