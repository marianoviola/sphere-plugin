// Vendored from sphere-node. Source of truth lives there.
//
// These are the response shapes of the Sphere Node owner face, derived from
// sphere-node/spec/node-api.md. This plugin only READS these endpoints; it never
// defines or serves them. Keep in sync with sphere-node; do not extend here.

/** Access policies a fragment can declare (mirrors fragment.schema.json). */
export type AccessPolicy = "free" | "metered" | "paid" | "sponsored";

/** GET /owner/summary */
export interface PublisherSummary {
  publisher: string;
  fragment_count: number;
  events: {
    total: number;
    by_type: Record<string, number>;
  };
  top_fragments: Array<{
    id: string;
    title: string | null;
    events: number;
  }>;
  revenue: {
    total: number;
    currency: string;
    payments: number;
  };
}

/** GET /owner/fragments/{id}/usage */
export interface FragmentUsage {
  fragment_id: string;
  points: Array<{
    day: string;
    event_type: string;
    count: number;
  }>;
}

/** A single payment row (dormant in node v1; shape present). */
export interface PaymentRecord {
  ts: number;
  fragmentId: string | null;
  amount: number;
  currency: string | null;
  profile: string | null;
  status: string;
}

/** GET /owner/payments */
export interface PaymentStatus {
  payments: PaymentRecord[];
  total: number;
}

/** External provenance kinds a fragment may draw on. */
export type SourceType = "book" | "article" | "paper" | "video" | "webpage" | "dataset" | "other";

/**
 * A typed EXTERNAL source: a book, article, paper, video, page, or dataset a
 * fragment draws on. Provenance is legitimacy, so this is part of the contract.
 * NOT the internal document a fragment was generated from (build lineage).
 */
export interface SourceRef {
  type: SourceType;
  title: string;
  author?: string;
  url?: string;
  date?: string;
  note?: string;
}

/** Minimal manifest shape the plugin reads for validation and readiness. */
export interface FragmentManifest {
  id: string;
  title: string;
  summary?: string;
  license: string;
  access: {
    policy: AccessPolicy;
    preview_chars?: number;
    price_per_access?: number;
    currency?: string;
    payment?: { profile: string; method: string; endpoint: string; [k: string]: unknown };
    [k: string]: unknown;
  };
  sources?: SourceRef[];
  relations?: unknown[];
  // Optional fields the readiness checks look for (not required by the schema).
  canonical_url?: string;
  media?: unknown[];
  data?: unknown[];
  [k: string]: unknown;
}
