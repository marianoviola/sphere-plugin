// Advisory readiness analysis. These are NOT hard errors (validate.ts owns those).
// They are gaps that weaken a fragment for retrieval, attribution, or reuse, each
// with a severity and a one-line suggestion. Operates on the manifest plus the
// optional content.md text. No network.

import type { FragmentManifest } from "../contract/node-api";

export type Severity = "info" | "low" | "medium" | "high";

export interface ReadinessFinding {
  code: string;
  severity: Severity;
  message: string;
  suggestion: string;
}

export interface ReadinessResult {
  /** 0..100, 100 = no advisory gaps found. */
  score: number;
  findings: ReadinessFinding[];
}

const SEVERITY_WEIGHT: Record<Severity, number> = { info: 0, low: 7, medium: 15, high: 25 };

const VAGUE_LICENSE = /^(unknown|tbd|todo|none|n\/?a|all rights reserved)$/i;

function isNonEmptyArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0;
}

function entryHasDescription(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as Record<string, unknown>;
  return Boolean(e.description || e.alt || e.caption || e.transcript);
}

function entryHasSchema(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as Record<string, unknown>;
  return Boolean(e.schema || e.columns || e.fields);
}

/** Count Markdown images with an empty alt text: ![](...) */
function imagesWithEmptyAlt(content: string | null): number {
  if (!content) return 0;
  const matches = content.match(/!\[\s*\]\(/g);
  return matches ? matches.length : 0;
}

export function analyzeReadiness(manifest: FragmentManifest, content: string | null): ReadinessResult {
  const findings: ReadinessFinding[] = [];

  // Sources / provenance.
  if (!isNonEmptyArray(manifest.sources)) {
    findings.push({
      code: "missing_sources",
      severity: "medium",
      message: "No sources are declared.",
      suggestion: "Add at least one entry to sources[] describing where this content came from.",
    });
  }

  // License clarity.
  const license = typeof manifest.license === "string" ? manifest.license.trim() : "";
  if (!license) {
    findings.push({
      code: "missing_license",
      severity: "high",
      message: "License is missing.",
      suggestion: "Set a clear license such as CC-BY so agents know the reuse terms.",
    });
  } else if (VAGUE_LICENSE.test(license)) {
    findings.push({
      code: "unclear_license",
      severity: "medium",
      message: `License "${license}" is unclear.`,
      suggestion: "Replace it with a specific license identifier (for example CC-BY or CC-BY-NC).",
    });
  }

  // Canonical URL.
  if (!manifest.canonical_url || typeof manifest.canonical_url !== "string") {
    findings.push({
      code: "missing_canonical_url",
      severity: "low",
      message: "No canonical_url is set.",
      suggestion: "Add canonical_url pointing at the original public location of this content.",
    });
  }

  // Media without descriptions.
  if (isNonEmptyArray(manifest.media)) {
    const undescribed = manifest.media.filter((m) => !entryHasDescription(m)).length;
    if (undescribed > 0) {
      findings.push({
        code: "media_without_description",
        severity: "medium",
        message: `${undescribed} media item(s) lack a description, alt text, caption, or transcript.`,
        suggestion: "Describe each media file so it is useful for retrieval, not just preserved as evidence.",
      });
    }
  }
  const emptyAlt = imagesWithEmptyAlt(content);
  if (emptyAlt > 0) {
    findings.push({
      code: "image_empty_alt",
      severity: "low",
      message: `${emptyAlt} image(s) in content.md have empty alt text.`,
      suggestion: "Fill in alt text for each image so the content stays readable without the image.",
    });
  }

  // Data without a schema.
  if (isNonEmptyArray(manifest.data)) {
    const unschemaed = manifest.data.filter((d) => !entryHasSchema(d)).length;
    if (unschemaed > 0) {
      findings.push({
        code: "data_without_schema",
        severity: "medium",
        message: `${unschemaed} data file(s) have no schema, columns, or fields described.`,
        suggestion: "Describe each dataset's schema, columns, units, and row count in the manifest or content.md.",
      });
    }
  }

  const penalty = findings.reduce((sum, f) => sum + SEVERITY_WEIGHT[f.severity], 0);
  const score = Math.max(0, 100 - penalty);
  return { score, findings };
}
