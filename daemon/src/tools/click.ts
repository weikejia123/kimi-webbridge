/**
 * Kimi WebBridge v2.0 — click Tool Handler (Backward Compatibility)
 *
 * Wraps the new click_ref tool for legacy click({ selector }) calls.
 * Deprecated: use click_ref({ target: { ref | selector } }) instead.
 */

import { z } from "zod";
import type { BridgeResponse } from "../shared/protocol.js";
import { createErrorResponse } from "../protocol/v2.js";
import { errorFactory } from "../protocol/errors.js";
import type { ToolContext } from "./registry.js";
import { extensionRouter } from "../extension/router.js";

const ClickArgsSchema = z.object({
  selector: z.string(),
  button: z.enum(["left", "middle", "right"]).optional().default("left"),
  clickCount: z.number().min(1).max(3).optional().default(1),
});

export async function handleClick(args: unknown, ctx: ToolContext): Promise<BridgeResponse> {
  const parsed = ClickArgsSchema.safeParse(args);
  if (!parsed.success) {
    return createErrorResponse(ctx.command, errorFactory.invalidArgument(parsed.error.message));
  }

  const mappedArgs = {
    target: { selector: parsed.data.selector },
    button: parsed.data.button,
    clickCount: parsed.data.clickCount,
  };

  const response = await extensionRouter.sendCommand(
    ctx.tabId,
    ctx.frameId,
    "click_ref",
    mappedArgs,
    ctx.timeoutMs ?? 30000,
    ctx.command.id,
  );

  const warnings = [
    ...response.warnings,
    {
      code: "DEPRECATED",
      message: "click({ selector }) is deprecated. Use click_ref({ target: { ref | selector } }) instead.",
    },
  ];

  return {
    ...response,
    id: ctx.command.id,
    tool: ctx.command.tool,
    warnings,
  };
}
