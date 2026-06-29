// Scaffold and write a fragment (sphere.json + content.md) from provided inputs.
// Consumes the fragment contract only. It knows nothing about Astro, any CMS, or
// any source format: callers hand it plain fields and Markdown body text.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AccessPolicy, FragmentManifest, SourceRef } from "../contract/node-api";
import { validateManifest, type ValidationResult } from "./validate";

export interface PrepareInput {
  outputDir: string;
  title: string;
  content: string;
  id?: string;
  summary?: string;
  license?: string;
  accessPolicy?: AccessPolicy;
  pricePerAccess?: number;
  currency?: string;
  payment?: { profile: string; method: string; endpoint: string };
  canonicalUrl?: string;
  /** Typed external provenance copied through to the fragment manifest. */
  sources?: SourceRef[];
  /** yyyy-mm-dd; defaults to today. Used to derive the id when none is given. */
  today?: string;
}

export interface PrepareResult {
  id: string;
  dir: string;
  files: string[];
  validation: ValidationResult;
}

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug || "fragment";
}

function todayString(today?: string): string {
  if (today) return today;
  return new Date().toISOString().slice(0, 10);
}

export function buildManifest(input: PrepareInput): FragmentManifest {
  const id = input.id ?? `${todayString(input.today)}-${slugify(input.title)}`;
  const policy: AccessPolicy = input.accessPolicy ?? "free";

  const access: FragmentManifest["access"] = { policy };
  if (typeof input.pricePerAccess === "number") access.price_per_access = input.pricePerAccess;
  if (input.currency) access.currency = input.currency;
  if (input.payment) access.payment = input.payment;

  const manifest: FragmentManifest = {
    id,
    title: input.title,
    license: input.license ?? "CC-BY",
    access,
    sources: input.sources ?? [],
    relations: [],
  };
  if (input.summary) manifest.summary = input.summary;
  if (input.canonicalUrl) manifest.canonical_url = input.canonicalUrl;
  return manifest;
}

function buildContent(input: PrepareInput): string {
  const body = input.content.trimStart();
  // content.md convention: H1 is reserved for the manifest title.
  if (body.startsWith("#")) return `${body.trimEnd()}\n`;
  return `# ${input.title}\n\n${body.trimEnd()}\n`;
}

/** Write the fragment to <outputDir>/<id>/ and validate what was written. */
export async function prepareFragment(input: PrepareInput): Promise<PrepareResult> {
  const manifest = buildManifest(input);
  const dir = join(input.outputDir, manifest.id);
  await mkdir(dir, { recursive: true });

  const manifestPath = join(dir, "sphere.json");
  const contentPath = join(dir, "content.md");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(contentPath, buildContent(input), "utf8");

  return {
    id: manifest.id,
    dir,
    files: [manifestPath, contentPath],
    validation: validateManifest(manifest),
  };
}
