import { parseMarkdownTable } from "../core/pricing/parseMarkdownTable";
import { parseYamlTable } from "../core/pricing/parseYamlTable";
import type { PriceTable } from "../core/pricing/priceTable";
import type { PriceFetchResult, PriceSourcePort } from "../ports/PriceSourcePort";

export const DEFAULT_YAML_URL =
  "https://raw.githubusercontent.com/github/docs/main/data/tables/copilot/models-and-pricing.yml";
export const DEFAULT_ARTICLE_URL =
  "https://docs.github.com/api/article/body?pathname=/en/copilot/reference/copilot-billing/models-and-pricing";

export interface GithubDocsPriceSourceOptions {
  readonly yamlUrl?: string;
  readonly articleUrl?: string;
  readonly timeoutMs?: number;
  readonly now?: () => Date;
}

type Attempt =
  { readonly table: PriceTable } | { readonly unchanged: true } | { readonly reason: string };

/**
 * `PriceSourcePort` over GitHub's public docs: the YAML data file first (conditional on its
 * ETag, so a daily check is usually one 304), the docs article as Markdown if that fails.
 * No auth and no dependencies: Node's `fetch` with a timeout. The URLs are injectable so
 * tests talk to a local server and never to the real network.
 */
export function githubDocsPriceSource(options: GithubDocsPriceSourceOptions = {}): PriceSourcePort {
  const yamlUrl = options.yamlUrl ?? DEFAULT_YAML_URL;
  const articleUrl = options.articleUrl ?? DEFAULT_ARTICLE_URL;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const now = options.now ?? (() => new Date());

  async function get(url: string, headers: Record<string, string>) {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    return { response, text: response.status === 304 ? "" : await response.text() };
  }

  async function attempt(
    label: string,
    url: string,
    etag: string | undefined,
    parse: (text: string, meta: { fetchedAt: string; etag?: string }) => PriceTable,
  ): Promise<Attempt> {
    try {
      const { response, text } = await get(
        url,
        etag === undefined ? {} : { "If-None-Match": etag },
      );
      if (response.status === 304 && etag !== undefined) return { unchanged: true };
      if (response.status !== 200) return { reason: `${label}: HTTP ${response.status}` };
      const responseEtag = response.headers.get("etag") ?? undefined;
      const table = parse(text, {
        fetchedAt: now().toISOString(),
        ...(responseEtag === undefined ? {} : { etag: responseEtag }),
      });
      if (table.models.length === 0) return { reason: `${label}: no models found` };
      return { table };
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      return {
        reason: `${label}: ${timedOut ? `timed out after ${timeoutMs} ms` : errorText(error)}`,
      };
    }
  }

  return {
    async fetch(previous): Promise<PriceFetchResult> {
      const yaml = await attempt("YAML", yamlUrl, previous?.etag, parseYamlTable);
      if ("unchanged" in yaml) return { status: "unchanged" };
      if ("table" in yaml) return ok(yaml.table);
      const article = await attempt("article", articleUrl, undefined, parseMarkdownTable);
      if ("table" in article) return ok(article.table);
      const reason = "reason" in article ? article.reason : "article: unexpected response";
      return { status: "failed", reasons: [yaml.reason, reason] };
    },
  };
}

function ok(table: PriceTable): PriceFetchResult {
  return { status: "ok", table, ...(table.etag === undefined ? {} : { etag: table.etag }) };
}

function errorText(error: unknown): string {
  const cause = error instanceof Error ? (error.cause as { code?: string } | undefined) : undefined;
  const base = error instanceof Error ? error.message : String(error);
  return cause?.code === undefined ? base : `${base} (${cause.code})`;
}
