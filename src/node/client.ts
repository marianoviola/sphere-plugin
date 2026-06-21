// Read-only client for the Sphere Node owner face. It OWNS and STORES nothing.
//
// Hard rule: it only ever calls the single configured Node URL. The request path
// is always built from a fixed internal template against the configured base, and
// the resolved URL's origin must match the configured base's origin or the call
// is refused. It never accepts a URL from fragment content, tool arguments, or any
// other source. The only caller-supplied value that reaches a path is a fragment
// id, which is validated and percent-encoded before use.

import type { NodeConfig } from "../config";

export type FetchFn = typeof fetch;

export type NodeCallResult =
  | { kind: "unconfigured"; message: string }
  | { kind: "error"; message: string }
  | { kind: "ok"; data: unknown };

export interface NodeClientDeps {
  config: NodeConfig;
  fetchFn: FetchFn;
}

const FRAGMENT_ID_RE = /^[A-Za-z0-9._-]+$/;

export function configMessage(config: NodeConfig): string | null {
  const missing: string[] = [];
  if (!config.url) missing.push("Sphere Node URL");
  if (!config.token) missing.push("Sphere Node Token");
  if (missing.length === 0) return null;
  return (
    `Sphere Node is not configured (${missing.join(" and ")} not set), so this tool ` +
    `cannot reach a node. Set these in the extension settings to use it. The local ` +
    `fragment tools (validate, readiness, report, prepare) work without any configuration.`
  );
}

/**
 * Build the absolute owner URL for a fixed internal path. Throws if the path
 * resolves to a different origin than the configured base. Exported for testing
 * the no-other-URL guarantee.
 */
export function buildOwnerUrl(base: string, path: string): URL {
  const baseUrl = new URL(base);
  const target = new URL(path, baseUrl);
  if (target.origin !== baseUrl.origin) {
    throw new Error("refusing to call a URL outside the configured Sphere Node");
  }
  return target;
}

async function callOwner(deps: NodeClientDeps, path: string): Promise<NodeCallResult> {
  const unconfigured = configMessage(deps.config);
  if (unconfigured) return { kind: "unconfigured", message: unconfigured };

  let target: URL;
  try {
    target = buildOwnerUrl(deps.config.url as string, path);
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : String(e) };
  }

  let response: Response;
  try {
    response = await deps.fetchFn(target.toString(), {
      method: "GET",
      headers: {
        authorization: `Bearer ${deps.config.token}`,
        accept: "application/json",
      },
    });
  } catch (e) {
    return { kind: "error", message: `Could not reach the Sphere Node: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (response.status === 401) {
    return { kind: "error", message: "The Sphere Node rejected the token (401). Check the Sphere Node Token in settings." };
  }
  if (!response.ok) {
    return { kind: "error", message: `The Sphere Node returned HTTP ${response.status}.` };
  }

  try {
    const data = await response.json();
    return { kind: "ok", data };
  } catch {
    return { kind: "error", message: "The Sphere Node returned a response that was not valid JSON." };
  }
}

export function getPublisherSummary(deps: NodeClientDeps): Promise<NodeCallResult> {
  return callOwner(deps, "/owner/summary");
}

export function getPaymentStatus(deps: NodeClientDeps): Promise<NodeCallResult> {
  return callOwner(deps, "/owner/payments");
}

export function getFragmentUsage(deps: NodeClientDeps, fragmentId: string): Promise<NodeCallResult> {
  const id = (fragmentId ?? "").trim();
  if (!FRAGMENT_ID_RE.test(id)) {
    return Promise.resolve({
      kind: "error",
      message: "Invalid fragment id. Use the fragment id only (letters, digits, dot, underscore, hyphen).",
    });
  }
  return callOwner(deps, `/owner/fragments/${encodeURIComponent(id)}/usage`);
}
