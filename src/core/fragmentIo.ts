// Read fragments from disk. A fragment is a directory with sphere.json and an
// optional content.md. Helpers accept either a directory path or a direct path
// to a sphere.json file. No network, no CMS knowledge.

import { readFile, readdir, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import type { FragmentManifest } from "../contract/node-api";

export interface LoadedFragment {
  /** Directory that holds sphere.json. */
  dir: string;
  manifestPath: string;
  /** Parsed manifest, or null when sphere.json is missing or not JSON. */
  manifest: FragmentManifest | null;
  /** content.md text, or null when absent. */
  content: string | null;
  /** Parse or read error, if any. */
  error: string | null;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Resolve an input path to the directory holding sphere.json. */
async function resolveDir(path: string): Promise<string> {
  if (basename(path) === "sphere.json") return path.slice(0, -"/sphere.json".length) || ".";
  return path;
}

export async function loadFragment(path: string): Promise<LoadedFragment> {
  const dir = await resolveDir(path);
  const manifestPath = join(dir, "sphere.json");
  const contentPath = join(dir, "content.md");

  let manifest: FragmentManifest | null = null;
  let content: string | null = null;
  let error: string | null = null;

  try {
    const raw = await readFile(manifestPath, "utf8");
    try {
      manifest = JSON.parse(raw) as FragmentManifest;
    } catch (e) {
      error = `sphere.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`;
    }
  } catch {
    error = `No sphere.json found at ${manifestPath}`;
  }

  if (await exists(contentPath)) {
    content = await readFile(contentPath, "utf8");
  }

  return { dir, manifestPath, manifest, content, error };
}

/** True when a directory looks like a single fragment (has sphere.json). */
export async function isFragmentDir(path: string): Promise<boolean> {
  return exists(join(path, "sphere.json"));
}

/** List immediate subdirectories of `path` that are fragment directories. */
export async function listFragmentDirs(path: string): Promise<string[]> {
  let entries: string[] = [];
  try {
    entries = await readdir(path);
  } catch {
    return [];
  }
  const dirs: string[] = [];
  for (const name of entries) {
    const full = join(path, name);
    if (await isFragmentDir(full)) dirs.push(full);
  }
  return dirs.sort();
}
