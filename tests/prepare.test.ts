import { describe, it, expect } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareFragmentTool, validateFragmentTool } from "../src/tools/local";
import { prepareFragment } from "../src/core/prepare";

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
    });

    expect(result.id).toBe("2026-02-01-my-first-fragment");
    expect(result.validation.ok).toBe(true);

    const manifest = JSON.parse(await readFile(join(result.dir, "sphere.json"), "utf8"));
    expect(manifest.title).toBe("My First Fragment");
    expect(manifest.license).toBe("CC-BY");
    expect(manifest.access.policy).toBe("free");

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
