import { describe, it, expect } from "vitest";
import { buildOwnerUrl, type FetchFn, type NodeClientDeps } from "../src/node/client";
import { publisherSummaryTool, paymentStatusTool, fragmentUsageTool } from "../src/tools/node";
import { readNodeConfig } from "../src/config";

interface Recorded {
  url: string;
  headers: Record<string, string>;
}

function recordingFetch(records: Recorded[], body: unknown, status = 200): FetchFn {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    const h = init?.headers as Record<string, string> | undefined;
    if (h) for (const [k, v] of Object.entries(h)) headers[k.toLowerCase()] = v;
    records.push({ url: String(url), headers });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as FetchFn;
}

const BASE = "https://node.example.com";
const TOKEN = "test-token";

function configuredDeps(records: Recorded[], body: unknown, status = 200): NodeClientDeps {
  return { config: { url: BASE, token: TOKEN }, fetchFn: recordingFetch(records, body, status) };
}

describe("graceful degradation with no config", () => {
  const empty: NodeClientDeps = {
    config: {},
    fetchFn: (() => {
      throw new Error("fetch must not be called when unconfigured");
    }) as unknown as FetchFn,
  };

  it("explains instead of erroring for all three node tools", async () => {
    for (const out of [
      await publisherSummaryTool(empty),
      await paymentStatusTool(empty),
      await fragmentUsageTool(empty, "2026-01-15-x"),
    ]) {
      expect(out.isError).toBeFalsy();
      expect(out.text).toContain("not configured");
      expect(out.text.toLowerCase()).toContain("settings");
    }
  });

  it("names which value is missing on partial config", async () => {
    const partial: NodeClientDeps = { config: { url: BASE }, fetchFn: empty.fetchFn };
    const out = await publisherSummaryTool(partial);
    expect(out.text).toContain("Sphere Node Token");
  });
});

describe("configured node calls", () => {
  it("sends the bearer token and parses the response for the summary", async () => {
    const records: Recorded[] = [];
    const body = { publisher: "Acme", fragment_count: 2 };
    const out = await publisherSummaryTool(configuredDeps(records, body));

    expect(records).toHaveLength(1);
    expect(records[0]!.url).toBe(`${BASE}/owner/summary`);
    expect(records[0]!.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(out.isError).toBeFalsy();
    expect(out.text).toContain("Acme");
    expect(out.text).toContain('"fragment_count": 2');
  });

  it("builds the usage path from the fragment id against the configured base", async () => {
    const records: Recorded[] = [];
    await fragmentUsageTool(configuredDeps(records, { fragment_id: "2026-01-15-x", points: [] }), "2026-01-15-x");
    expect(records[0]!.url).toBe(`${BASE}/owner/fragments/2026-01-15-x/usage`);
  });

  it("surfaces a 401 as a clear token error", async () => {
    const records: Recorded[] = [];
    const out = await publisherSummaryTool(configuredDeps(records, { error: "unauthorized" }, 401));
    expect(out.isError).toBe(true);
    expect(out.text).toContain("401");
  });
});

describe("never calls any URL other than the configured node", () => {
  it("rejects a fragment id that tries to be a different URL, without calling fetch", async () => {
    const records: Recorded[] = [];
    const deps = configuredDeps(records, {});
    const out = await fragmentUsageTool(deps, "http://evil.example/owner/summary");
    expect(out.isError).toBe(true);
    expect(records).toHaveLength(0); // never dialed out
  });

  it("keeps every dialed URL on the configured origin across all tools and inputs", async () => {
    const records: Recorded[] = [];
    const deps = configuredDeps(records, {});
    await publisherSummaryTool(deps);
    await paymentStatusTool(deps);
    await fragmentUsageTool(deps, "2026-01-15-x");
    await fragmentUsageTool(deps, "../../escape"); // rejected before fetch

    const origin = new URL(BASE).origin;
    for (const rec of records) {
      expect(new URL(rec.url).origin).toBe(origin);
    }
    // The three valid calls dialed out; the escape attempt did not.
    expect(records).toHaveLength(3);
  });

  it("buildOwnerUrl refuses a cross-origin path", () => {
    expect(() => buildOwnerUrl(BASE, "//evil.example/owner/summary")).toThrow(/refusing/);
    expect(() => buildOwnerUrl(BASE, "https://evil.example/owner/summary")).toThrow(/refusing/);
    expect(buildOwnerUrl(BASE, "/owner/summary").toString()).toBe(`${BASE}/owner/summary`);
  });
});

describe("config reader", () => {
  it("treats blank env values as unset", () => {
    expect(readNodeConfig({ SPHERE_NODE_URL: "  ", SPHERE_NODE_TOKEN: "" })).toEqual({});
    expect(readNodeConfig({ SPHERE_NODE_URL: "https://x", SPHERE_NODE_TOKEN: "t" })).toEqual({
      url: "https://x",
      token: "t",
    });
  });
});
