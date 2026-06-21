// Structural validation of a fragment manifest against the vendored schema.
// Pass/fail plus a flat list of structural errors. Hard errors only; advisory
// gaps live in readiness.ts.

import schema from "../contract/fragment.schema.json";
import { validate as validateAgainstSchema, type JsonSchema } from "./schema";
import type { FragmentManifest } from "../contract/node-api";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * Business rules the structural schema cannot express: gated policies require a
 * payment block and a positive price. Mirrors the node's publish-time checks.
 */
function accessRuleErrors(manifest: FragmentManifest): string[] {
  const errors: string[] = [];
  const access = manifest.access;
  if (!access) return errors; // schema check already reported the missing block
  const { policy, payment, price_per_access } = access;
  if (policy === "paid" || policy === "metered") {
    if (!payment) errors.push(`access.payment is required for policy "${policy}"`);
    if (!(typeof price_per_access === "number" && price_per_access > 0)) {
      errors.push(`access.price_per_access must be a positive number for policy "${policy}"`);
    }
  }
  return errors;
}

export function validateManifest(manifest: unknown): ValidationResult {
  const errors = validateAgainstSchema(manifest, schema as JsonSchema);
  if (errors.length === 0) {
    errors.push(...accessRuleErrors(manifest as FragmentManifest));
  }
  return { ok: errors.length === 0, errors };
}
