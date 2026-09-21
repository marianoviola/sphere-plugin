import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import schema from "@sphere-pub/node/spec/fragment.schema.json";

// The fragment contract has exactly one home, the @sphere-pub/node package.
// This plugin used to vendor a copy under src/contract/; these tests keep it
// from coming back and make sure the schema in the bundle is the package's.
describe("fragment contract", () => {
  it("is not vendored in this repository", () => {
    const vendored = fileURLToPath(new URL("../src/contract", import.meta.url));
    expect(existsSync(vendored)).toBe(false);
  });

  it("comes from @sphere-pub/node", () => {
    expect(schema.$id).toBe("https://sphere.pub/spec/fragment.schema.json");
    expect(schema.title).toBe("Sphere Fragment Manifest");
    expect(schema.required).toEqual(["id", "title", "license", "access"]);
  });
});
