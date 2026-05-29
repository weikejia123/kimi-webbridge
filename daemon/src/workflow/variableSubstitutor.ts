/**
 * Kimi WebBridge v2.0 — Variable Substitutor
 *
 * Replaces {{variable}} placeholders with values, supporting defaults.
 */

const VAR_PATTERN = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\|([^}]*)\}\}/g;
const SIMPLE_VAR_PATTERN = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

export function substituteVariables(text: string, variables: Record<string, string>): string {
  // Replace variables with defaults first: {{name|default}}
  let result = text.replace(VAR_PATTERN, (_match, name: string, defaultValue: string) => {
    return variables[name] ?? defaultValue ?? "";
  });

  // Replace simple variables: {{name}}
  result = result.replace(SIMPLE_VAR_PATTERN, (_match, name: string) => {
    return variables[name] ?? "";
  });

  return result;
}

export function substituteInObject<T>(obj: T, variables: Record<string, string>): T {
  if (typeof obj === "string") {
    return substituteVariables(obj, variables) as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => substituteInObject(item, variables)) as unknown as T;
  }

  if (typeof obj === "object" && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      const value = (obj as Record<string, unknown>)[key];
      result[key] = substituteInObject(value, variables);
    }
    return result as unknown as T;
  }

  return obj;
}
