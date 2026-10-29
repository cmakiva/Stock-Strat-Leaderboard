// Writes the finished website into an output folder:
//   index.html                    home page (the #1 strategy)
//   strategies/<id>/index.html    one real page per strategy, so search engines can find each one
//   sitemap.xml, robots.txt, 404.html
// Each page already contains its text and numbers (search engines read these);
// the browser then adds the interactive chart on top.
//
// Usage: SITE_URL=https://example.com node engine/prerender.mjs [--site site] [--out dist]

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1]]);
  return acc;
}, []));
const SITE = path.resolve(args.site || path.join(here, "..", "site"));
const OUT = path.resolve(args.out || path.join(here, "..", "dist"));
const SITE_URL = (process.env.SITE_URL || "https://cmakiva.github.io/Stock-Strat-Leaderboard").replace(/\/+$/, "") + "/";

const BB = createRequire(import.meta.url)(path.join(SITE, "render.js"));
const { esc } = BB;

export function fillRegion(html, name, content) {
  const re = new RegExp(`<!--${name}-->[\\s\\S]*?<!--/${name}-->`);
  if (!re.test(html)) throw new Error(`Template is missing the ${name} region`);
  return html.replace(re, () => content);
}

function headTags({ base, title, description, url }) {
  return [
    `<base href="${base}">`,
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(BB.APP_NAME)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta name="twitter:card" content="summary">`,
  ].join("\n  ");
}

export function renderPage(template, data, id) {
  const s = id ? data.strategies.find((x) => x.id === id) : null;
  const isHome = !s;
  let html = template;
  html = fillRegion(html, "HEAD", headTags({
    base: isHome ? "./" : "../../",
    title: isHome ? BB.homeTitle(data) : BB.strategyTitle(data, s),
    description: isHome ? BB.homeDescription(data) : BB.strategyDescription(data, s),
    url: isHome ? SITE_URL : SITE_URL + BB.strategyPath(s.id),
  }));
  html = fillRegion(html, "INSTRUMENT", BB.instrument(data));
  html = fillRegion(html, "SORT", BB.sortButtons(BB.DEFAULT_SORT));
  html = fillRegion(html, "MAIN", BB.dashboard(data, isHome ? null : s.id, BB.DEFAULT_SORT, ""));
  html = fillRegion(html, "ASSUMPTIONS", BB.assumptions(data));
  html = fillRegion(html, "SOURCE", BB.source(data));
  return html;
}

function sitemap(data) {
  const lastmod = data.period.end;
  const urls = [SITE_URL, ...data.strategies.map((s) => SITE_URL + BB.strategyPath(s.id))];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${esc(u)}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq></url>`).join("\n") +
    `\n</urlset>\n`;
}

function notFound() {
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Page not found | ${esc(BB.APP_NAME)}</title>
  <meta name="robots" content="noindex">
  <script>try { var t = localStorage.getItem("theme"); if (t) document.documentElement.dataset.theme = t; } catch (e) {}</script>
  <link rel="stylesheet" href="${SITE_URL}styles.css">
</head>
<body>
  <header class="topbar"><a class="brand" href="${SITE_URL}">${esc(BB.APP_NAME)}</a></header>
  <main class="dash">
    <section class="panel not-found">
      <h1>That page doesn't exist</h1>
      <p>The address may be mistyped, or the strategy may have been renamed.</p>
      <p><a href="${SITE_URL}">See today's top strategies</a></p>
    </section>
  </main>
</body>
</html>
`;
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, entry.name), b = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

function main() {
  const data = JSON.parse(fs.readFileSync(path.join(SITE, "data", "results.json"), "utf8"));
  const template = fs.readFileSync(path.join(SITE, "index.html"), "utf8");

  fs.rmSync(OUT, { recursive: true, force: true });
  copyDir(SITE, OUT);

  fs.writeFileSync(path.join(OUT, "index.html"), renderPage(template, data, null));
  for (const s of data.strategies) {
    const dir = path.join(OUT, "strategies", s.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), renderPage(template, data, s.id));
  }
  fs.writeFileSync(path.join(OUT, "sitemap.xml"), sitemap(data));
  fs.writeFileSync(path.join(OUT, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}sitemap.xml\n`);
  fs.writeFileSync(path.join(OUT, "404.html"), notFound());
  fs.writeFileSync(path.join(OUT, ".nojekyll"), "");

  console.log(`Wrote ${data.strategies.length + 1} pages to ${OUT} for ${SITE_URL}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
