import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { githubDocsPriceSource } from "../../../src/adapters/githubDocsPriceSource";
import { PriceServer } from "./priceServer";

const fixture = (name: string) =>
  readFileSync(join(__dirname, "../../fixtures/pricing", name), "utf8");
const YAML = fixture("models-and-pricing.yml");
const ARTICLE = fixture("models-and-pricing.md");
const NOW = new Date("2026-10-24T09:00:00.000Z");

let server: PriceServer | undefined;
afterEach(async () => {
  await server?.stop();
  server = undefined;
});

async function source(routes: ConstructorParameters<typeof Object>[0], timeoutMs?: number) {
  server = await PriceServer.start(routes as never);
  return githubDocsPriceSource({
    yamlUrl: `${server.base}/yaml`,
    articleUrl: `${server.base}/article`,
    now: () => NOW,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
}

describe("githubDocsPriceSource", () => {
  it("returns ok with a parsed table for a 200 YAML response, plus its ETag", async () => {
    const price = await source({ "/yaml": { status: 200, body: YAML, headers: { etag: '"v1"' } } });
    const result = await price.fetch();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.etag).toBe('"v1"');
    expect(result.table.source).toBe("github-docs-yaml");
    expect(result.table.fetchedAt).toBe(NOW.toISOString());
    expect(result.table.etag).toBe('"v1"');
    expect(result.table.models.length).toBeGreaterThan(20);
    expect(server?.requests.map((r) => r.path)).toEqual(["/yaml"]);
  });

  it("returns ok without an ETag when the server sends none", async () => {
    const price = await source({ "/yaml": { status: 200, body: YAML } });
    const result = await price.fetch();
    expect(result.status === "ok" && result.etag).toBeUndefined();
  });

  it("sends If-None-Match and returns unchanged for a 304", async () => {
    const price = await source({ "/yaml": { status: 304 } });
    expect(await price.fetch({ etag: '"v1"' })).toEqual({ status: "unchanged" });
    expect(server?.requests[0]?.headers["if-none-match"]).toBe('"v1"');
  });

  it("sends no If-None-Match without a stored ETag", async () => {
    const price = await source({ "/yaml": { status: 200, body: YAML } });
    await price.fetch({});
    expect(server?.requests[0]?.headers["if-none-match"]).toBeUndefined();
  });

  it("falls back to the article when the YAML request fails", async () => {
    const price = await source({
      "/yaml": { status: 500 },
      "/article": { status: 200, body: ARTICLE },
    });
    const result = await price.fetch();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.table.source).toBe("github-docs-article");
      expect(result.etag).toBeUndefined();
    }
    expect(server?.requests.map((r) => r.path)).toEqual(["/yaml", "/article"]);
  });

  it("falls back to the article when the YAML doesn't parse", async () => {
    const price = await source({
      "/yaml": { status: 200, body: "- model: A\n  nested:\n    x: 1\n" },
      "/article": { status: 200, body: ARTICLE },
    });
    const result = await price.fetch();
    expect(result.status === "ok" && result.table.source).toBe("github-docs-article");
  });

  it("falls back when the YAML parses to no models", async () => {
    const price = await source({
      "/yaml": { status: 200, body: "# nothing\n" },
      "/article": { status: 200, body: ARTICLE },
    });
    expect((await price.fetch()).status).toBe("ok");
  });

  it("falls back when the YAML server is unreachable", async () => {
    server = await PriceServer.start({ "/article": { status: 200, body: ARTICLE } });
    const price = githubDocsPriceSource({
      yamlUrl: "http://127.0.0.1:9/yaml",
      articleUrl: `${server.base}/article`,
      now: () => NOW,
    });
    expect((await price.fetch()).status).toBe("ok");
  });

  it("returns failed with both reasons when both sources fail", async () => {
    const price = await source({
      "/yaml": { status: 503 },
      "/article": { status: 200, body: "# no tables here\n" },
    });
    const result = await price.fetch();
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons[0]).toMatch(/yaml.*503/i);
    expect(result.reasons[1]).toMatch(/article.*no models/i);
  });

  it("reports a 304 on the article as a failure: it is never asked conditionally", async () => {
    const price = await source({ "/yaml": { status: 500 }, "/article": { status: 304 } });
    const result = await price.fetch();
    expect(result.status).toBe("failed");
    expect(server?.requests[1]?.headers["if-none-match"]).toBeUndefined();
  });

  it("times out", async () => {
    const price = await source(
      { "/yaml": { status: 200, hang: true }, "/article": { status: 200, hang: true } },
      150,
    );
    const started = Date.now();
    const result = await price.fetch();
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.reasons.join(" ")).toMatch(/timed out/i);
  });

  it("uses a 10 second timeout by default", async () => {
    server = await PriceServer.start({ "/yaml": { status: 200, body: YAML } });
    const price = githubDocsPriceSource({
      yamlUrl: `${server.base}/yaml`,
      articleUrl: `${server.base}/article`,
    });
    const result = await price.fetch();
    expect(result.status).toBe("ok");
    if (result.status === "ok")
      expect(Date.parse(result.table.fetchedAt)).toBeGreaterThan(Date.now() - 60_000);
  });

  it("points at GitHub's real URLs by default", async () => {
    const { DEFAULT_YAML_URL, DEFAULT_ARTICLE_URL } =
      await import("../../../src/adapters/githubDocsPriceSource");
    expect(DEFAULT_YAML_URL).toBe(
      "https://raw.githubusercontent.com/github/docs/main/data/tables/copilot/models-and-pricing.yml",
    );
    expect(DEFAULT_ARTICLE_URL).toBe(
      "https://docs.github.com/api/article/body?pathname=/en/copilot/reference/copilot-billing/models-and-pricing",
    );
  });
});
