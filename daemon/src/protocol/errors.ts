/**
 * Kimi WebBridge v2.0 — Error Factory
 *
 * Convenience factory for creating domain-specific BridgeError objects.
 */

import { createBridgeError } from "../shared/errors.js";
import type { BridgeError } from "../shared/errors.js";

export const errorFactory = {
  elementNotFound(message = "Element not found"): BridgeError {
    return createBridgeError("ELEMENT_NOT_FOUND", message, {
      recoverable: true,
      suggestedNextTools: ["find_element", "get_page_state", "query_elements"],
    });
  },

  noFormFound(message = "No form found"): BridgeError {
    return createBridgeError("NO_FORM_FOUND", message, {
      recoverable: true,
      suggestedNextTools: ["press_key", "snapshot_v2", "list_actions"],
    });
  },

  staleElement(message = "Element became stale"): BridgeError {
    return createBridgeError("STALE_ELEMENT", message, {
      recoverable: true,
      suggestedNextTools: ["find_element", "get_page_state"],
    });
  },

  elementNotVisible(message = "Element not visible"): BridgeError {
    return createBridgeError("ELEMENT_NOT_VISIBLE", message, {
      recoverable: true,
      suggestedNextTools: ["focus", "wait_for"],
    });
  },

  elementDisabled(message = "Element is disabled"): BridgeError {
    return createBridgeError("ELEMENT_DISABLED", message, {
      recoverable: true,
      suggestedNextTools: ["find_element", "get_page_state"],
    });
  },

  elementCovered(message = "Element is covered by another element"): BridgeError {
    return createBridgeError("ELEMENT_COVERED", message, {
      recoverable: true,
      suggestedNextTools: ["press_key", "find_element"],
    });
  },

  timedOut(message = "Operation timed out"): BridgeError {
    return createBridgeError("NAVIGATION_TIMEOUT", message, {
      recoverable: true,
      suggestedNextTools: ["wait_for", "get_page_state"],
    });
  },

  invalidArgument(message = "Invalid argument"): BridgeError {
    return createBridgeError("INVALID_ARGUMENT", message, {
      recoverable: true,
    });
  },

  permissionDenied(message = "Permission denied"): BridgeError {
    return createBridgeError("PERMISSION_DENIED", message, {
      recoverable: false,
    });
  },

  navigationError(message = "Navigation error"): BridgeError {
    return createBridgeError("NAVIGATION_TIMEOUT", message, {
      recoverable: true,
      suggestedNextTools: ["get_page_state", "wait_for"],
    });
  },

  scriptError(message = "Script error"): BridgeError {
    return createBridgeError("EVALUATION_ERROR", message, {
      recoverable: true,
    });
  },

  securityError(message = "Security error"): BridgeError {
    return createBridgeError("PERMISSION_DENIED", message, {
      recoverable: false,
    });
  },

  unknownError(message = "Unknown error"): BridgeError {
    return createBridgeError("UNKNOWN_ERROR", message, {
      recoverable: true,
    });
  },

  notImplemented(message = "Not implemented"): BridgeError {
    return createBridgeError("UNKNOWN_ERROR", message, {
      recoverable: true,
    });
  },
};
