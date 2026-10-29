# Strategy Leaderboard (working name)

Free version (Phase 1) of the S&P 500 strategy tracker. Every weekday after the market closes, it downloads SPY's daily prices, backtests 16 popular strategies over the last 12 months, and publishes a website showing which ones worked best.

It runs entirely on GitHub's free tier: GitHub Actions does the daily update and GitHub Pages hosts the site. There is no server or database to pay for.

## What's in here

| Path | What it does |
| --- | --- |
| `engine/strategies.py` | The 16 launch strategies, their rules and default values |
| `engine/indicators.py` | Moving averages, RSI, MACD, Bollinger Bands, Stochastic, etc. |
| `engine/backtest.py` | Simulates each strategy: signals on the close, fills at the next open, no costs |
| `engine/providers.py` | Where price data comes from. Add a provider here to switch data sources |
| `engine/build.py` | Runs everything and writes `site/data/results.json` |
| `site/` | The website (plain HTML, CSS and JavaScript, with TradingView Lightweight Charts) |
| `.github/workflows/update.yml` | The daily job that rebuilds and publishes the site |
| `tests/` | Checks the backtest math, including that no strategy can see future prices |

## Put it online (one-time setup, about 15 minutes)

1. Create a free account at [github.com](https://github.com) if you don't have one.
2. Create a new **public** repository (GitHub Pages is free for public repositories). Name it anything, for example `strategy-leaderboard`.
3. Upload all the files from this folder to the repository, keeping the folder structure. The easiest way is the "uploading an existing file" link on the new repository's page: drag the whole folder contents in, then click **Commit changes**. Make sure the hidden `.github` folder comes along; if your computer hides it, create the file `.github/workflows/update.yml` with GitHub's **Add file > Create new file** button and paste its contents.
4. In the repository, go to **Settings > Pages** and set **Source** to **GitHub Actions**.
5. Go to the **Actions** tab, open **Daily update**, and click **Run workflow**. After two or three minutes it finishes and shows your site's address, which looks like `https://<your-username>.github.io/strategy-leaderboard/`.

From then on it updates itself every weekday evening. If a day's data download fails, the job stops before publishing, so the site keeps showing the last good results.

Later, to use your own domain, add it under **Settings > Pages > Custom domain** and follow GitHub's DNS instructions.

## Previewing without real data

Add `?sample` to the site address (for example `https://<your-username>.github.io/strategy-leaderboard/?sample`) to see the site with made-up sample prices. A yellow banner marks the preview.

## Things to know

- **Data source.** Prices come from Yahoo Finance through the free `yfinance` package. Yahoo's terms limit this data to personal use, so plan to switch to a licensed provider before the paid tier (see the requirements doc, L-03). Switching only means adding a provider in `engine/providers.py`.
- **Scheduled jobs pause on quiet repositories.** GitHub turns off scheduled workflows in public repositories with no activity for 60 days. If the site stops updating, re-enable the workflow from the Actions tab (any commit also resets the clock).
- **App name.** It's set in two places: `APP_NAME` at the top of `site/app.js` and the `<title>` in `site/index.html`.
- **TradingView attribution.** The Lightweight Charts license requires the TradingView logo on the chart and the link in the footer. Leave both in place.

## Running it on your own computer (optional)

Requires Python 3.10 or newer.

```
pip install -r requirements.txt
python -m pytest -q tests
python engine/build.py
cd site && python -m http.server 8000
```

Then open http://localhost:8000.
