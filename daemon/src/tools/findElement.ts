/**
 * Kimi WebBridge v2.0 — find_element Tool Handler
 *
 * Find elements using multiple strategies: text, role, placeholder,
 * label, testId, selector, nearText, nth, visibleOnly, actionableOnly.
 */

import { z } from "zod";
import type { BridgeResponse } from "../shared/protocol.js";
import { createErrorResponse } from "../protocol/v2.js";
import { errorFactory } from "../protocol/errors.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";
import { tabElementCache } from "../state/tabElementCache.js";

const FindElementArgsSchema = z.object({
  text: z.string().optional(),
  role: z.string().optional(),
  placeholder: z.string().optional(),
  label: z.string().optional(),
  testId: z.string().optional(),
  selector: z.string().optional(),
  nearText: z.string().optional(),
  nth: z.number().min(0).optional(),
  visibleOnly: z.boolean().optional().default(true),
  actionableOnly: z.boolean().optional().default(false),
});

export async function handleFindElement(args: unknown, ctx: ToolContext): Promise<BridgeResponse> {
  const parsed = FindElementArgsSchema.safeParse(args);
  if (!parsed.success) {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument(parsed.error.message));
  }

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "find_element",
    parsed.data,
    ctx.timeoutMs ?? 30000,
    ctx.command.id,
  );

  // Cache returned elements for reliable targeting
  if (response.ok && response.result && typeof response.result === "object") {
    const result = response.result as Record<string, unknown>;
    const elements = result.elements;
    if (Array.isArray(elements)) {
      tabElementCache.set(ctx.tabId, elements as unknown as import("../shared/protocol.js").ElementInfo[]);
    }
  }

  return { ...response, id: ctx.command.id, tool: ctx.command.tool };
}
