"""Market data providers.

Every provider returns the same thing: a pandas DataFrame indexed by date
(ascending) with float columns Open, High, Low, Close, adjusted for splits
and dividends. To switch data sources, add a provider here and select it with
the --provider flag in build.py. Nothing else in the app needs to change.
"""

from __future__ import annotations

import pandas as pd

REQUIRED_COLUMNS = ["Open", "High", "Low", "Close"]


def _clean(df: pd.DataFrame) -> pd.DataFrame:
    df = df[REQUIRED_COLUMNS].astype(float)
    df.index = pd.to_datetime(df.index).tz_localize(None).normalize()
    df = df[~df.index.duplicated(keep="last")].sort_index()
    df = df.dropna()
    return df


def validate(df: pd.DataFrame, min_rows: int) -> None:
    """Fail loudly on bad data so a broken refresh never replaces good results."""
    if len(df) < min_rows:
        raise ValueError(f"Need at least {min_rows} daily bars, got {len(df)}")
    if (df[REQUIRED_COLUMNS] <= 0).any().any():
        raise ValueError("Data contains zero or negative prices")
    if ((df["High"] < df[["Open", "Close"]].max(axis=1) - 1e-6)
            | (df["Low"] > df[["Open", "Close"]].min(axis=1) + 1e-6)).any():
        raise ValueError("Data contains bars where high/low don't contain open/close")


class YahooProvider:
    """Free daily data from Yahoo Finance via the yfinance package.

    Note: Yahoo's terms limit this data to personal use. See the Legal section
    of the requirements doc (L-03) before relying on it commercially.
    """

    name = "Yahoo Finance (via yfinance)"

    def fetch(self, symbol: str, years: int = 3) -> pd.DataFrame:
        import yfinance as yf

        raw = yf.Ticker(symbol).history(period=f"{years}y", interval="1d", auto_adjust=True)
        if raw is None or raw.empty:
            raise ValueError(f"No data returned for {symbol}")
        df = _clean(raw)
        # If this runs while the market is open, today's bar is still changing: drop it.
        now_et = pd.Timestamp.now(tz="America/New_York")
        if df.index[-1] == now_et.normalize().tz_localize(None) and now_et.hour * 60 + now_et.minute < 16 * 60 + 15:
            df = df.iloc[:-1]
        return df


class CsvProvider:
    """Reads a CSV with columns Date, Open, High, Low, Close (adjusted prices)."""

    def __init__(self, path: str):
        self.path = path
        self.name = f"CSV file ({path})"

    def fetch(self, symbol: str, years: int = 3) -> pd.DataFrame:
        raw = pd.read_csv(self.path, parse_dates=["Date"], index_col="Date")
        return _clean(raw)


def get_provider(name: str, csv_path: str | None = None):
    if name == "yahoo":
        return YahooProvider()
    if name == "csv":
        if not csv_path:
            raise ValueError("--csv is required with --provider csv")
        return CsvProvider(csv_path)
    raise ValueError(f"Unknown provider: {name}")
