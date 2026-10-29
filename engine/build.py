"""Fetch data, backtest every strategy, and write the site's results file.

Usage:
  python engine/build.py                                # Yahoo Finance (default)
  python engine/build.py --provider csv --csv spy.csv   # any CSV with Date,Open,High,Low,Close
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backtest import START_BALANCE, TRADING_DAYS, run  # noqa: E402
from providers import get_provider, validate  # noqa: E402
from strategies import STRATEGIES, max_warmup  # noqa: E402

SYMBOL = "SPY"


def build(df, window: int, source_name: str) -> dict:
    validate(df, min_rows=window + max_warmup() + 1)
    window_df = df.iloc[-window:]
    candles = [
        {"time": d.strftime("%Y-%m-%d"), "open": round(r.Open, 2), "high": round(r.High, 2),
         "low": round(r.Low, 2), "close": round(r.Close, 2)}
        for d, r in window_df.iterrows()
    ]

    results = []
    for s in STRATEGIES:
        params = s.defaults()
        entry, exit_ = s.signals(df, params)
        res = run(df, entry, exit_, window)
        buy_rule, sell_rule = s.describe(params)
        results.append({
            "id": s.id,
            "name": s.name,
            "category": s.category,
            "benchmark": s.benchmark,
            "rules": {"buy": buy_rule, "sell": sell_rule},
            "params": [{"key": p.key, "label": p.label, "value": p.default} for p in s.params],
            "metrics": res["metrics"],
            "position": res["position"],
            "equity": [
                {"time": d.strftime("%Y-%m-%d"), "value": round((v / START_BALANCE - 1) * 100, 3)}
                for d, v in zip(res["dates"], res["equity"])
            ],
            "trades": res["trades"],
            "markers": res["markers"],
        })

    bench = next(r for r in results if r["benchmark"])["metrics"]["total_return"]
    for r in results:
        r["metrics"]["vs_benchmark"] = round(r["metrics"]["total_return"] - bench, 2)

    return {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "symbol": SYMBOL,
        "data_source": source_name,
        "start_balance": START_BALANCE,
        "period": {"start": candles[0]["time"], "end": candles[-1]["time"], "days": window},
        "assumptions": [
            "Long only: strategies are either fully invested in SPY or in cash.",
            "Signals use the daily close; trades fill at the next day's open.",
            "No commissions or slippage (fills at the mid between bid and ask).",
            "Prices are adjusted for splits and dividends.",
        ],
        "candles": candles,
        "strategies": results,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", default="yahoo", choices=["yahoo", "csv"])
    ap.add_argument("--csv")
    ap.add_argument("--days", type=int, default=TRADING_DAYS, help="trading days in the backtest window")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "site", "data", "results.json"))
    args = ap.parse_args()

    provider = get_provider(args.provider, args.csv)
    df = provider.fetch(SYMBOL)
    out = build(df, args.days, provider.name)

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    top = sorted(out["strategies"], key=lambda r: r["metrics"]["total_return"], reverse=True)[:3]
    print(f"Wrote {args.out}: {out['period']['start']} to {out['period']['end']}")
    for r in top:
        print(f"  {r['name']}: {r['metrics']['total_return']}%")


if __name__ == "__main__":
    main()
