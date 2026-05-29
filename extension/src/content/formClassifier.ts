/**
 * Kimi WebBridge v2.0 — Form Field Classifier
 *
 * Heuristic classification of form input fields based on identifiers,
 * labels, placeholders, and input types.
 */

import type { ElementInfo } from "../shared/protocol.js";

export type FieldType =
  | "name"
  | "first_name"
  | "last_name"
  | "email"
  | "phone"
  | "dob"
  | "ssn"
  | "address"
  | "city"
  | "state"
  | "zip"
  | "unknown";

export interface ClassifiedField {
  element: ElementInfo;
  fieldType: FieldType;
  confidence: number;
  matchReason: string;
}

interface FieldRule {
  fieldType: FieldType;
  patterns: string[];
  inputTypes?: string[];
  confidence: number;
}

const FIELD_RULES: FieldRule[] = [
  {
    fieldType: "first_name",
    patterns: ["first_name", "first-name", "firstname", "fname", "first name", "given-name", "given_name"],
    confidence: 0.95,
  },
  {
    fieldType: "last_name",
    patterns: ["last_name", "last-name", "lastname", "lname", "last name", "surname", "family-name", "family_name"],
    confidence: 0.95,
  },
  {
    fieldType: "name",
    patterns: ["name", "full_name", "full-name", "fullname", "full name"],
    confidence: 0.85,
  },
  {
    fieldType: "email",
    patterns: ["email", "e-mail", "email_address", "email-address", "mail"],
    inputTypes: ["email"],
    confidence: 0.98,
  },
  {
    fieldType: "phone",
    patterns: ["phone", "telephone", "tel", "mobile", "cell", "fax", "phone_number", "phone-number"],
    inputTypes: ["tel"],
    confidence: 0.95,
  },
  {
    fieldType: "dob",
    patterns: ["dob", "birth", "birthdate", "date_of_birth", "date-of-birth", "birth_date", "birth-date", "bday"],
    inputTypes: ["date"],
    confidence: 0.9,
  },
  {
    fieldType: "ssn",
    patterns: ["ssn", "social_security", "social-security", "socialsecurity", "tin", "national_id", "national-id"],
    confidence: 0.95,
  },
  {
    fieldType: "address",
    patterns: ["address", "street", "addr", "address1", "address_1", "address-1", "street_address", "street-address", "line1"],
    confidence: 0.9,
  },
  {
    fieldType: "city",
    patterns: ["city", "town", "municipality"],
    confidence: 0.92,
  },
  {
    fieldType: "state",
    patterns: ["state", "province", "region", "county", "st"],
    confidence: 0.9,
  },
  {
    fieldType: "zip",
    patterns: ["zip", "zipcode", "zip_code", "zip-code", "postal", "postal_code", "postal-code", "postcode"],
    confidence: 0.95,
  },
];

function normalizeText(text: string | undefined | null): string {
  return (text ?? "").toLowerCase().replace(/[\s_\-]+/g, " ").trim();
}

function getFieldTextSignals(el: Element): string[] {
  const signals: string[] = [];

  const id = el.getAttribute("id");
  if (id) signals.push(normalizeText(id));

  const name = el.getAttribute("name");
  if (name) signals.push(normalizeText(name));

  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) signals.push(normalizeText(ariaLabel));

  const placeholder = el.getAttribute("placeholder");
  if (placeholder) signals.push(normalizeText(placeholder));

  const inputType = (el as HTMLInputElement).type;
  if (inputType) signals.push(inputType);

  // Label text via for attribute
  const idVal = el.getAttribute("id");
  if (idVal) {
    const label = document.querySelector(`label[for="${CSS.escape(idVal)}"]`);
    if (label) signals.push(normalizeText(label.textContent));
  }

  // Label text via parent label
  const parentLabel = el.closest("label");
  if (parentLabel && parentLabel !== el) {
    signals.push(normalizeText(parentLabel.textContent));
  }

  // aria-labelledby
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const labelIds = labelledBy.split(/\s+/);
    for (const lid of labelIds) {
      const labelEl = document.getElementById(lid);
      if (labelEl) signals.push(normalizeText(labelEl.textContent));
    }
  }

  return signals;
}

function matchField(el: Element): { fieldType: FieldType; confidence: number; matchReason: string } | null {
  const signals = getFieldTextSignals(el);
  if (signals.length === 0) return null;

  for (const rule of FIELD_RULES) {
    // Check input type match first
    if (rule.inputTypes) {
      const inputType = (el as HTMLInputElement).type;
      if (inputType && rule.inputTypes.includes(inputType)) {
        return { fieldType: rule.fieldType, confidence: rule.confidence, matchReason: `input type="${inputType}"` };
      }
    }

    for (const pattern of rule.patterns) {
      const normalizedPattern = pattern.toLowerCase().replace(/[\s_\-]+/g, " ");
      for (const signal of signals) {
        if (!signal) continue;
        if (signal === normalizedPattern || signal.includes(normalizedPattern)) {
          return {
            fieldType: rule.fieldType,
            confidence: rule.confidence,
            matchReason: `matched pattern "${pattern}" in signal "${signal}"`,
          };
        }
      }
    }
  }

  return null;
}

export function classifyFormFields(elements: ElementInfo[]): ClassifiedField[] {
  const classified: ClassifiedField[] = [];

  for (const info of elements) {
    if (!info.selector) continue;

    let el: Element | null = null;
    try {
      el = document.querySelector(info.selector);
    } catch {
      continue;
    }
    if (!el) continue;

    const tag = el.tagName.toLowerCase();
    if (tag !== "input" && tag !== "textarea" && tag !== "select") continue;

    const match = matchField(el);
    if (match) {
      classified.push({
        element: info,
        fieldType: match.fieldType,
        confidence: match.confidence,
        matchReason: match.matchReason,
      });
    } else {
      // Still return the field as unknown so callers see all inputs
      classified.push({
        element: info,
        fieldType: "unknown",
        confidence: 0,
        matchReason: "no heuristic match",
      });
    }
  }

  return classified;
}
