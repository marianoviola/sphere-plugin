import { describe, it, expect } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareFragmentTool, validateFragmentTool } from "../src/tools/local";
import { prepareFragment } from "../src/core/prepare";
import { validateManifest } from "../src/core/validate";

describe("prepare_fragment", () => {
  it("writes a valid fragment and derives the id from the title and date", async () => {
    const out = await mkdtemp(join(tmpdir(), "sphere-prepare-"));
    const result = await prepareFragment({
      outputDir: out,
      title: "My First Fragment",
      content: "Some body text about the topic.",
      today: "2026-02-01",
      canonicalUrl: "https://example.com/x",
      sources: [{ type: "article", title: "Source article", author: "B. Author", url: "https://example.com/src" }],
      relations: [
        { type: "continues", target: "2026-01-31-prequel" },
        { type: "cites", target: "https://other.node/fragments/2026-01-10-source" },
      ],
    });

    expect(result.id).toBe("2026-02-01-my-first-fragment");
    expect(result.validation.ok).toBe(true);

    const manifest = JSON.parse(await readFile(join(result.dir, "sphere.json"), "utf8"));
    expect(manifest.title).toBe("My First Fragment");
    expect(manifest.license).toBe("CC-BY");
    expect(manifest.access.policy).toBe("free");
    // Typed relations are copied through unchanged.
    expect(manifest.relations).toEqual([
      { type: "continues", target: "2026-01-31-prequel" },
      { type: "cites", target: "https://other.node/fragments/2026-01-10-source" },
    ]);

    const content = await readFile(join(result.dir, "content.md"), "utf8");
    expect(content.startsWith("# My First Fragment")).toBe(true);

    // Round-trip: the written fragment validates through the tool too.
    const validated = await validateFragmentTool(result.dir);
    expect(validated.text).toContain("PASS");
  });

  it("reports validation failure when inputs produce an invalid manifest", async () => {
    const out = await mkdtemp(join(tmpdir(), "sphere-prepare-"));
    // paid policy with no payment/price is structurally invalid.
    const res = await prepareFragmentTool({
      outputDir: out,
      title: "Paid But Incomplete",
      content: "body",
      accessPolicy: "paid",
      today: "2026-02-02",
    });
    expect(res.text).toContain("Validation: FAIL");
    expect(res.text).toMatch(/payment|price/);
  });
});

describe("typed relations validation", () => {
  const base = { id: "2026-02-01-a", title: "A", license: "CC-BY", access: { policy: "free" } };

  it("accepts typed edges (same-node id and absolute external URL targets)", () => {
    const result = validateManifest({
      ...base,
      relations: [
        { type: "continues", target: "2026-01-31-prequel" },
        { type: "cites", target: "https://other.node/fragments/2026-01-10-source" },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("fails clearly on a malformed edge and on a legacy bare-string relation", () => {
    // Legacy split shape: { type, fragment_id } has no `target`.
    const split = validateManifest({
      ...base,
      relations: [{ type: "extends", fragment_id: "2026-01-31-prequel" }],
    });
    expect(split.ok).toBe(false);
    expect(split.errors.join("\n")).toMatch(/relations\[0\].*target/);

    // Legacy bare string is not an object edge.
    const bare = validateManifest({ ...base, relations: ["2026-01-31-prequel"] });
    expect(bare.ok).toBe(false);
    expect(bare.errors.join("\n")).toMatch(/relations\[0\].*object/);
  });
});
