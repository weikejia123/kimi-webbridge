/**
 * Redact sensitive values from page snapshots and logs.
 */

const SENSITIVE_KEY_PATTERNS: Array<{ regex: RegExp; redaction: string }> = [
  { regex: /password/i, redaction: "[REDACTED]" },
  { regex: /passwd/i, redaction: "[REDACTED]" },
  { regex: /pwd/i, redaction: "[REDACTED]" },
  { regex: /token/i, redaction: "[REDACTED]" },
  { regex: /api.?key/i, redaction: "[REDACTED]" },
  { regex: /secret/i, redaction: "[REDACTED]" },
  { regex: /auth/i, redaction: "[REDACTED]" },
  { regex: /credit.?card/i, redaction: "[REDACTED]" },
  { regex: /cvv/i, redaction: "[REDACTED]" },
  { regex: /ssn/i, redaction: "[REDACTED]" },
  { regex: /social/i, redaction: "[REDACTED]" },
  { regex: /otp/i, redaction: "[REDACTED]" },
  { regex: /pin/i, redaction: "[REDACTED]" },
  { regex: /2fa/i, redaction: "[REDACTED]" },
  { regex: /mfa/i, redaction: "[REDACTED]" },
];

export function redactSensitiveValues(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveValues(item));
  }

  const record = obj as Record<string, unknown>;
  const isPasswordElement = record.tag === "input" && record.type === "password";

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const matched = SENSITIVE_KEY_PATTERNS.some((p) => p.regex.test(key));
    const isPasswordValue =
      isPasswordElement && (key === "value" || key === "valuePreview" || key === "text");

    if (matched || isPasswordValue) {
      result[key] = "[REDACTED]";
      continue;
    }

    if (value !== null && typeof value === "object") {
      result[key] = redactSensitiveValues(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}
