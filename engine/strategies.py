"""The launch strategy library (requirements doc: Launch strategy list).

Each strategy has default parameter values (editable by paid users in Phase 2)
and a signals() function returning two boolean Series aligned to the data:
  entry: True on bars where the strategy wants to buy (if not already holding)
  exit:  True on bars where the strategy wants to sell (if holding)
Signals are read on the daily close; the backtester fills at the next day's open.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

import pandas as pd

from indicators import (
    bollinger, crosses_above, crosses_below, ema, macd, prior_high, prior_low,
    roc, rsi, sma, stochastic,
)


@dataclass
class Param:
    key: str
    label: str
    default: float


@dataclass
class Strategy:
    id: str
    name: str
    category: str
    buy_rule: str          # format string using param keys
    sell_rule: str
    params: list[Param]
    signals: Callable[[pd.DataFrame, dict], tuple[pd.Series, pd.Series]]
    benchmark: bool = False
    warmup: Callable[[dict], int] = field(default=lambda p: 0)

    def defaults(self) -> dict:
        return {p.key: p.default for p in self.params}

    def describe(self, p: dict) -> tuple[str, str]:
        fmt = {k: (int(v) if float(v).is_integer() else v) for k, v in p.items()}
        return self.buy_rule.format(**fmt), self.sell_rule.format(**fmt)


def _i(x) -> int:
    return int(round(x))


# ---------- signal functions ----------

def buy_hold(df, p):
    return pd.Series(True, index=df.index), pd.Series(False, index=df.index)


def ma_cross(df, p):
    fast, slow = sma(df.Close, _i(p["fast"])), sma(df.Close, _i(p["slow"]))
    return crosses_above(fast, slow), crosses_below(fast, slow)


def trend_filter(df, p):
    ma = sma(df.Close, _i(p["length"]))
    return crosses_above(df.Close, ma), crosses_below(df.Close, ma)


def dip_below_ma(df, p):
    ma = sma(df.Close, _i(p["length"]))
    return crosses_below(df.Close, ma), crosses_above(df.Close, ma)


def ema_cross(df, p):
    fast, slow = ema(df.Close, _i(p["fast"])), ema(df.Close, _i(p["slow"]))
    return crosses_above(fast, slow), crosses_below(fast, slow)


def triple_ma(df, p):
    a, b, c = (sma(df.Close, _i(p[k])) for k in ("short", "mid", "long"))
    return (a > b) & (b > c), a < b


def rsi_levels(df, p):
    r = rsi(df.Close, _i(p["length"]))
    return crosses_below(r, p["buy_level"]), crosses_above(r, p["sell_level"])


def rsi2_pullback(df, p):
    r = rsi(df.Close, _i(p["length"]))
    trend = sma(df.Close, _i(p["trend_ma"]))
    exit_ma = sma(df.Close, _i(p["exit_ma"]))
    return (r < p["buy_level"]) & (df.Close > trend), df.Close > exit_ma


def macd_signal(df, p):
    line, sig = macd(df.Close, _i(p["fast"]), _i(p["slow"]), _i(p["signal"]))
    return crosses_above(line, sig), crosses_below(line, sig)


def macd_zero(df, p):
    line, _ = macd(df.Close, _i(p["fast"]), _i(p["slow"]), 9)
    return crosses_above(line, 0), crosses_below(line, 0)


def bb_reversion(df, p):
    lower, mid, _ = bollinger(df.Close, _i(p["length"]), p["std"])
    return df.Close < lower, df.Close > mid


def bb_breakout(df, p):
    _, mid, upper = bollinger(df.Close, _i(p["length"]), p["std"])
    return df.Close > upper, df.Close < mid


def channel_breakout(df, p):
    return (df.Close > prior_high(df.High, _i(p["entry_days"])),
            df.Close < prior_low(df.Low, _i(p["exit_days"])))


def stoch(df, p):
    k, d = stochastic(df.High, df.Low, df.Close, _i(p["k"]), _i(p["d"]))
    return (crosses_above(k, d) & (k < p["buy_level"]),
            crosses_below(k, d) & (k > p["sell_level"]))


def momentum(df, p):
    r = roc(df.Close, _i(p["lookback"]))
    return crosses_above(r, 0), crosses_below(r, 0)


# ---------- library ----------

STRATEGIES: list[Strategy] = [
    Strategy("buy-hold", "Buy and hold", "Benchmark",
             "Buy on the first day of the period", "Never sell", [], buy_hold, benchmark=True),
    Strategy("golden-cross", "Golden cross", "Moving average",
             "{fast}-day SMA crosses above {slow}-day SMA",
             "{fast}-day SMA crosses below {slow}-day SMA",
             [Param("fast", "Fast MA", 50), Param("slow", "Slow MA", 200)], ma_cross,
             warmup=lambda p: p["slow"]),
    Strategy("trend-filter", "Trend filter", "Moving average",
             "Close crosses above {length}-day SMA", "Close crosses below {length}-day SMA",
             [Param("length", "MA length", 200)], trend_filter, warmup=lambda p: p["length"]),
    Strategy("dip-below-ma", "Dip below 200-day MA", "Moving average",
             "Close crosses below {length}-day SMA", "Close crosses back above {length}-day SMA",
             [Param("length", "MA length", 200)], dip_below_ma, warmup=lambda p: p["length"]),
    Strategy("ema-cross", "EMA crossover", "Moving average",
             "{fast}-day EMA crosses above {slow}-day EMA",
             "{fast}-day EMA crosses below {slow}-day EMA",
             [Param("fast", "Fast EMA", 20), Param("slow", "Slow EMA", 50)], ema_cross,
             warmup=lambda p: 3 * p["slow"]),
    Strategy("triple-ma", "Triple moving average", "Moving average",
             "{short}-day > {mid}-day > {long}-day SMA", "{short}-day SMA falls below {mid}-day SMA",
             [Param("short", "Short MA", 4), Param("mid", "Middle MA", 9), Param("long", "Long MA", 18)],
             triple_ma, warmup=lambda p: p["long"]),
    Strategy("rsi-levels", "RSI oversold/overbought", "RSI",
             "RSI({length}) crosses below {buy_level}", "RSI({length}) crosses above {sell_level}",
             [Param("length", "RSI length", 14), Param("buy_level", "Buy level", 30),
              Param("sell_level", "Sell level", 70)], rsi_levels, warmup=lambda p: 10 * p["length"]),
    Strategy("rsi2-pullback", "RSI(2) pullback", "RSI",
             "RSI({length}) below {buy_level} while close is above {trend_ma}-day SMA",
             "Close above {exit_ma}-day SMA",
             [Param("length", "RSI length", 2), Param("buy_level", "Buy level", 10),
              Param("trend_ma", "Trend MA", 200), Param("exit_ma", "Exit MA", 5)],
             rsi2_pullback, warmup=lambda p: p["trend_ma"]),
    Strategy("macd-signal", "MACD signal crossover", "MACD",
             "MACD({fast},{slow}) line crosses above its {signal}-day signal line",
             "MACD line crosses below the signal line",
             [Param("fast", "Fast", 12), Param("slow", "Slow", 26), Param("signal", "Signal", 9)],
             macd_signal, warmup=lambda p: 4 * p["slow"]),
    Strategy("macd-zero", "MACD zero line", "MACD",
             "MACD({fast},{slow}) line crosses above 0", "MACD line crosses below 0",
             [Param("fast", "Fast", 12), Param("slow", "Slow", 26)],
             macd_zero, warmup=lambda p: 4 * p["slow"]),
    Strategy("bb-reversion", "Bollinger mean reversion", "Bollinger Bands",
             "Close below lower band ({length}-day, {std} std. dev.)", "Close above middle band",
             [Param("length", "Length", 20), Param("std", "Std. deviations", 2)],
             bb_reversion, warmup=lambda p: p["length"]),
    Strategy("bb-breakout", "Bollinger breakout", "Bollinger Bands",
             "Close above upper band ({length}-day, {std} std. dev.)", "Close below middle band",
             [Param("length", "Length", 20), Param("std", "Std. deviations", 2)],
             bb_breakout, warmup=lambda p: p["length"]),
    Strategy("donchian", "Donchian breakout", "Breakout",
             "Close above the prior {entry_days}-day high", "Close below the prior {exit_days}-day low",
             [Param("entry_days", "Entry days", 20), Param("exit_days", "Exit days", 10)],
             channel_breakout, warmup=lambda p: max(p["entry_days"], p["exit_days"]) + 1),
    Strategy("turtle", "Turtle breakout", "Breakout",
             "Close above the prior {entry_days}-day high", "Close below the prior {exit_days}-day low",
             [Param("entry_days", "Entry days", 55), Param("exit_days", "Exit days", 20)],
             channel_breakout, warmup=lambda p: max(p["entry_days"], p["exit_days"]) + 1),
    Strategy("stochastic", "Stochastic", "Oscillator",
             "%K({k}) crosses above %D({d}) below {buy_level}",
             "%K crosses below %D above {sell_level}",
             [Param("k", "%K", 14), Param("d", "%D", 3), Param("buy_level", "Buy level", 20),
              Param("sell_level", "Sell level", 80)], stoch, warmup=lambda p: p["k"] + p["d"]),
    Strategy("momentum", "Momentum (rate of change)", "Momentum",
             "{lookback}-day rate of change crosses above 0",
             "{lookback}-day rate of change crosses below 0",
             [Param("lookback", "Lookback days", 50)], momentum, warmup=lambda p: p["lookback"] + 1),
]


def max_warmup() -> int:
    return int(max(s.warmup(s.defaults()) for s in STRATEGIES))
