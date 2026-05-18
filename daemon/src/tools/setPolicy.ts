/**
 * Kimi WebBridge v2.0 — set_policy Tool Handler
 *
 * Validates policy arguments and routes to the extension.
 */

import type { BridgeResponse } from "../shared/protocol.js";
import { createErrorResponse } from "../protocol/v2.js";
import { errorFactory } from "../protocol/errors.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";
import { z } from "zod";

const SetPolicyArgsSchema = z.object({
  requireApproval: z.boolean().optional(),
  allowedDomains: z.array(z.string()).optional(),
  blockedDomains: z.array(z.string()).optional(),
  maxActionsPerMinute: z.number().min(1).max(10000).optional(),
});

export async function handleSetPolicy(
  args: unknown,
  ctx: ToolContext,
): Promise<BridgeResponse> {
  const start = Date.now();

  const parsed = SetPolicyArgsSchema.safeParse(args);
  if (!parsed.success) {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument(parsed.error.message));
  }

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "set_policy",
    parsed.data,
    ctx.timeoutMs ?? 10000,
    ctx.command.id,
  );

  return {
    ...response,
    id: ctx.command.id,
    tool: ctx.command.tool,
    telemetry: { ...response.telemetry, durationMs: Date.now() - start },
  };
}
