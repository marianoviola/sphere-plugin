// Sphere plugin: a local MCP server over stdio. It exposes four local fragment
// tools (zero config, no network) and four client tools that talk to the single
// configured Sphere Node: three read-only owner reads and one guided publish
// (PUT). It hosts nothing and stores nothing.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { readNodeConfig } from "./config";
import type { FetchFn, NodeClientDeps } from "./node/client";
import {
  validateFragmentTool,
  analyzeReadinessTool,
  generateReportTool,
  prepareFragmentTool,
  type ToolText,
} from "./tools/local";
import {
  publisherSummaryTool,
  paymentStatusTool,
  fragmentUsageTool,
  publishFragmentTool,
} from "./tools/node";

function toResult(out: ToolText) {
  return {
    content: [{ type: "text" as const, text: out.text }],
    isError: out.isError ?? false,
  };
}

function nodeDeps(): NodeClientDeps {
  return { config: readNodeConfig(), fetchFn: fetch as FetchFn };
}

const server = new McpServer({ name: "sphere-plugin", version: "1.0.0" });

// --- Local tier ---

server.registerTool(
  "validate_fragment",
  {
    title: "Validate fragment",
    description:
      "Check a fragment's structural validity against the Sphere fragment schema. " +
      "Returns PASS or FAIL with a list of structural errors. Operates on local files only.",
    inputSchema: {
      path: z.string().describe("Path to a fragment directory or its sphere.json file."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ path }) => toResult(await validateFragmentTool(path)),
);

server.registerTool(
  "analyze_fragment_readiness",
  {
    title: "Analyze fragment readiness",
    description:
      "Report advisory readiness gaps that are not hard errors: missing sources, media " +
      "without descriptions, unclear or missing license, data without a schema, missing " +
      "canonical_url. Returns scored findings with severities and suggestions. Local files only.",
    inputSchema: {
      path: z.string().describe("Path to a fragment directory or its sphere.json file."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ path }) => toResult(await analyzeReadinessTool(path)),
);

server.registerTool(
  "generate_fragment_report",
  {
    title: "Generate fragment report",
    description:
      "Combine validation and readiness into one readable report for a single fragment or a " +
      "directory of fragments. Includes an explicit 'Rights and risk' placeholder noting that " +
      "rights and risk analysis is not part of v1. Local files only.",
    inputSchema: {
      path: z
        .string()
        .describe("Path to a fragment directory, its sphere.json, or a directory of fragments."),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ path }) => toResult(await generateReportTool(path)),
);

server.registerTool(
  "prepare_fragment",
  {
    title: "Prepare fragment",
    description:
      "Scaffold and WRITE a fragment (sphere.json + content.md) from provided fields and Markdown " +
      "body. Consumes the fragment contract only. Validates what it writes.",
    inputSchema: {
      output_dir: z.string().describe("Directory to write the new fragment folder into."),
      title: z.string().describe("Fragment title. Reserved as the content.md H1."),
      content: z.string().describe("Markdown body of the fragment."),
      id: z.string().optional().describe("Fragment id (yyyy-mm-dd-title-slug). Derived from title if omitted."),
      summary: z.string().optional(),
      license: z.string().optional().describe("License identifier. Defaults to CC-BY."),
      access_policy: z.enum(["free", "metered", "paid", "sponsored"]).optional().describe("Defaults to free."),
      price_per_access: z.number().optional(),
      currency: z.string().optional(),
      canonical_url: z.string().optional(),
      relations: z
        .array(z.object({ type: z.string(), target: z.string() }).passthrough())
        .optional()
        .describe(
          "Typed edges to other fragments, from the source frontmatter. Each edge is " +
            "{ type, target } where target is a canonical fragment reference: a same-node id " +
            "(yyyy-mm-dd-slug) or an absolute external fragment URL ({node_base}/fragments/{id}).",
        ),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
  async (args) =>
    toResult(
      await prepareFragmentTool({
        outputDir: args.output_dir,
        title: args.title,
        content: args.content,
        id: args.id,
        summary: args.summary,
        license: args.license,
        accessPolicy: args.access_policy,
        pricePerAccess: args.price_per_access,
        currency: args.currency,
        canonicalUrl: args.canonical_url,
        relations: args.relations,
      }),
    ),
);

// --- Node-client tier ---

server.registerTool(
  "get_publisher_summary",
  {
    title: "Get publisher summary",
    description:
      "Read GET /owner/summary from your configured Sphere Node. If the Node URL or token is not " +
      "set, explains how to configure it instead of failing.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => toResult(await publisherSummaryTool(nodeDeps())),
);

server.registerTool(
  "get_fragment_usage",
  {
    title: "Get fragment usage",
    description:
      "Read GET /owner/fragments/{id}/usage from your configured Sphere Node for one fragment id. " +
      "If the Node URL or token is not set, explains how to configure it instead of failing.",
    inputSchema: {
      fragment_id: z.string().describe("The fragment id to fetch usage for."),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ fragment_id }) => toResult(await fragmentUsageTool(nodeDeps(), fragment_id)),
);

server.registerTool(
  "get_payment_status",
  {
    title: "Get payment status",
    description:
      "Read GET /owner/payments from your configured Sphere Node. If the Node URL or token is not " +
      "set, explains how to configure it instead of failing.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => toResult(await paymentStatusTool(nodeDeps())),
);

server.registerTool(
  "publish_fragment",
  {
    title: "Publish fragment to your Sphere Node",
    description:
      "Read a prepared local fragment, validate it, then publish it to your configured Sphere " +
      "Node (PUT /owner/fragments/{id}). Refuses to publish a structurally invalid fragment and " +
      "reports readiness gaps. Recommended flow: prepare_fragment, validate_fragment, " +
      "analyze_fragment_readiness, then publish_fragment. If the Node URL or token is not set, " +
      "explains how to configure it instead of failing.",
    inputSchema: {
      path: z.string().describe("Path to a prepared fragment directory or its sphere.json."),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  },
  async ({ path }) => toResult(await publishFragmentTool(nodeDeps(), path)),
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // Never write to stdout: it is the MCP transport. Log to stderr and exit.
  process.stderr.write(`sphere-plugin failed to start: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
