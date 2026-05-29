/**
 * Kimi WebBridge v2.0 — CSV Parser
 *
 * Lightweight RFC-4180-ish parser with no external dependencies.
 */

export interface CsvRow {
  rowIndex: number;
  values: Record<string, string>;
}

export interface CsvParseResult {
  headers: string[];
  rows: CsvRow[];
}

function parseLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        fields.push(current);
        current = "";
      } else {
        current += char;
      }
    }
  }

  fields.push(current);
  return fields;
}

export function parseCsv(csvText: string): CsvParseResult {
  const lines = csvText.split(/\r?\n/);
  const headers: string[] = [];
  const rows: CsvRow[] = [];

  let rawRowIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    // Skip empty lines
    if (line.trim().length === 0) {
      continue;
    }

    const fields = parseLine(line);

    if (rawRowIndex === 0) {
      headers.push(...fields);
    } else {
      const values: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        const header = headers[j];
        if (header === undefined) continue;
        values[header] = fields[j] ?? "";
      }
      rows.push({ rowIndex: rawRowIndex, values });
    }

    rawRowIndex++;
  }

  return { headers, rows };
}
