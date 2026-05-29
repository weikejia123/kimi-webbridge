/**
 * Kimi WebBridge v2.0 — PII Redaction
 *
 * Redacts personally identifiable information from strings and screenshots.
 */

const REDACTION_RULES: Array<{ name: string; regex: RegExp; replacement: string }> = [
  { name: "ssn", regex: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[REDACTED-SSN]" },
  { name: "email", regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: "[REDACTED-EMAIL]" },
  { name: "phone", regex: /\b\d{3}[.-]?\d{3}[.-]?\d{4}\b/g, replacement: "[REDACTED-PHONE]" },
  { name: "credit_card", regex: /\b(?:\d{4}[ -]?){3}\d{4}\b/g, replacement: "[REDACTED-CC]" },
]

const PASSWORD_FIELD_REGEX = /"type"\s*:\s*"password"[^}]*"value"\s*:\s*"[^"]*"/g;
const PASSWORD_FIELD_REPLACEMENT = '"type":"password","value":"[REDACTED]"';

/**
 * Redact PII from a plain text string.
 */
export function redactPii(text: string): string {
  let result = text;
  for (const rule of REDACTION_RULES) {
    result = result.replace(rule.regex, rule.replacement);
  }
  return result;
}

/**
 * Redact password field values from JSON-like strings.
 */
export function redactPasswordFields(text: string): string {
  return text.replace(PASSWORD_FIELD_REGEX, PASSWORD_FIELD_REPLACEMENT);
}

/**
 * Redact PII from a base64-encoded screenshot.
 * Currently a stub — returns the original base64 string.
 */
export async function redactPiiFromScreenshot(base64: string): Promise<string> {
  // Future: OCR + image processing to redact PII regions.
  return base64;
}
