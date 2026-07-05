import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { publishFragmentTool } from "../src/tools/node";
import type { FetchFn, NodeClientDeps } from "../src/node/client";

const EXAMPLES = fileURLToPath(new URL("../examples", import.meta.url));
const READY = `${EXAMPLES}/ready-fragment`;
const INVALID = `${EXAMPLES}/invalid-fragment`;

const BASE = "https://node.example.com";
const TOKEN = "test-token";

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

/** A fetch that records the request and replies with a fixed status + JSON body. */
function recordingFetch(records: Recorded[], body: unknown, status = 200): FetchFn {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    const h = init?.headers as Record<string, string> | undefined;
    if (h) for (const [k, v] of Object.entries(h)) headers[k.toLowerCase()] = v;
    records.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : null,
    });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as FetchFn;
}

function configuredDeps(records: Recorded[], body: unknown, status = 200): NodeClientDeps {
  return { config: { url: BASE, token: TOKEN }, fetchFn: recordingFetch(records, body, status) };
}

const okBody = {
  id: "2026-01-15-ready-fragment",
  canonical: "https://node.example.com/fragments/2026-01-15-ready-fragment",
  mediaCount: 0,
  updatedTs: 1_700_000_000_000,
};

describe("publish_fragment: happy path", () => {
  it("PUTs a valid fragment with the bearer token and returns the canonical URL", async () => {
    const records: Recorded[] = [];
    const out = await publishFragmentTool(configuredDeps(records, okBody), READY);

    expect(out.isError).toBeFalsy();
    expect(records).toHaveLength(1);
    const req = records[0]!;
    expect(req.method).toBe("PUT");
    expect(req.url).toBe(`${BASE}/owner/fragments/2026-01-15-ready-fragment`);
    expect(req.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(req.headers["content-type"]).toContain("application/json");

    // Body carries the manifest + content.md.
    const sent = JSON.parse(req.body ?? "{}");
    expect(sent.manifest.id).toBe("2026-01-15-ready-fragment");
    expect(typeof sent.content).toBe("string");
    expect(sent.content.length).toBeGreaterThan(0);

    // Output confirms with the node's canonical URL and includes a readiness score.
    expect(out.text).toContain(okBody.canonical);
    expect(out.text).toMatch(/Readiness score \d+\/100/);
  });
});

describe("publish_fragment: hard validation gate", () => {
  it("refuses a structurally invalid fragment and never calls the node", async () => {
    const records: Recorded[] = [];
    const out = await publishFragmentTool(configuredDeps(records, okBody), INVALID);

    expect(out.isError).toBe(true);
    expect(out.text).toContain("Refusing to publish");
    expect(records).toHaveLength(0); // the node was never dialed
  });

  it("returns a load error for a path with no sphere.json, without calling the node", async () => {
    const records: Recorded[] = [];
    const out = await publishFragmentTool(configuredDeps(records, okBody), `${EXAMPLES}/does-not-exist`);
    expect(out.isError).toBe(true);
    expect(records).toHaveLength(0);
  });
});

describe("publish_fragment: unconfigured", () => {
  it("explains how to configure instead of failing, and never fetches", async () => {
    const deps: NodeClientDeps = {
      config: {},
      fetchFn: (() => {
        throw new Error("fetch must not be called when unconfigured");
      }) as unknown as FetchFn,
    };
    const out = await publishFragmentTool(deps, READY);
    expect(out.isError).toBeFalsy();
    expect(out.text).toContain("not configured");
    expect(out.text.toLowerCase()).toContain("settings");
  });
});

describe("publish_fragment: node rejections", () => {
  it("surfaces the node's 422 validation errors in the output", async () => {
    const records: Recorded[] = [];
    const deps = configuredDeps(
      records,
      { errors: ['access.payment is required for policy "paid"', "some other reason"] },
      422,
    );
    const out = await publishFragmentTool(deps, READY);
    expect(out.isError).toBe(true);
    expect(out.text).toContain("The node rejected the fragment");
    expect(out.text).toContain('access.payment is required for policy "paid"');
    expect(out.text).toContain("some other reason");
  });

  it("surfaces a 401 as a clear token error", async () => {
    const records: Recorded[] = [];
    const out = await publishFragmentTool(configuredDeps(records, { error: "unauthorized" }, 401), READY);
    expect(out.isError).toBe(true);
    expect(out.text).toContain("401");
    expect(out.text.toLowerCase()).toContain("token");
  });

  it("explains a 400 id mismatch", async () => {
    const records: Recorded[] = [];
    const out = await publishFragmentTool(
      configuredDeps(records, { error: "id_mismatch" }, 400),
      READY,
    );
    expect(out.isError).toBe(true);
    expect(out.text).toContain("400");
  });
});

describe("publish_fragment: same-origin guarantee", () => {
  it("only ever dials the configured node origin", async () => {
    const records: Recorded[] = [];
    await publishFragmentTool(configuredDeps(records, okBody), READY);
    const origin = new URL(BASE).origin;
    for (const rec of records) {
      expect(new URL(rec.url).origin).toBe(origin);
    }
  });
});
