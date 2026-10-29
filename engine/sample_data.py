"""Generate a synthetic SPY-like price CSV for local testing and previews.

The numbers are random, not real market data. Usage:
  python engine/sample_data.py sample_spy.csv
"""

import sys

import numpy as np
import pandas as pd


def make(path: str, days: int = 760, seed: int = 7, end=None):
    rng = np.random.default_rng(seed)
    end = pd.Timestamp(end) if end else pd.Timestamp.today().normalize() - pd.offsets.BDay(1)
    dates = pd.bdate_range(end=end, periods=days)
    rets = rng.normal(0.0004, 0.011, days)
    # A couple of regime shifts so strategies differ.
    rets[days // 3: days // 3 + 40] -= 0.004
    rets[-180:-140] -= 0.003
    close = 420 * np.exp(np.cumsum(rets))
    open_ = close * np.exp(rng.normal(0, 0.003, days))
    high = np.maximum(open_, close) * (1 + np.abs(rng.normal(0, 0.004, days)))
    low = np.minimum(open_, close) * (1 - np.abs(rng.normal(0, 0.004, days)))
    pd.DataFrame({"Date": dates.strftime("%Y-%m-%d"), "Open": open_, "High": high,
                  "Low": low, "Close": close}).to_csv(path, index=False, float_format="%.4f")


if __name__ == "__main__":
    make(sys.argv[1] if len(sys.argv) > 1 else "sample_spy.csv")
