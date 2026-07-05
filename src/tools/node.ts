// Node-client-tier tool handlers. They query the owner face of the single
// configured Sphere Node, render what comes back, and degrade gracefully when the
// node is not configured. They store nothing and call no other URL.

import {
  getPublisherSummary,
  getPaymentStatus,
  getFragmentUsage,
  publishFragment,
  type NodeClientDeps,
  type NodeCallResult,
} from "../node/client";
import { loadFragment } from "../core/fragmentIo";
import { validateManifest } from "../core/validate";
import { analyzeReadiness } from "../core/readiness";
import type { ToolText } from "./local";

function render(result: NodeCallResult, heading: string): ToolText {
  if (result.kind === "unconfigured") {
    // Graceful degradation: explain, do not error.
    return { text: result.message };
  }
  if (result.kind === "error") {
    return { text: result.message, isError: true };
  }
  const json = JSON.stringify(result.data, null, 2);
  return { text: `${heading}\n\n\`\`\`json\n${json}\n\`\`\`` };
}

export async function publisherSummaryTool(deps: NodeClientDeps): Promise<ToolText> {
  return render(await getPublisherSummary(deps), "Publisher summary from your Sphere Node:");
}

export async function paymentStatusTool(deps: NodeClientDeps): Promise<ToolText> {
  return render(await getPaymentStatus(deps), "Payment status from your Sphere Node:");
}

export async function fragmentUsageTool(deps: NodeClientDeps, fragmentId: string): Promise<ToolText> {
  return render(await getFragmentUsage(deps, fragmentId), `Usage for fragment ${fragmentId}:`);
}

/** Format the readiness score plus any advisory findings as trailing lines. */
function readinessAdvisory(manifest: Parameters<typeof analyzeReadiness>[0], content: string | null): string[] {
  const readiness = analyzeReadiness(manifest, content);
  const lines = ["", `Readiness score ${readiness.score}/100.`];
  if (readiness.findings.length > 0) {
    lines.push("Published, with these advisory gaps to consider later:");
    for (const f of readiness.findings) lines.push(`- [${f.severity}] ${f.message}`);
  }
  return lines;
}

/**
 * Guided publish: load -> HARD-GATE validate -> advisory readiness -> publish.
 *
 * The validation gate is what makes this tool guiding rather than blind: a
 * structurally invalid fragment is refused locally and the node is never called.
 * Readiness is advisory only and never blocks (same semantics as the readiness
 * tool). Only content.md + manifest are sent; media is out of scope for now.
 */
export async function publishFragmentTool(deps: NodeClientDeps, path: string): Promise<ToolText> {
  const loaded = await loadFragment(path);
  if (!loaded.manifest) {
    return { text: `Could not publish: ${loaded.error ?? "fragment not loaded."}`, isError: true };
  }

  // HARD GATE: never push a structurally broken fragment to the node.
  const validation = validateManifest(loaded.manifest);
  if (!validation.ok) {
    const lines = [
      "Refusing to publish: the fragment is structurally invalid. Fix these before publishing:",
      ...validation.errors.map((e) => `- ${e}`),
    ];
    return { text: lines.join("\n"), isError: true };
  }

  const result = await publishFragment(deps, {
    id: loaded.manifest.id,
    manifest: loaded.manifest,
    content: loaded.content,
  });

  if (result.kind === "unconfigured") {
    return { text: result.message };
  }
  if (result.kind === "error") {
    return { text: result.message, isError: true };
  }

  const data = result.data as { canonical?: unknown; id?: unknown; mediaCount?: unknown };
  const canonical = typeof data.canonical === "string" ? data.canonical : null;
  const idText = typeof data.id === "string" ? data.id : loaded.manifest.id;
  const head = canonical
    ? `Published ${idText} to your Sphere Node.\nCanonical URL: ${canonical}`
    : `Published ${idText} to your Sphere Node.`;

  return { text: [head, ...readinessAdvisory(loaded.manifest, loaded.content)].join("\n") };
}
