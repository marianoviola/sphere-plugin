// Tiny JSON Schema (draft-07 subset) validator. Zero dependencies. Supports
// exactly the keywords used by the vendored fragment.schema.json: type, required,
// properties, enum, pattern, minLength, minimum, items, additionalProperties
// (boolean). This is validation LOGIC, not the contract: the contract is the
// vendored fragment.schema.json. It is reimplemented here (not ported from the
// old Python) so the plugin needs no schema-validation dependency.

export interface JsonSchema {
  type?: string;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: unknown[];
  pattern?: string;
  minLength?: number;
  minimum?: number;
  additionalProperties?: boolean;
  [key: string]: unknown;
}

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function matchesType(value: unknown, type: string): boolean {
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "number") return typeof value === "number";
  if (type === "array") return Array.isArray(value);
  if (type === "object") return typeof value === "object" && value !== null && !Array.isArray(value);
  if (type === "null") return value === null;
  return typeOf(value) === type;
}

/** Validate `value` against `schema`. Returns human-readable errors (empty = valid). */
export function validate(value: unknown, schema: JsonSchema, path = "$"): string[] {
  const errors: string[] = [];

  if (schema.type && !matchesType(value, schema.type)) {
    errors.push(`${path}: expected type ${schema.type}, got ${typeOf(value)}`);
    return errors;
  }

  if (schema.enum && !schema.enum.some((e) => e === value)) {
    errors.push(`${path}: value must be one of ${JSON.stringify(schema.enum)}`);
  }

  if (typeof value === "string") {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: string does not match pattern ${schema.pattern}`);
    }
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${path}: string shorter than minLength ${schema.minLength}`);
    }
  }

  if (typeof value === "number" && typeof schema.minimum === "number" && value < schema.minimum) {
    errors.push(`${path}: number below minimum ${schema.minimum}`);
  }

  if (matchesType(value, "object")) {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in obj)) errors.push(`${path}: missing required property "${key}"`);
    }
    if (schema.properties) {
      for (const [key, sub] of Object.entries(schema.properties)) {
        if (key in obj) errors.push(...validate(obj[key], sub, `${path}.${key}`));
      }
    }
    if (schema.additionalProperties === false && schema.properties) {
      const allowed = new Set(Object.keys(schema.properties));
      for (const key of Object.keys(obj)) {
        if (!allowed.has(key)) errors.push(`${path}: additional property "${key}" is not allowed`);
      }
    }
  }

  if (Array.isArray(value) && schema.items) {
    value.forEach((item, i) => errors.push(...validate(item, schema.items as JsonSchema, `${path}[${i}]`)));
  }

  return errors;
}
