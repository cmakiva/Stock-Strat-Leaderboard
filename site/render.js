/* Shared page markup for BacktestBoard.
 * Used in two places so they always match:
 *   - the browser (app.js) when it draws the dashboard
 *   - engine/prerender.mjs, which writes a real HTML page per strategy for search engines
 * Every function here returns a string and never touches the DOM.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./content.js"));
  else root.BB = factory(root.BB_CONTENT);
})(typeof self !== "undefined" ? self : this, function (CONTENT) {
  "use strict";

  const APP_NAME = "BacktestBoard"; // tentative name
  const FREE_LIMIT = 10;
  const DEFAULT_SORT = "total_return";

  // ---------- formatting ----------
  function pct(v, signed = true) {
    if (v == null) return "n/a";
    const s = Math.abs(v).toFixed(1) + "%";
    if (!signed) return (v < 0 ? "−" : "") + s;
    return (v > 0 ? "+" : v < 0 ? "−" : "") + s;
  }
  function fixed(v) { return v == null ? "n/a" : (v < 0 ? "−" : "") + Math.abs(v).toFixed(2); }
  function money(v) { return "$" + Math.round(v).toLocaleString("en-US"); }
  function tone(v) { return v > 0 ? "gain" : v < 0 ? "loss" : ""; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function niceDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  }

  const SORTS = {
    total_return: { label: "Total return", noun: "total return", fmt: (m) => pct(m.total_return), tone: (m) => tone(m.total_return) },
    max_drawdown: { label: "Drawdown", noun: "smallest drawdown", fmt: (m) => pct(m.max_drawdown, false), tone: () => "" },
    sharpe: { label: "Sharpe", noun: "Sharpe ratio", fmt: (m) => fixed(m.sharpe), tone: (m) => tone(m.sharpe) },
    win_rate: { label: "Win rate", noun: "win rate", fmt: (m) => (m.win_rate == null ? "n/a" : m.win_rate.toFixed(0) + "%"), tone: () => "" },
  };

  // ---------- data helpers ----------
  function ranked(data, sort) {
    return data.strategies.slice().sort((a, b) => {
      const av = a.metrics[sort], bv = b.metrics[sort];
      if (av == null && bv == null) return b.metrics.total_return - a.metrics.total_return;
      if (av == null) return 1;
      if (bv == null) return -1;
      return bv - av || b.metrics.total_return - a.metrics.total_return;
    });
  }
  function benchmark(data) { return data.strategies.find((s) => s.benchmark); }
  function strategyPath(id) { return `strategies/${encodeURIComponent(id)}/`; }

  // ---------- page text (also used for titles and search descriptions) ----------
  function homeHeadline(data, list, sort) {
    const top = list[0];
    const sym = esc(data.symbol);
    const n = list.length;
    if (sort === "total_return") {
      if (top.benchmark) return `Buy and hold beat all ${n - 1} trading strategies on ${sym} over the last 12 months, returning ${pct(top.metrics.total_return)}.`;
      return `${esc(top.name)} led ${n} strategies on ${sym} over the last 12 months, returning ${pct(top.metrics.total_return)} vs. ${pct(benchmark(data).metrics.total_return)} for buy and hold.`;
    }
    return `${esc(top.name)} had the best ${esc(SORTS[sort].noun)} of ${n} strategies on ${sym} over the last 12 months (${SORTS[sort].fmt(top.metrics)}).`;
  }

  function strategySummary(data, s, rank, n, sort) {
    const sym = esc(data.symbol);
    if (s.benchmark) {
      return `Buying ${sym} and holding it returned ${pct(s.metrics.total_return)} over the last 12 months, ranking #${rank} of ${n} by ${esc(SORTS[sort].noun)}. Every other strategy is compared against it.`;
    }
    return `The ${esc(s.name)} strategy ranked #${rank} of ${n} on ${sym} by ${esc(SORTS[sort].noun)} over the last 12 months, returning ${pct(s.metrics.total_return)} vs. ${pct(benchmark(data).metrics.total_return)} for buy and hold.`;
  }

  function homeTitle(data) {
    return `${APP_NAME}: Trading strategies ranked on ${data.symbol}, last 12 months`;
  }
  function homeDescription(data) {
    const list = ranked(data, DEFAULT_SORT);
    const top = list[0], bench = benchmark(data);
    return `Which of ${list.length} popular trading strategies worked best on ${data.symbol} over the last 12 months? ` +
      `Today's leader: ${top.name}, ${pct(top.metrics.total_return)} vs. ${pct(bench.metrics.total_return)} for buy and hold. Updated every trading day.`;
  }
  function strategyTitle(data, s) {
    const what = s.benchmark ? `Buy and hold ${data.symbol}` : `${s.name} strategy on ${data.symbol}`;
    return `${what}: ${pct(s.metrics.total_return)} over 12 months | ${APP_NAME}`;
  }
  function strategyDescription(data, s) {
    const m = s.metrics;
    // Numbers first: search results cut descriptions off at roughly 155 characters.
    const rules = s.benchmark ? `Buy ${data.symbol} and hold it.` : `Buy when ${lowerFirst(s.rules.buy)}; sell when ${lowerFirst(s.rules.sell)}.`;
    return `${s.benchmark ? "Buy and hold" : s.name} on ${data.symbol}, last 12 months: ${pct(m.total_return)} return, ` +
      `${pct(m.max_drawdown, false)} max drawdown, ${m.trades} trade${m.trades === 1 ? "" : "s"}. ${rules} Backtest updated every trading day.`;
  }
  function lowerFirst(t) {
    // Keep indicator names like RSI, MACD, %K as written.
    return /^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t;
  }

  // ---------- markup pieces ----------
  function sparkline(equity) {
    const w = 64, h = 28, pad = 2;
    const vals = equity.map((p) => p.value);
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    const span = hi - lo || 1;
    const x = (i) => pad + (i / (vals.length - 1)) * (w - pad * 2);
    const y = (v) => pad + (1 - (v - lo) / span) * (h - pad * 2);
    const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const end = vals[vals.length - 1];
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">` +
      `<line x1="0" x2="${w}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="var(--line)" stroke-width="1"/>` +
      `<polyline points="${pts}" fill="none" stroke="var(--${end > 0 ? "gain" : end < 0 ? "loss" : "muted"})" stroke-width="1.5" vector-effect="non-scaling-stroke"/>` +
      `</svg>`;
  }

  function summary(text, isHeading) {
    return isHeading ? `<h1 class="summary">${text}</h1>` : `<p class="summary">${text}</p>`;
  }

  function kpis(data, s) {
    const m = s.metrics;
    const items = [
      ["Total return", `<span class="${tone(m.total_return)}">${pct(m.total_return)}</span>`],
      [`${money(data.start_balance)} became`, money(m.ending_balance)],
      ["Vs. buy and hold", `<span class="${tone(m.vs_benchmark)}">${pct(m.vs_benchmark)}</span>`],
      ["Max drawdown", pct(m.max_drawdown, false)],
      ["Sharpe ratio", fixed(m.sharpe)],
      ["Win rate", m.win_rate == null ? "n/a" : `${m.win_rate.toFixed(0)}%<small>${m.closed_trades} closed</small>`],
    ];
    return `<dl class="kpis">${items.map(([k, v]) => `<div class="panel kpi"><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
  }

  // root: prefix for links ("" when a <base> tag is set, or an absolute URL in the browser)
  function board(list, selId, sort, root) {
    const s = SORTS[sort];
    const top = list.slice(0, FREE_LIMIT);
    return `<aside class="panel board" aria-labelledby="board-title">` +
      `<div class="panel-head"><h2 id="board-title">Top ${top.length} strategies</h2><span class="hint">12-month ${esc(s.noun)}</span></div>` +
      `<ol>${top.map((r, i) => `<li><a class="b-row" href="${esc(root + strategyPath(r.id))}" data-id="${esc(r.id)}"${r.id === selId ? ' aria-current="page"' : ""}>` +
        `<span class="b-rank">${i + 1}</span>` +
        `<span class="b-name">${esc(r.name)}<span class="b-cat">${r.benchmark ? "Benchmark" : esc(r.category)}</span></span>` +
        sparkline(r.equity) +
        `<span class="b-val ${s.tone(r.metrics)}">${s.fmt(r.metrics)}</span>` +
        `</a></li>`).join("")}</ol>` +
      (list.length > FREE_LIMIT ? `<div class="board-foot">Top ${FREE_LIMIT} of ${list.length} strategies tested.</div>` : "") +
      `</aside>`;
  }

  function info(s) {
    const settings = s.params.length
      ? `<div class="settings">${s.params.map((p) => `<span>${esc(p.label)} <b class="num">${p.value}</b></span>`).join("")}</div>`
      : `<p class="muted">None</p>`;
    const trades = s.trades.slice().reverse();
    return `<div class="info">` +
      `<section class="panel" aria-labelledby="rules-title">` +
        `<div class="panel-head"><h2 id="rules-title">Rules</h2><span class="hint">${esc(s.category)}</span></div>` +
        `<div class="rules">` +
          `<div><h3>Buy when</h3><p>${esc(s.rules.buy)}</p></div>` +
          `<div><h3>Sell when</h3><p>${esc(s.rules.sell)}</p></div>` +
          `<div><h3>Settings</h3>${settings}</div>` +
        `</div>` +
      `</section>` +
      `<section class="panel" aria-labelledby="trades-title">` +
        `<div class="panel-head"><h2 id="trades-title">Trades</h2><span class="hint">${s.trades.length} in the last 12 months</span></div>` +
        (trades.length ? `<div class="trades-wrap"><table class="trades">` +
          `<thead><tr><th>Bought</th><th class="col-hide">Price</th><th>Sold</th><th class="col-hide">Price</th><th>Return</th></tr></thead>` +
          `<tbody>${trades.map((t) => `<tr>` +
            `<td>${niceDate(t.entry_date)}</td><td class="col-hide">${t.entry_price.toFixed(2)}</td>` +
            `<td>${t.closed ? niceDate(t.exit_date) : "Open"}</td><td class="col-hide">${t.closed ? t.exit_price.toFixed(2) : t.exit_price.toFixed(2) + " last"}</td>` +
            `<td class="${tone(t.return_pct)}">${pct(t.return_pct)}</td></tr>`).join("")}</tbody>` +
        `</table></div>` : `<p class="empty">No trades: the buy rule never triggered in this period.</p>`) +
      `</section>` +
    `</div>`;
  }

  function chartPanel(data, s, rank, sort, headingTag) {
    const sym = esc(data.symbol);
    const h = headingTag || "h1";
    return `<section class="panel chart-panel" aria-labelledby="chart-title">` +
      `<div class="panel-head">` +
        `<div class="chart-title">` +
          `<${h} id="chart-title">${esc(s.name)}</${h}>` +
          `<span class="chip rank">#${rank} by ${esc(SORTS[sort].noun)}</span>` +
          `<span class="chip ${s.position === "long" ? "long" : ""}">${s.position === "long" ? "Holding " + sym : "In cash"}</span>` +
        `</div>` +
        `<div class="key"><span class="key-buy">Buy</span><span class="key-sell">Sell</span><span>Lower pane: P/L</span></div>` +
      `</div>` +
      `<div class="legend" id="legend"></div>` +
      `<div class="chart" id="chart"></div>` +
    `</section>`;
  }

  // Approved explainer text. *word* becomes italic; everything else is escaped.
  function richText(t) { return esc(t).replace(/\*([^*]+)\*/g, "<em>$1</em>"); }

  function about(s, root) {
    const c = CONTENT && CONTENT.strategies[s.id];
    if (!c) return "";
    const intro = CONTENT.categories[s.category];
    const parts = [
      ["How it works", c.how],
      ["Why it's here", c.why],
      ["Where it comes from", c.origin],
      ["What to watch for", c.watch],
    ].filter(([, v]) => v);
    return `<section class="panel about" aria-labelledby="about-title">` +
      `<div class="panel-head"><h2 id="about-title">About ${s.benchmark ? "buy and hold" : "this strategy"}</h2>` +
      `<a class="hint" href="${esc(root)}how-we-test/">How we test</a></div>` +
      `<div class="about-body">` +
        (intro ? `<p class="about-intro">${richText(intro)}</p>` : "") +
        parts.map(([k, v]) => `<div><h3>${k}</h3><p>${richText(v)}</p></div>`).join("") +
      `</div>` +
    `</section>`;
  }

  function howWeTestHtml(n) {
    const h = CONTENT.howWeTest;
    return `<article class="panel prose">` +
      `<h1>${esc(h.title)}</h1>` +
      `<p class="lead">${richText(h.intro.replace("{n}", n))}</p>` +
      h.sections.map((sec) => `<h2>${esc(sec.heading)}</h2><ul>` +
        sec.items.map(([k, v]) => `<li>${k ? `<strong>${esc(k)}:</strong> ` : ""}${richText(v)}</li>`).join("") +
        `</ul>`).join("") +
      `<p class="closing">${richText(h.closing)}</p>` +
    `</article>`;
  }

  // The whole dashboard. selId = null means the home page (shows #1).
  function dashboard(data, selId, sort, root) {
    const list = ranked(data, sort);
    const isHome = !selId || !list.some((x) => x.id === selId);
    const s = isHome ? list[0] : list.find((x) => x.id === selId);
    const rank = list.indexOf(s) + 1;
    const text = isHome ? homeHeadline(data, list, sort) : strategySummary(data, s, rank, list.length, sort);
    return summary(text, isHome) + kpis(data, s) + chartPanel(data, s, rank, sort, isHome ? "h2" : "h1") +
      board(list, s.id, sort, root) + info(s) + about(s, root);
  }

  function sortButtons(sort) {
    return Object.entries(SORTS)
      .map(([k, v]) => `<button type="button" data-sort="${k}" aria-pressed="${k === sort}">${v.label}</button>`).join("");
  }
  function instrument(data) {
    return `<span class="ticker">${esc(data.symbol)}</span><span>Daily, ${niceDate(data.period.start)} to ${niceDate(data.period.end)}</span>` +
      `<span>Updated ${niceDate(data.generated_at.slice(0, 10))}</span>`;
  }
  function assumptions(data) { return esc(data.assumptions.join(" ")); }
  function source(data) { return esc(`Price data: ${data.data_source}.`); }

  return {
    APP_NAME, FREE_LIMIT, DEFAULT_SORT, SORTS,
    pct, fixed, money, tone, esc, niceDate,
    ranked, benchmark, strategyPath,
    homeTitle, homeDescription, strategyTitle, strategyDescription,
    dashboard, sortButtons, instrument, assumptions, source, howWeTestHtml,
  };
});
