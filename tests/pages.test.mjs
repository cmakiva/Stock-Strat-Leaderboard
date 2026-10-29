// Checks the pre-rendered pages search engines will read. Run: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_URL = "https://example.com/";

// Build pages from the committed sample data so the test never needs the network.
const work = fs.mkdtempSync(path.join(os.tmpdir(), "bb-pages-"));
const site = path.join(work, "site");
fs.cpSync(path.join(repo, "site"), site, { recursive: true });
fs.copyFileSync(path.join(site, "data", "sample-results.json"), path.join(site, "data", "results.json"));
const out = path.join(work, "dist");
execFileSync(process.execPath, [path.join(repo, "engine", "prerender.mjs"), "--site", site, "--out", out],
  { env: { ...process.env, SITE_URL } });

const data = JSON.parse(fs.readFileSync(path.join(site, "data", "results.json"), "utf8"));
const read = (p) => fs.readFileSync(path.join(out, p), "utf8");
const pages = [["index.html", ""], ...data.strategies.map((s) => [`strategies/${s.id}/index.html`, `strategies/${s.id}/`])];

test("every page exists with its own title, description and canonical address", () => {
  const titles = new Set();
  for (const [file, urlPath] of pages) {
    const html = read(file);
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    assert.ok(title, `${file} has a title`);
    titles.add(title);
    assert.match(html, /<meta name="description" content="[^"]{60,}">/, `${file} has a description`);
    assert.ok(html.includes(`<link rel="canonical" href="${SITE_URL}${urlPath}">`), `${file} canonical`);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${file} has exactly one h1`);
    assert.doesNotMatch(html, /<!--\/?(HEAD|MAIN|SORT|INSTRUMENT|ASSUMPTIONS|SOURCE)-->/, `${file} has no template markers left`);
    assert.doesNotMatch(html, /Loading the latest results/, `${file} has real content, not the loading message`);
    assert.match(html, /class="kpis"/);
  }
  assert.equal(titles.size, pages.length, "titles are unique");
});

test("strategy pages carry their own numbers and rules", () => {
  for (const s of data.strategies) {
    const html = read(`strategies/${s.id}/index.html`);
    assert.ok(html.includes(s.rules.buy.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")), `${s.id} buy rule`);
    assert.match(html, /<base href="\.\.\/\.\.\/">/);
  }
});

test("leaderboard links point at pages that exist", () => {
  const html = read("index.html");
  const links = [...html.matchAll(/class="b-row" href="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(links.length, 10);
  for (const href of links) assert.ok(fs.existsSync(path.join(out, href, "index.html")), href);
});

test("sitemap, robots and 404", () => {
  const sm = read("sitemap.xml");
  assert.equal((sm.match(/<loc>/g) || []).length, pages.length);
  assert.ok(sm.includes(`<loc>${SITE_URL}strategies/golden-cross/</loc>`));
  assert.ok(read("robots.txt").includes(`Sitemap: ${SITE_URL}sitemap.xml`));
  assert.match(read("404.html"), /noindex/);
});
