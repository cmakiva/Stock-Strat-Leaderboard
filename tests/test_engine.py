import os
import sys

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "engine"))

from backtest import START_BALANCE, run  # noqa: E402
from build import build  # noqa: E402
from indicators import crosses_above, rsi, sma  # noqa: E402
from sample_data import make  # noqa: E402
from strategies import STRATEGIES  # noqa: E402


def frame(opens, closes):
    idx = pd.bdate_range("2025-01-01", periods=len(opens))
    o, c = np.array(opens, float), np.array(closes, float)
    return pd.DataFrame({"Open": o, "High": np.maximum(o, c) + 1, "Low": np.minimum(o, c) - 1, "Close": c}, index=idx)


@pytest.fixture(scope="module")
def sample(tmp_path_factory):
    p = tmp_path_factory.mktemp("d") / "spy.csv"
    make(str(p), end="2026-10-21")
    return pd.read_csv(p, parse_dates=["Date"], index_col="Date")


def test_buy_hold_matches_price_change():
    df = frame([100, 101, 102, 103, 104, 105], [100.5, 101.5, 102.5, 103.5, 104.5, 110])
    s = next(s for s in STRATEGIES if s.id == "buy-hold")
    e, x = s.signals(df, {})
    res = run(df, e, x, window=5)
    # Buys at the first window bar's open (101), ends at last close (110).
    assert res["metrics"]["total_return"] == pytest.approx((110 / 101 - 1) * 100, abs=0.01)
    assert res["markers"] == [{"time": df.index[1].strftime("%Y-%m-%d"), "side": "buy", "price": 101.0}]


def test_fills_happen_next_open():
    opens = [10, 10, 20, 20, 40, 40, 40]
    closes = [10, 10, 20, 20, 40, 40, 40]
    df = frame(opens, closes)
    entry = pd.Series([False, True, False, False, False, False, False], index=df.index)
    exit_ = pd.Series([False, False, False, True, False, False, False], index=df.index)
    res = run(df, entry, exit_, window=6)
    t = res["trades"][0]
    assert (t["entry_price"], t["exit_price"], t["closed"]) == (20.0, 40.0, True)
    assert res["metrics"]["total_return"] == 100.0
    assert res["metrics"]["win_rate"] == 100.0
    assert res["equity"][-1] == pytest.approx(2 * START_BALANCE)


def test_open_trade_marked_to_market():
    df = frame([10, 10, 10, 12], [10, 10, 11, 15])
    entry = pd.Series([False, True, False, False], index=df.index)
    res = run(df, entry, pd.Series(False, index=df.index), window=3)
    assert res["trades"][0]["closed"] is False
    assert res["metrics"]["win_rate"] is None
    assert res["metrics"]["total_return"] == 50.0


def test_drawdown():
    df = frame([100] * 5, [100, 100, 120, 90, 110])
    entry = pd.Series([True] + [False] * 4, index=df.index)
    res = run(df, entry, pd.Series(False, index=df.index), window=4)
    assert res["metrics"]["max_drawdown"] == -25.0


def test_indicators():
    s = pd.Series(np.arange(1, 31, dtype=float))
    assert sma(s, 3).iloc[-1] == 29
    assert rsi(s, 14).iloc[-1] == 100
    a = pd.Series([1, 2, 3.0])
    assert crosses_above(a, 1.5).tolist() == [False, True, False]


def test_no_lookahead(sample):
    """Changing tomorrow's prices must not change any result up to today."""
    cut = len(sample) - 30
    altered = sample.copy()
    altered.iloc[cut + 1:] *= 1.3
    for s in STRATEGIES:
        p = s.defaults()
        a = run(sample, *s.signals(sample, p), window=252)
        b = run(altered, *s.signals(altered, p), window=252)
        n = 252 - 30
        np.testing.assert_allclose(a["equity"][:n], b["equity"][:n], err_msg=s.id)


def test_full_build(sample):
    out = build(sample, 252, "test")
    assert len(out["strategies"]) == 16
    assert len(out["candles"]) == 252
    ids = {r["id"] for r in out["strategies"]}
    assert len(ids) == 16
    for r in out["strategies"]:
        assert len(r["equity"]) == 252
        assert r["metrics"]["trades"] >= (1 if r["benchmark"] else 0)
        for m in r["markers"]:
            assert out["period"]["start"] <= m["time"] <= out["period"]["end"]
    bench = next(r for r in out["strategies"] if r["benchmark"])
    assert bench["metrics"]["vs_benchmark"] == 0


def test_rejects_short_data(sample):
    with pytest.raises(ValueError):
        build(sample.iloc[-300:], 252, "test")
