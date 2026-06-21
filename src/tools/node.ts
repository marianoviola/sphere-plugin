// Node-client-tier tool handlers. They query the owner face of the single
// configured Sphere Node, render what comes back, and degrade gracefully when the
// node is not configured. They store nothing and call no other URL.

import {
  getPublisherSummary,
  getPaymentStatus,
  getFragmentUsage,
  type NodeClientDeps,
  type NodeCallResult,
} from "../node/client";
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
