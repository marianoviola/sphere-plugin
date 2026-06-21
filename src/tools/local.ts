// Local-tier tool handlers. They operate on fragment files on disk, need zero
// configuration, and never touch the network. Each returns rendered text plus an
// isError flag, independent of the MCP transport so they are directly testable.

import { basename } from "node:path";
import { loadFragment, isFragmentDir, listFragmentDirs, type LoadedFragment } from "../core/fragmentIo";
import { validateManifest } from "../core/validate";
import { analyzeReadiness } from "../core/readiness";
import { renderReport } from "../core/report";
import { prepareFragment, type PrepareInput } from "../core/prepare";

export interface ToolText {
  text: string;
  isError?: boolean;
}

export async function validateFragmentTool(path: string): Promise<ToolText> {
  const loaded = await loadFragment(path);
  if (!loaded.manifest) {
    return { text: `FAIL\n- ${loaded.error ?? "Could not load fragment."}`, isError: true };
  }
  const result = validateManifest(loaded.manifest);
  if (result.ok) {
    return { text: `PASS - ${loaded.manifest.id} is structurally valid.` };
  }
  const lines = ["FAIL - structural errors:", ...result.errors.map((e) => `- ${e}`)];
  return { text: lines.join("\n") };
}

export async function analyzeReadinessTool(path: string): Promise<ToolText> {
  const loaded = await loadFragment(path);
  if (!loaded.manifest) {
    return { text: `Could not analyze readiness: ${loaded.error ?? "fragment not loaded."}`, isError: true };
  }
  const result = analyzeReadiness(loaded.manifest, loaded.content);
  const lines = [`Readiness score ${result.score}/100 for ${loaded.manifest.id}.`, ""];
  if (result.findings.length === 0) {
    lines.push("No advisory gaps found.");
  } else {
    lines.push("Advisory gaps (not hard errors):");
    for (const f of result.findings) {
      lines.push(`- [${f.severity}] ${f.message}`);
      lines.push(`  Suggestion: ${f.suggestion}`);
    }
  }
  return { text: lines.join("\n") };
}

export async function generateReportTool(path: string): Promise<ToolText> {
  let loaded: LoadedFragment[];
  let title: string;

  if (basename(path) === "sphere.json" || (await isFragmentDir(path))) {
    loaded = [await loadFragment(path)];
    title = loaded[0]?.manifest?.id ?? basename(path);
  } else {
    const dirs = await listFragmentDirs(path);
    loaded = await Promise.all(dirs.map((d) => loadFragment(d)));
    title = `${basename(path)} (${dirs.length} fragment${dirs.length === 1 ? "" : "s"})`;
  }

  return { text: renderReport(loaded, title) };
}

export async function prepareFragmentTool(input: PrepareInput): Promise<ToolText> {
  const result = await prepareFragment(input);
  const lines = [
    `Wrote fragment ${result.id} to ${result.dir}`,
    ...result.files.map((f) => `- ${f}`),
    "",
  ];
  if (result.validation.ok) {
    lines.push("Validation: PASS - the written fragment is structurally valid.");
  } else {
    lines.push("Validation: FAIL - the written fragment has structural errors:");
    for (const e of result.validation.errors) lines.push(`- ${e}`);
  }
  return { text: lines.join("\n") };
}
