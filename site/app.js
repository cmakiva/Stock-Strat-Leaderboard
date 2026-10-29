/* BacktestBoard dashboard — free version (Phase 1).
 * Page markup comes from render.js (shared with the daily pre-render step).
 * This file loads the data, draws the chart, and handles clicks.
 *
 * Addresses:  /                       the #1 strategy
 *             /strategies/<id>/       one strategy (a real page, so search engines can find it)
 * Add ?sample to preview with synthetic data.
 */
(function () {
  "use strict";

  const BB = window.BB;
  const LWC = window.LightweightCharts;
  const app = document.getElementById("app");
  const html = document.documentElement;

  // The site's root address, worked out once from the <base> tag. It works both at
  // https://<user>.github.io/<repo>/ and on a custom domain.
  const baseEl = document.querySelector("base");
  const ROOT = new URL(baseEl ? baseEl.getAttribute("href") : "./", location.href).href;

  const state = { data: null, sort: BB.DEFAULT_SORT, chart: null };

  function cssVar(name) { return getComputedStyle(html).getPropertyValue(name).trim(); }

  // ---------- routing ----------
  function currentId() {
    const rootPath = new URL(ROOT).pathname;
    const rel = location.pathname.startsWith(rootPath) ? location.pathname.slice(rootPath.length) : "";
    const m = rel.match(/^strategies\/([^/]+)\/?$/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function go(id) {
    const url = new URL(id ? BB.strategyPath(id) : "", ROOT);
    url.search = location.search;
    history.pushState(null, "", url.href);
    render();
  }
  // Old #/strategy/<id> links from before strategy pages existed.
  function redirectOldHash() {
    const m = location.hash.match(/^#\/strategy\/(.+)$/);
    if (!m) return;
    const url = new URL(BB.strategyPath(decodeURIComponent(m[1])), ROOT);
    url.search = location.search;
    location.replace(url.href);
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
      priceFormat: { type: "custom", formatter: (v) => BB.pct(v), minMove: 0.01 },
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
        `<span><b>${BB.niceDate(time)}</b></span>` +
        `<span>O <b class="${cls}">${r.k.open.toFixed(2)}</b></span><span>H <b class="${cls}">${r.k.high.toFixed(2)}</b></span>` +
        `<span>L <b class="${cls}">${r.k.low.toFixed(2)}</b></span><span>C <b class="${cls}">${r.k.close.toFixed(2)}</b></span>` +
        `<span>P/L <b class="${BB.tone(r.pl)}">${BB.pct(r.pl)}</b> (${BB.money(start * (1 + r.pl / 100))})</span>`;
    }
    show(last);
    chart.subscribeCrosshairMove((p) => show(p && p.time ? p.time : last));
    state.chart = chart;
  }

  // ---------- render ----------
  function renderToolbar() {
    const seg = document.getElementById("sort");
    seg.innerHTML = BB.sortButtons(state.sort);
    seg.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      state.sort = b.dataset.sort;
      try { localStorage.setItem("sort", state.sort); } catch (e) { /* storage unavailable */ }
      renderToolbar();
      render();
    }));
    const themeBtn = document.getElementById("theme");
    const next = html.dataset.theme === "dark" ? "light" : "dark";
    themeBtn.textContent = next === "light" ? "Light" : "Dark";
    themeBtn.setAttribute("aria-label", `Switch to ${next} theme`);
  }

  function render() {
    const d = state.data;
    const id = currentId();
    const s = id && d.strategies.find((x) => x.id === id);
    app.innerHTML = BB.dashboard(d, s ? s.id : null, state.sort, ROOT);
    document.title = s ? BB.strategyTitle(d, s) : BB.homeTitle(d);
    app.querySelectorAll(".board a[data-id]").forEach((a) => a.addEventListener("click", (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; // let "open in new tab" work
      e.preventDefault();
      go(a.dataset.id);
    }));
    drawChart(s || BB.ranked(d, state.sort)[0]);
  }

  function renderShell(d) {
    const brand = document.getElementById("brand");
    brand.textContent = BB.APP_NAME;
    brand.href = ROOT + location.search;
    brand.addEventListener("click", (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      go(null);
    });
    // Links into the site work from any page, even after the address changes without a reload.
    document.querySelectorAll("a[data-root-link]").forEach((a) => { a.href = new URL(a.dataset.rootLink, ROOT).href; });
    document.getElementById("instrument").innerHTML = BB.instrument(d);
    document.getElementById("assumptions").innerHTML = BB.assumptions(d);
    document.getElementById("source").innerHTML = BB.source(d);
    if (/sample/i.test(d.data_source)) {
      const n = document.getElementById("notice");
      n.innerHTML = "<p>Preview mode: these results use made-up sample prices, not real SPY data.</p>";
      n.hidden = false;
    }
  }

  // ---------- boot ----------
  redirectOldHash();
  try { const saved = localStorage.getItem("sort"); if (saved && BB.SORTS[saved]) state.sort = saved; } catch (e) { /* ignore */ }

  document.getElementById("theme").addEventListener("click", () => {
    html.dataset.theme = html.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("theme", html.dataset.theme); } catch (e) { /* ignore */ }
    renderToolbar();
    if (state.data) render();
  });

  const file = /[?&]sample\b/.test(location.search) ? "data/sample-results.json" : "data/results.json";
  fetch(new URL(file, ROOT), { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => {
      state.data = d;
      renderShell(d);
      renderToolbar();
      render();
      window.addEventListener("popstate", render);
    })
    .catch(() => {
      renderToolbar();
      // Keep any pre-rendered content and just add a note; only replace an empty page.
      const note = `<p class="error">Today's live chart didn't load. Try refreshing in a few minutes.</p>`;
      if (app.querySelector(".kpis")) app.insertAdjacentHTML("afterbegin", note);
      else app.innerHTML = note;
    });
})();
