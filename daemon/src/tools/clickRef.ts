/**
 * Kimi WebBridge v2.0 — click_ref Tool Handler
 *
 * Click an element by stable reference (ref or selector).
 */

import { z } from "zod";
import type { BridgeResponse } from "../shared/protocol.js";
import { createErrorResponse } from "../protocol/v2.js";
import { errorFactory } from "../protocol/errors.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";
import { tabElementCache } from "../state/tabElementCache.js";

const TargetSchema = z.object({
  ref: z.string().optional(),
  selector: z.string().optional(),
});

const ClickRefArgsSchema = z.object({
  target: TargetSchema,
  button: z.enum(["left", "middle", "right"]).optional().default("left"),
  clickCount: z.number().min(1).max(3).optional().default(1),
  verify: z.object({ type: z.string() }).optional(),
  returnPageState: z.boolean().optional().default(false),
});

export async function handleClickRef(args: unknown, ctx: ToolContext): Promise<BridgeResponse> {
  const parsed = ClickRefArgsSchema.safeParse(args);
  if (!parsed.success) {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument(parsed.error.message));
  }

  // Attempt to enrich target from cache if only ref is provided
  const target = parsed.data.target;
  if (target.ref && !target.selector) {
    const cached = tabElementCache.get(ctx.tabId);
    if (cached) {
      const match = cached.find((el) => el.ref === target.ref);
      if (match?.selector) {
        target.selector = match.selector;
      }
    }
  }

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "click_ref",
    parsed.data,
    ctx.timeoutMs ?? 30000,
    ctx.command.id,
  );

  return { ...response, id: ctx.command.id, tool: ctx.command.tool };
}
