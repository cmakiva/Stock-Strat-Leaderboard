"""Long-only daily backtester.

Rules (requirements doc F-19 and Launch strategy list assumptions):
- Signals are read on each day's close.
- Orders fill at the next day's open, with zero commission and zero slippage.
- Fully invested when holding (fractional shares), all cash when not.
- A signal on the day before the window starts can fill on the window's first open,
  so buy-and-hold enters on day one.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

START_BALANCE = 10_000.0
TRADING_DAYS = 252


def run(df: pd.DataFrame, entry: pd.Series, exit_: pd.Series, window: int) -> dict:
    entry = entry.fillna(False).astype(bool).to_numpy()
    exit_ = exit_.fillna(False).astype(bool).to_numpy()
    opens, closes = df.Open.to_numpy(), df.Close.to_numpy()
    dates = df.index

    start = len(df) - window          # first bar in the backtest window
    cash, shares = START_BALANCE, 0.0
    equity = np.empty(window)
    trades, markers = [], []
    open_trade = None
    in_market_days = 0

    for i in range(start, len(df)):
        # Act on yesterday's signal at today's open.
        prev = i - 1
        if shares == 0 and entry[prev]:
            shares, cash = cash / opens[i], 0.0
            open_trade = {"entry_date": dates[i], "entry_price": opens[i]}
            markers.append(_marker(dates[i], "buy", opens[i]))
        elif shares > 0 and exit_[prev]:
            cash, shares = shares * opens[i], 0.0
            trades.append(_close_trade(open_trade, dates[i], opens[i], closed=True))
            markers.append(_marker(dates[i], "sell", opens[i]))
            open_trade = None
        if shares > 0:
            in_market_days += 1
        equity[i - start] = cash + shares * closes[i]

    if open_trade is not None:
        trades.append(_close_trade(open_trade, dates[-1], closes[-1], closed=False))

    return {
        "equity": equity,
        "dates": dates[start:],
        "trades": trades,
        "markers": markers,
        "metrics": _metrics(equity, trades, in_market_days, window),
        "position": "long" if shares > 0 else "cash",
    }


def _marker(date, side: str, price: float) -> dict:
    return {"time": date.strftime("%Y-%m-%d"), "side": side, "price": round(float(price), 2)}


def _close_trade(t: dict, date, price: float, closed: bool) -> dict:
    return {
        "entry_date": t["entry_date"].strftime("%Y-%m-%d"),
        "entry_price": round(float(t["entry_price"]), 2),
        "exit_date": date.strftime("%Y-%m-%d"),
        "exit_price": round(float(price), 2),
        "return_pct": round(float(price / t["entry_price"] - 1) * 100, 2),
        "closed": closed,
    }


def _metrics(equity: np.ndarray, trades: list, in_market_days: int, window: int) -> dict:
    total = equity[-1] / START_BALANCE - 1
    years = window / TRADING_DAYS
    annual = (1 + total) ** (1 / years) - 1 if total > -1 else -1.0

    peak = np.maximum.accumulate(np.concatenate([[START_BALANCE], equity]))[1:]
    max_dd = float(((equity - peak) / peak).min())

    daily = np.diff(np.concatenate([[START_BALANCE], equity])) / np.concatenate([[START_BALANCE], equity[:-1]])
    sd = daily.std(ddof=1)
    sharpe = float(daily.mean() / sd * math.sqrt(TRADING_DAYS)) if sd > 1e-12 else None

    closed = [t for t in trades if t["closed"]]
    win_rate = (sum(t["return_pct"] > 0 for t in closed) / len(closed)) if closed else None

    return {
        "total_return": round(float(total) * 100, 2),
        "annual_return": round(float(annual) * 100, 2),
        "max_drawdown": round(max_dd * 100, 2),
        "sharpe": round(sharpe, 2) if sharpe is not None else None,
        "win_rate": round(win_rate * 100, 1) if win_rate is not None else None,
        "trades": len(trades),
        "closed_trades": len(closed),
        "time_in_market": round(in_market_days / window * 100, 1),
        "ending_balance": round(float(equity[-1]), 2),
    }
