"""Technical indicators. Each takes pandas Series and returns a Series aligned to the input."""

from __future__ import annotations

import pandas as pd


def sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(n, min_periods=n).mean()


def ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False, min_periods=n).mean()


def rsi(close: pd.Series, n: int = 14) -> pd.Series:
    """Wilder's RSI."""
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    avg_loss = loss.ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    rs = avg_gain / avg_loss
    out = 100 - 100 / (1 + rs)
    # No losses in the window -> RSI is 100.
    out = out.where(avg_loss != 0, 100.0)
    return out.where(avg_gain.notna())


def macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    line = ema(close, fast) - ema(close, slow)
    sig = line.ewm(span=signal, adjust=False, min_periods=signal).mean()
    return line, sig


def bollinger(close: pd.Series, n: int = 20, k: float = 2.0):
    mid = sma(close, n)
    sd = close.rolling(n, min_periods=n).std(ddof=0)
    return mid - k * sd, mid, mid + k * sd


def prior_high(high: pd.Series, n: int) -> pd.Series:
    """Highest high of the previous n bars (excluding today)."""
    return high.rolling(n, min_periods=n).max().shift(1)


def prior_low(low: pd.Series, n: int) -> pd.Series:
    """Lowest low of the previous n bars (excluding today)."""
    return low.rolling(n, min_periods=n).min().shift(1)


def stochastic(high: pd.Series, low: pd.Series, close: pd.Series, k: int = 14, d: int = 3):
    hh = high.rolling(k, min_periods=k).max()
    ll = low.rolling(k, min_periods=k).min()
    pct_k = 100 * (close - ll) / (hh - ll)
    pct_d = sma(pct_k, d)
    return pct_k, pct_d


def roc(close: pd.Series, n: int) -> pd.Series:
    return close / close.shift(n) - 1


def crosses_above(a: pd.Series, b) -> pd.Series:
    """True on the bar where a moves from <= b to > b."""
    b_prev = b.shift(1) if isinstance(b, pd.Series) else b
    return (a > b) & (a.shift(1) <= b_prev)


def crosses_below(a: pd.Series, b) -> pd.Series:
    """True on the bar where a moves from >= b to < b."""
    b_prev = b.shift(1) if isinstance(b, pd.Series) else b
    return (a < b) & (a.shift(1) >= b_prev)
