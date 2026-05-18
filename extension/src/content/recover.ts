/**
 * Kimi WebBridge v2.0 — Recovery Diagnostics
 *
 * Builds a recovery report after a failed action.
 */

import type { RecoveryReport } from "../shared/protocol.js";
import { getPageState } from "./pageState.js";
import { getRecentErrors } from "./browserErrorBuffer.js";

export function recover(args?: { afterError?: string }): RecoveryReport {
  const pageState = getPageState({
    mode: "interactive",
    includePossibleActions: true,
  });

  const possibleActions = pageState.possibleActions;
  const recentErrors = getRecentErrors(5);
  const errMsg = args?.afterError ?? "unknown error";

  const message =
    `Action failed with error: ${errMsg}. ` +
    `Current page has ${possibleActions.length} possible actions. ` +
    `Recent errors: ${recentErrors.length > 0 ? recentErrors.map((e) => e.message).join("; ") : "none"}.`;

  return {
    pageState,
    lastErrors: recentErrors.map((e) => ({
      code: "UNKNOWN_ERROR" as const,
      message: e.message,
      recoverable: true,
    })),
    possibleActions,
    suggestion: message,
  };
}
