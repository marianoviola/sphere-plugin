// Combine validation and readiness into one readable Markdown report for a single
// fragment or a set of fragments. The report always contains an explicit, empty
// "Rights and risk" placeholder that states risk analysis is not part of v1. That
// section is the clean seam where a future rights/risk capability would plug in.

import { basename } from "node:path";
import type { LoadedFragment } from "./fragmentIo";
import { validateManifest, type ValidationResult } from "./validate";
import { analyzeReadiness, type ReadinessResult } from "./readiness";

export interface FragmentReport {
  label: string;
  validation: ValidationResult;
  readiness: ReadinessResult | null;
}

export const RIGHTS_AND_RISK_TITLE = "Rights and risk";
export const RIGHTS_AND_RISK_BODY =
  "Not part of v1. Rights and risk analysis is intentionally out of scope for this " +
  "version. This section is a placeholder for a future capability; it performs no " +
  "analysis today and makes no claims about the legal status of this content.";

export function buildFragmentReport(loaded: LoadedFragment): FragmentReport {
  const label = loaded.manifest?.id ?? basename(loaded.dir);

  if (!loaded.manifest) {
    return {
      label,
      validation: { ok: false, errors: [loaded.error ?? "Fragment could not be loaded."] },
      readiness: null,
    };
  }

  return {
    label,
    validation: validateManifest(loaded.manifest),
    readiness: analyzeReadiness(loaded.manifest, loaded.content),
  };
}

function renderOne(report: FragmentReport): string {
  const lines: string[] = [];
  lines.push(`## ${report.label}`);
  lines.push("");

  lines.push(`### Validation`);
  if (report.validation.ok) {
    lines.push("PASS - the fragment is structurally valid.");
  } else {
    lines.push("FAIL - structural errors:");
    for (const err of report.validation.errors) lines.push(`- ${err}`);
  }
  lines.push("");

  lines.push(`### Readiness`);
  if (!report.readiness) {
    lines.push("Not analyzed (the manifest could not be loaded).");
  } else if (report.readiness.findings.length === 0) {
    lines.push(`Score ${report.readiness.score}/100. No advisory gaps found.`);
  } else {
    lines.push(`Score ${report.readiness.score}/100. Advisory gaps:`);
    for (const f of report.readiness.findings) {
      lines.push(`- [${f.severity}] ${f.message}`);
      lines.push(`  Suggestion: ${f.suggestion}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

/** Render a full report for one or more fragments, with a single Rights and risk slot. */
export function renderReport(loaded: LoadedFragment[], title: string): string {
  const reports = loaded.map(buildFragmentReport);
  const out: string[] = [];

  out.push(`# Fragment report: ${title}`);
  out.push("");

  if (reports.length === 0) {
    out.push("No fragments were found at the given path.");
    out.push("");
  } else if (reports.length > 1) {
    const passed = reports.filter((r) => r.validation.ok).length;
    out.push(`${reports.length} fragments, ${passed} valid, ${reports.length - passed} with errors.`);
    out.push("");
  }

  for (const report of reports) out.push(renderOne(report));

  out.push(`## ${RIGHTS_AND_RISK_TITLE}`);
  out.push("");
  out.push(RIGHTS_AND_RISK_BODY);
  out.push("");
  return out.join("\n");
}
