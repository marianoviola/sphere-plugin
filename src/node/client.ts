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

/** Reused wording so reads and writes report a rejected token identically. */
const TOKEN_REJECTED = "The Sphere Node rejected the token (401). Check the Sphere Node Token in settings.";
const NOT_JSON = "The Sphere Node returned a response that was not valid JSON.";

/**
 * Resolve the same-origin owner URL, or a NodeCallResult that the caller should
 * return as-is (unconfigured, or an off-origin refusal). Shared by every owner
 * call so the "only the configured node" guarantee has exactly one implementation.
 */
function resolveOwnerTarget(deps: NodeClientDeps, path: string): URL | NodeCallResult {
  const unconfigured = configMessage(deps.config);
  if (unconfigured) return { kind: "unconfigured", message: unconfigured };
  try {
    return buildOwnerUrl(deps.config.url as string, path);
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

async function callOwner(deps: NodeClientDeps, path: string): Promise<NodeCallResult> {
  const target = resolveOwnerTarget(deps, path);
  if (!(target instanceof URL)) return target;

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
    return { kind: "error", message: TOKEN_REJECTED };
  }
  if (!response.ok) {
    return { kind: "error", message: `The Sphere Node returned HTTP ${response.status}.` };
  }

  try {
    const data = await response.json();
    return { kind: "ok", data };
  } catch {
    return { kind: "error", message: NOT_JSON };
  }
}

/** Parse a JSON response body, or null if it was not valid JSON. */
async function readJson(response: Response): Promise<unknown | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Owner write. A PUT with a JSON body, under the SAME same-origin guard and the
 * SAME token as the reads. Non-2xx statuses are mapped to specific messages so
 * the node's own reason (a 422 validation list, a 400 id mismatch, a 401 token
 * rejection) reaches the user rather than a bare status code.
 */
async function callOwnerWrite(deps: NodeClientDeps, path: string, body: unknown): Promise<NodeCallResult> {
  const target = resolveOwnerTarget(deps, path);
  if (!(target instanceof URL)) return target;

  let response: Response;
  try {
    response = await deps.fetchFn(target.toString(), {
      method: "PUT",
      headers: {
        authorization: `Bearer ${deps.config.token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { kind: "error", message: `Could not reach the Sphere Node: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (response.ok) {
    const data = await readJson(response);
    if (data === null) return { kind: "error", message: NOT_JSON };
    return { kind: "ok", data };
  }

  if (response.status === 401) {
    return { kind: "error", message: TOKEN_REJECTED };
  }

  if (response.status === 422) {
    // The node returns { errors: [...] }; surface the specific reasons.
    const data = await readJson(response);
    const errors = extractErrors(data);
    if (errors.length > 0) {
      return { kind: "error", message: `The node rejected the fragment:\n${errors.map((e) => `- ${e}`).join("\n")}` };
    }
    return { kind: "error", message: "The node rejected the fragment (422), but returned no error details." };
  }

  if (response.status === 400) {
    // Most commonly the manifest id does not match the path id.
    const data = await readJson(response);
    const detail = messageFrom(data);
    return {
      kind: "error",
      message: detail
        ? `The node rejected the request (400): ${detail}`
        : "The node rejected the request (400). The most likely cause is the manifest id not matching the fragment id.",
    };
  }

  return { kind: "error", message: `The Sphere Node returned HTTP ${response.status}.` };
}

/** Pull a string[] out of a `{ errors }` body, tolerating non-string entries. */
function extractErrors(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const errors = (data as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return [];
  return errors.map((e) => (typeof e === "string" ? e : JSON.stringify(e)));
}

/** Pull a human-readable detail out of an `{ error }` body, if present. */
function messageFrom(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const err = (data as { error?: unknown }).error;
  return typeof err === "string" ? err : null;
}

/**
 * Publish (upsert) a prepared fragment to the owner write endpoint.
 * TODO(media): step 1's endpoint accepts an optional `media[]`, but this step
 * publishes content.md + manifest only. Wire media through once the plugin can
 * read media files from the fragment directory.
 */
export function publishFragment(
  deps: NodeClientDeps,
  fragment: { id: string; manifest: unknown; content: string | null },
): Promise<NodeCallResult> {
  const body = { manifest: fragment.manifest, content: fragment.content ?? "" };
  return callOwnerWrite(deps, `/owner/fragments/${encodeURIComponent(fragment.id)}`, body);
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
