/* Strategy leaderboard dashboard — free version (Phase 1).
 * Reads data/results.json (written daily by engine/build.py).
 * The main chart shows the #1 strategy; clicking any row in the leaderboard loads it instead.
 * URL: #/strategy/<id> selects a strategy. Add ?sample to preview with synthetic data.
 */
(function () {
  "use strict";

  const APP_NAME = "Strategy Leaderboard"; // working name; change when the name is decided
  const FREE_LIMIT = 10;
  const LWC = window.LightweightCharts;

  const SORTS = {
    total_return: { label: "Total return", noun: "total return", fmt: (m) => pct(m.total_return), tone: (m) => tone(m.total_return) },
    max_drawdown: { label: "Drawdown", noun: "smallest drawdown", fmt: (m) => pct(m.max_drawdown, false), tone: () => "" },
    sharpe: { label: "Sharpe", noun: "Sharpe ratio", fmt: (m) => fixed(m.sharpe), tone: (m) => tone(m.sharpe) },
    win_rate: { label: "Win rate", noun: "win rate", fmt: (m) => (m.win_rate == null ? "n/a" : m.win_rate.toFixed(0) + "%"), tone: () => "" },
  };

  const state = { data: null, sort: "total_return", chart: null };
  const app = document.getElementById("app");
  const html = document.documentElement;

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
  function cssVar(name) { return getComputedStyle(html).getPropertyValue(name).trim(); }

  // ---------- data helpers ----------
  function ranked() {
    const key = state.sort;
    return state.data.strategies.slice().sort((a, b) => {
      const av = a.metrics[key], bv = b.metrics[key];
      if (av == null && bv == null) return b.metrics.total_return - a.metrics.total_return;
      if (av == null) return 1;
      if (bv == null) return -1;
      return bv - av || b.metrics.total_return - a.metrics.total_return;
    });
  }
  function selectedId(list) {
    const m = location.hash.match(/^#\/strategy\/(.+)$/);
    const id = m && decodeURIComponent(m[1]);
    return list.some((s) => s.id === id) ? id : list[0].id;
  }

  // ---------- pieces ----------
  function sparkline(equity) {
    const w = 64, h = 28, pad = 2;
    const vals = equity.map((p) => p.value);
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    const span = hi - lo || 1;
    const x = (i) => pad + (i / (vals.length - 1)) * (w - pad * 2);
    const y = (v) => pad + (1 - (v - lo) / span) * (h - pad * 2);
    const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const end = vals[vals.length - 1];
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2="${w}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="var(--line)" stroke-width="1"/>
      <polyline points="${pts}" fill="none" stroke="var(--${end > 0 ? "gain" : end < 0 ? "loss" : "muted"})" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
    </svg>`;
  }

  function kpis(s) {
    const m = s.metrics;
    const start = state.data.start_balance;
    const items = [
      ["Total return", `<span class="${tone(m.total_return)}">${pct(m.total_return)}</span>`],
      [`${money(start)} became`, money(m.ending_balance)],
      ["Vs. buy and hold", `<span class="${tone(m.vs_benchmark)}">${pct(m.vs_benchmark)}</span>`],
      ["Max drawdown", pct(m.max_drawdown, false)],
      ["Sharpe ratio", fixed(m.sharpe)],
      ["Win rate", m.win_rate == null ? "n/a" : `${m.win_rate.toFixed(0)}%<small>${m.closed_trades} closed</small>`],
    ];
    return `<dl class="kpis">${items.map(([k, v]) => `<div class="panel kpi"><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
  }

  function board(list, selId) {
    const s = SORTS[state.sort];
    const top = list.slice(0, FREE_LIMIT);
    return `<aside class="panel board" aria-labelledby="board-title">
      <div class="panel-head"><h2 id="board-title">Top ${top.length} strategies</h2><span class="hint">12-month ${esc(s.noun)}</span></div>
      <ol>${top.map((r, i) => `<li><button type="button" data-id="${esc(r.id)}" aria-current="${r.id === selId}">
          <span class="b-rank">${i + 1}</span>
          <span class="b-name">${esc(r.name)}<span class="b-cat">${r.benchmark ? "Benchmark" : esc(r.category)}</span></span>
          ${sparkline(r.equity)}
          <span class="b-val ${s.tone(r.metrics)}">${s.fmt(r.metrics)}</span>
        </button></li>`).join("")}</ol>
      ${list.length > FREE_LIMIT ? `<div class="board-foot">Top ${FREE_LIMIT} of ${list.length} strategies tested.</div>` : ""}
    </aside>`;
  }

  function info(s) {
    const settings = s.params.length
      ? `<div class="settings">${s.params.map((p) => `<span>${esc(p.label)} <b class="num">${p.value}</b></span>`).join("")}</div>`
      : `<p class="muted">None</p>`;
    const trades = s.trades.slice().reverse();
    return `<div class="info">
      <section class="panel" aria-labelledby="rules-title">
        <div class="panel-head"><h2 id="rules-title">Rules</h2><span class="hint">${esc(s.category)}</span></div>
        <div class="rules">
          <div><h3>Buy when</h3><p>${esc(s.rules.buy)}</p></div>
          <div><h3>Sell when</h3><p>${esc(s.rules.sell)}</p></div>
          <div><h3>Settings</h3>${settings}</div>
        </div>
      </section>
      <section class="panel" aria-labelledby="trades-title">
        <div class="panel-head"><h2 id="trades-title">Trades</h2><span class="hint">${s.trades.length} in the last 12 months</span></div>
        ${trades.length ? `<div class="trades-wrap"><table class="trades">
          <thead><tr><th>Bought</th><th class="col-hide">Price</th><th>Sold</th><th class="col-hide">Price</th><th>Return</th></tr></thead>
          <tbody>${trades.map((t) => `<tr>
            <td>${niceDate(t.entry_date)}</td><td class="col-hide">${t.entry_price.toFixed(2)}</td>
            <td>${t.closed ? niceDate(t.exit_date) : "Open"}</td><td class="col-hide">${t.closed ? t.exit_price.toFixed(2) : t.exit_price.toFixed(2) + " last"}</td>
            <td class="${tone(t.return_pct)}">${pct(t.return_pct)}</td></tr>`).join("")}</tbody>
        </table></div>` : `<p class="empty">No trades: the buy rule never triggered in this period.</p>`}
      </section>
    </div>`;
  }

  function chartPanel(s, rank) {
    const sym = esc(state.data.symbol);
    return `<section class="panel chart-panel" aria-labelledby="chart-title">
      <div class="panel-head">
        <div class="chart-title">
          <h1 id="chart-title">${esc(s.name)}</h1>
          <span class="chip rank">#${rank} by ${esc(SORTS[state.sort].noun)}</span>
          <span class="chip ${s.position === "long" ? "long" : ""}">${s.position === "long" ? "Holding " + sym : "In cash"}</span>
        </div>
        <div class="key"><span class="key-buy">Buy</span><span class="key-sell">Sell</span><span>Lower pane: P/L</span></div>
      </div>
      <div class="legend" id="legend"></div>
      <div class="chart" id="chart"></div>
    </section>`;
  }

  // ---------- chart ----------
  function drawChart(s) {
    if (state.chart) { state.chart.remove(); state.chart = null; }
    const el = document.getElementById("chart");
    const legend = document.getElementById("legend");
    const c = {
      panel: cssVar("--panel"), muted: cssVar("--muted"), line: cssVar("--line"),
      gain: cssVar("--gain"), loss: cssVar("--loss"), gainSoft: cssVar("--gain-soft"), lossSoft: cssVar("--loss-soft"),
    };
    const chart = LWC.createChart(el, {
      autoSize: true,
      layout: {
        background: { type: "solid", color: c.panel },
        textColor: c.muted,
        fontFamily: "'Source Sans 3', system-ui, sans-serif",
        fontSize: 12,
        attributionLogo: true,
        panes: { separatorColor: c.line, enableResize: false },
      },
      grid: { vertLines: { color: c.line }, horzLines: { color: c.line } },
      rightPriceScale: { borderColor: c.line },
      timeScale: { borderColor: c.line },
      crosshair: { mode: LWC.CrosshairMode.Normal },
    });

    const candles = chart.addSeries(LWC.CandlestickSeries, {
      upColor: c.gain, downColor: c.loss, borderVisible: false,
      wickUpColor: c.gain, wickDownColor: c.loss, priceLineVisible: false,
    });
    candles.setData(state.data.candles);
    candles.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.06 } });
    const labels = el.clientWidth >= 700;
    LWC.createSeriesMarkers(candles, s.markers.map((m) => m.side === "buy"
      ? { time: m.time, position: "belowBar", shape: "arrowUp", color: c.gain, text: labels ? "Buy" : "" }
      : { time: m.time, position: "aboveBar", shape: "arrowDown", color: c.loss, text: labels ? "Sell" : "" }));

    const pl = chart.addSeries(LWC.BaselineSeries, {
      baseValue: { type: "price", price: 0 },
      topLineColor: c.gain, topFillColor1: c.gainSoft, topFillColor2: c.gainSoft,
      bottomLineColor: c.loss, bottomFillColor1: c.lossSoft, bottomFillColor2: c.lossSoft,
      lineWidth: 2, priceLineVisible: false,
      priceFormat: { type: "custom", formatter: (v) => pct(v), minMove: 0.01 },
    }, 1);
    // Flat at 0% (no trade yet) is neither a gain nor a loss: draw it neutral.
    pl.setData(s.equity.map((p) => p.value === 0 ? { ...p, topLineColor: c.muted, bottomLineColor: c.muted } : p));
    const panes = chart.panes();
    if (panes[1]) panes[1].setHeight(Math.max(90, Math.round(el.clientHeight * 0.28)));
    chart.timeScale().fitContent();

    const rows = new Map(state.data.candles.map((k, i) => [k.time, { k, pl: s.equity[i].value }]));
    const start = state.data.start_balance;
    const last = state.data.candles[state.data.candles.length - 1].time;
    function show(time) {
      const r = rows.get(time);
      if (!r) return;
      const cls = r.k.close >= r.k.open ? "gain" : "loss";
      legend.innerHTML =
        `<span><b>${niceDate(time)}</b></span>` +
        `<span>O <b class="${cls}">${r.k.open.toFixed(2)}</b></span><span>H <b class="${cls}">${r.k.high.toFixed(2)}</b></span>` +
        `<span>L <b class="${cls}">${r.k.low.toFixed(2)}</b></span><span>C <b class="${cls}">${r.k.close.toFixed(2)}</b></span>` +
        `<span>P/L <b class="${tone(r.pl)}">${pct(r.pl)}</b> (${money(start * (1 + r.pl / 100))})</span>`;
    }
    show(last);
    chart.subscribeCrosshairMove((p) => show(p && p.time ? p.time : last));
    state.chart = chart;
  }

  // ---------- render ----------
  function renderToolbar() {
    const seg = document.getElementById("sort");
    seg.innerHTML = Object.entries(SORTS)
      .map(([k, v]) => `<button type="button" data-sort="${k}" aria-pressed="${k === state.sort}">${v.label}</button>`).join("");
    seg.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      state.sort = b.dataset.sort;
      try { localStorage.setItem("sort", state.sort); } catch (e) { /* storage unavailable */ }
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
      renderToolbar();
      render();
    }));
    const themeBtn = document.getElementById("theme");
    const next = html.dataset.theme === "dark" ? "light" : "dark";
    themeBtn.textContent = next === "light" ? "Light" : "Dark";
    themeBtn.setAttribute("aria-label", `Switch to ${next} theme`);
  }

  function render() {
    const list = ranked();
    const id = selectedId(list);
    const s = list.find((x) => x.id === id);
    app.innerHTML = kpis(s) + chartPanel(s, list.indexOf(s) + 1) + board(list, id) + info(s);
    app.querySelectorAll(".board button").forEach((b) => b.addEventListener("click", () => {
      location.hash = `#/strategy/${encodeURIComponent(b.dataset.id)}`;
    }));
    drawChart(s);
  }

  function renderShell(d) {
    document.title = APP_NAME;
    document.getElementById("brand").textContent = APP_NAME;
    document.getElementById("instrument").innerHTML =
      `<span class="ticker">${esc(d.symbol)}</span><span>Daily, ${niceDate(d.period.start)} to ${niceDate(d.period.end)}</span>` +
      `<span>Updated ${niceDate(d.generated_at.slice(0, 10))}</span>`;
    document.getElementById("assumptions").textContent = d.assumptions.join(" ");
    document.getElementById("source").textContent = `Price data: ${d.data_source}.`;
    if (/sample/i.test(d.data_source)) {
      const n = document.getElementById("notice");
      n.innerHTML = "<p>Preview mode: these results use made-up sample prices, not real SPY data.</p>";
      n.hidden = false;
    }
  }

  // ---------- boot ----------
  try { const saved = localStorage.getItem("sort"); if (saved && SORTS[saved]) state.sort = saved; } catch (e) { /* ignore */ }

  document.getElementById("theme").addEventListener("click", () => {
    html.dataset.theme = html.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("theme", html.dataset.theme); } catch (e) { /* ignore */ }
    renderToolbar();
    if (state.data) render();
  });

  const file = /[?&]sample\b/.test(location.search) ? "data/sample-results.json" : "data/results.json";
  fetch(file, { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => {
      state.data = d;
      renderShell(d);
      renderToolbar();
      render();
      window.addEventListener("hashchange", render);
    })
    .catch(() => {
      renderToolbar();
      app.innerHTML = `<p class="error">Today's results didn't load. The daily update may still be running, so try again in a few minutes.</p>`;
    });
})();
