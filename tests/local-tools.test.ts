import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import {
  validateFragmentTool,
  analyzeReadinessTool,
  generateReportTool,
} from "../src/tools/local";
import { RIGHTS_AND_RISK_TITLE } from "../src/core/report";

const EXAMPLES = fileURLToPath(new URL("../examples", import.meta.url));
const READY = `${EXAMPLES}/ready-fragment`;
const GAPS = `${EXAMPLES}/gaps-fragment`;
const INVALID = `${EXAMPLES}/invalid-fragment`;

describe("validate_fragment", () => {
  it("passes a structurally valid fragment", async () => {
    const out = await validateFragmentTool(READY);
    expect(out.text).toContain("PASS");
    expect(out.isError).toBeFalsy();
  });

  it("fails an invalid fragment and lists structural errors", async () => {
    const out = await validateFragmentTool(INVALID);
    expect(out.text).toContain("FAIL");
    // bad id pattern, invalid policy enum, and missing required fields
    expect(out.text).toMatch(/pattern/);
    expect(out.text).toMatch(/one of/);
    expect(out.text).toMatch(/missing required property "title"/);
    expect(out.text).toMatch(/missing required property "license"/);
  });
});

describe("analyze_fragment_readiness", () => {
  it("reports no advisory gaps for a clean fragment", async () => {
    const out = await analyzeReadinessTool(READY);
    expect(out.text).toContain("100/100");
    expect(out.text).toContain("No advisory gaps");
  });

  it("flags advisory gaps for a gappy (but valid) fragment", async () => {
    const out = await analyzeReadinessTool(GAPS);
    expect(out.text).toMatch(/No sources/);
    expect(out.text).toMatch(/unclear/i);
    expect(out.text).toMatch(/canonical_url/);
    expect(out.text).toMatch(/media item/);
    expect(out.text).toMatch(/data file/);
    expect(out.text).toMatch(/empty alt/);
    expect(out.text).not.toContain("100/100");
  });
});

describe("generate_fragment_report", () => {
  it("renders a single-fragment report with the empty Rights and risk placeholder", async () => {
    const out = await generateReportTool(READY);
    expect(out.text).toContain("# Fragment report");
    expect(out.text).toContain(`## ${RIGHTS_AND_RISK_TITLE}`);
    expect(out.text).toContain("Not part of v1");
    expect(out.text).toContain("PASS");
  });

  it("renders a directory report over multiple fragments with exactly one Rights and risk slot", async () => {
    const out = await generateReportTool(EXAMPLES);
    expect(out.text).toContain("3 fragments");
    const occurrences = out.text.split(`## ${RIGHTS_AND_RISK_TITLE}`).length - 1;
    expect(occurrences).toBe(1);
    // The invalid example shows up as a FAIL within the combined report.
    expect(out.text).toContain("FAIL");
  });
});
