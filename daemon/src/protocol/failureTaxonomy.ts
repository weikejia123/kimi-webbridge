/**
 * Kimi WebBridge v2.0 — Failure Taxonomy
 *
 * Classifies bridge failures into categories and suggests recovery strategies.
 */

import type { BridgeError } from "../shared/protocol.js";

export function classifyFailure(error: BridgeError): {
  category: "transient" | "permanent" | "user" | "system";
  retryable: boolean;
  suggestedTools: string[];
  explanation: string;
} {
  const code = error.code;

  switch (code) {
    case "ELEMENT_NOT_FOUND":
    case "STALE_ELEMENT":
      return {
        category: "transient",
        retryable: true,
        suggestedTools: ["find_element", "get_page_state", "recover"],
        explanation:
          "The element was not found or became stale. The DOM may have changed. Try locating the element again.",
      };

    case "ELEMENT_NOT_VISIBLE":
    case "ELEMENT_COVERED":
      return {
        category: "transient",
        retryable: true,
        suggestedTools: ["wait_for", "highlight", "click_ref"],
        explanation:
          "The element exists but is not visible or is covered by another element. Waiting or scrolling may help.",
      };

    case "ELEMENT_DISABLED":
      return {
        category: "user",
        retryable: false,
        suggestedTools: ["get_page_state", "describe_element"],
        explanation:
          "The element is disabled and cannot be interacted with until the user or page enables it.",
      };

    case "NAVIGATION_TIMEOUT":
    case "DOM_STABLE_TIMEOUT":
      return {
        category: "transient",
        retryable: true,
        suggestedTools: ["wait_for", "recover"],
        explanation:
          "The operation timed out. The page may still be loading or processing.",
      };

    case "EVALUATION_ERROR":
      return {
        category: "system",
        retryable: false,
        suggestedTools: ["evaluate_v2", "recover"],
        explanation:
          "A script evaluation error occurred. The code may contain syntax errors or access restricted APIs.",
      };

    case "PERMISSION_DENIED":
      return {
        category: "permanent",
        retryable: false,
        suggestedTools: ["get_bridge_status"],
        explanation:
          "The operation was denied due to permissions. Check browser or extension permissions.",
      };

    case "NO_FORM_FOUND":
      return {
        category: "transient",
        retryable: true,
        suggestedTools: ["press_key", "snapshot_v2", "list_actions"],
        explanation:
          "No form was found for the current element. The element may not be inside a form or the form may be dynamic.",
      };

    case "SNAPSHOT_TOO_LARGE":
      return {
        category: "transient",
        retryable: true,
        suggestedTools: ["snapshot", "get_page_state", "extract_text"],
        explanation:
          "The page snapshot was too large. Try a more focused query or chunked extraction.",
      };

    case "USER_INTERVENTION_REQUIRED":
      return {
        category: "user",
        retryable: false,
        suggestedTools: ["get_page_state", "describe_element"],
        explanation:
          "User intervention is required to proceed with this action.",
      };

    case "UNKNOWN_ERROR":
    default:
      return {
        category: "permanent",
        retryable: false,
        suggestedTools: ["get_bridge_status", "recover"],
        explanation:
          "An unexpected error occurred. Check bridge status and try recovery.",
      };
  }
}
