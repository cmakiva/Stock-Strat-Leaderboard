/* Written content for BacktestBoard, approved by Cody on Oct 29, 2026.
 * Source draft: "BacktestBoard strategy explainers (draft for review)" doc.
 * *Asterisks* mark italic text (book titles). {n} is replaced with the number of strategies tested.
 * Edit text here; the daily build and the browser both read this file.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BB_CONTENT = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // One short introduction per family of strategies, shown above each strategy's explainer.
  const categories = {
    "Moving average": "A moving average is the average closing price over a set number of recent days, recalculated each day. It smooths out daily noise so the trend is easier to see.",
    "RSI": "The Relative Strength Index (RSI) compares the size of recent up days with recent down days and scales the result from 0 to 100. High readings mean prices have risen quickly; low readings mean they've fallen quickly.",
    "MACD": "MACD (Moving Average Convergence Divergence) is the gap between a fast and a slow exponential moving average, usually the 12-day and 26-day. When the gap is positive, the short-term trend is running ahead of the longer one. A 9-day average of MACD, called the signal line, smooths it further. Gerald Appel created MACD in the late 1970s, and 12, 26 and 9 are the most common settings.",
    "Bollinger Bands": "Bollinger Bands draw a 20-day moving average with a band above and below it, each two standard deviations away. The bands widen when prices swing more and narrow when they calm down, so they show what counts as an unusually high or low price right now. John Bollinger developed them in the 1980s and suggested confirming band signals with other indicators rather than trading the bands alone.",
    "Breakout": "Breakout strategies buy when the price climbs above its highest point of the last several weeks, on the theory that a new high is often the start of a trend. They sell when the price falls to a recent low.",
  };

  const strategies = {
    "buy-hold": {
      how: "Buy SPY on the first day of the period and never sell. It makes no decisions, so it shows what the market itself returned.",
      why: "Every other strategy is measured against it. A strategy that trades in and out is only worth the effort if it beats simply holding, or gets a similar return with smaller drops along the way.",
      watch: "Buy and hold rides every decline in full. Its max drawdown is the market's own worst drop over the period.",
    },
    "golden-cross": {
      how: "Buy when the 50-day moving average rises above the 200-day moving average, a crossing known as a golden cross. Sell on the reverse, a death cross, when the 50-day falls back below the 200-day.",
      origin: "The 50-day and 200-day pairing is the most commonly cited version of this signal, roughly two months of trading against ten.",
      watch: "Moving averages lag by design, so by the time the lines cross, much of the move has already happened. In sideways markets the lines can cross back and forth, producing losing \"whipsaw\" trades.",
    },
    "trend-filter": {
      how: "Stay invested while the price is above its 200-day moving average and move to cash when it falls below. The idea is to hold during uptrends and step aside during long declines.",
      watch: "When prices hover near the average, the rule can flip in and out many times, and each round trip can give up a little ground.",
    },
    "dip-below-ma": {
      how: "The opposite bet to the trend filter: buy when the price drops below its 200-day moving average, expecting the drop to reverse, and sell once it recovers above the average.",
      origin: "This is a simple contrarian variation included for comparison, not a named classic.",
      watch: "If the decline keeps going, the strategy stays invested through it, since it only sells on a recovery.",
    },
    "ema-cross": {
      how: "The same idea as the golden cross, using faster averages. An exponential moving average (EMA) gives more weight to recent days, so it reacts to price changes sooner than a simple average.",
      watch: "Faster signals catch turns earlier but also produce more false signals than slower combinations.",
    },
    "triple-ma": {
      how: "Uses three averages, short, medium and long, and buys only when all three line up in order, with the shortest on top. That alignment is read as a confirmed uptrend.",
      origin: "The 4-, 9- and 18-day combination is often credited to R. C. Allen, though sources don't agree on its origin or date.",
      watch: "Waiting for all three lines to agree makes entries late, and in choppy markets the lines tangle and untangle often.",
    },
    "rsi-levels": {
      how: "Buy when RSI drops below 30, a level traditionally called \"oversold,\" and sell when it rises above 70, \"overbought.\" The bet is that sharp moves tend to snap back.",
      origin: "J. Welles Wilder introduced RSI in 1978 in his book *New Concepts in Technical Trading Systems*. The 14-day setting and the 30 and 70 levels are the standard ones.",
      watch: "In a strong trend, RSI can stay oversold or overbought for a long time, so buying because the price \"fell too far\" can mean buying into a continuing decline.",
    },
    "rsi2-pullback": {
      how: "A short-term version that buys brief dips inside an uptrend. It uses a very fast 2-day RSI to spot sharp one- or two-day drops, but only buys when the price is above its 200-day average, and sells as soon as the price bounces.",
      origin: "Larry Connors and Cesar Alvarez made this setup well known in their 2008 book *Short Term Trading Strategies That Work*. Published versions vary slightly in their exact levels.",
      watch: "It aims for many small gains. When a dip turns into a larger decline, it holds until the price recovers above its exit average, which can mean one large loss offsetting several small wins.",
    },
    "macd-signal": {
      how: "Buy when the MACD line crosses above its signal line, a sign that upward momentum is picking up. Sell when it crosses back below.",
      watch: "The signal line reacts quickly, so this version tends to trade often and is prone to false signals when prices move sideways.",
    },
    "macd-zero": {
      how: "Buy when the MACD line crosses above zero, meaning the 12-day average has moved above the 26-day, and sell when it crosses back below. It reads the trend's direction rather than its short-term momentum.",
      watch: "It trades less often than the signal-line version, but both of its averages lag, so entries and exits come after the turn.",
    },
    "bb-reversion": {
      how: "Buy when the price closes below the lower band, an unusually low price for current conditions, and sell once it returns above the middle line. The bet is that stretched prices tend to drift back toward their average.",
      watch: "In a sharp sell-off, prices can keep closing below the lower band for days, so buying the first close below it can mean buying early.",
    },
    "bb-breakout": {
      how: "The opposite reading of the same bands: a close above the upper band is treated as the start of a strong move rather than a stretched price. Buy on that close and sell when the price falls back below the middle line.",
      watch: "Breakouts don't always follow through. When one fades, this strategy buys near a short-term high and sells soon after for a small loss.",
    },
    "donchian": {
      how: "Buy when the price closes above its highest high of the previous 20 trading days, and sell when it closes below its lowest low of the previous 10 days. The shorter exit gets out of a fading trend sooner than waiting for a full reversal.",
      origin: "Richard Donchian, an early pioneer of systematic trend following, used a \"four-week rule\" that bought new four-week highs and sold new four-week lows. The 20-day entry with a 10-day exit is the same pairing the Turtle traders used in their shorter-term System 1.",
      watch: "Like all trend-following rules, it gives up some gains at each turn and can take a string of small losses when prices move sideways.",
    },
    "turtle": {
      how: "A slower breakout that waits for a 55-day high to buy and a 20-day low to sell. It trades less often and aims to catch only larger trends.",
      origin: "In 1983, commodities trader Richard Dennis, who had argued with fellow trader William Eckhardt over whether trading could be taught, trained a group of newcomers nicknamed the Turtles. Their longer-term System 2 entered on 55-day breakouts and exited on 20-day lows.",
      watch: "The Turtles traded many futures markets, long and short, with strict position sizing and stops. This version keeps only the entry and exit rules, applied to SPY, so its results aren't the Turtles' results.",
    },
    "stochastic": {
      how: "The stochastic oscillator shows where today's close sits within the high-to-low range of the last 14 days, from 0 at the bottom of the range to 100 at the top. That reading is called %K, and its 3-day average is %D. The strategy buys when %K turns up through %D while %K is below 20, and sells when %K turns down through %D while %K is above 80.",
      origin: "George Lane developed the stochastic oscillator in the late 1950s. The 20 and 80 levels are common conventions rather than fixed rules.",
      watch: "Like RSI, it can stay at extreme readings during strong trends. Because it needs a crossover at an extreme level, it may trade only a few times a year.",
    },
    "momentum": {
      how: "Rate of change measures how much the price has moved, in percent, over a set number of days. When the 50-day rate of change turns positive, the price is higher than it was 50 trading days ago, and the strategy buys. It sells when the reading turns negative.",
      origin: "Momentum and rate of change are standard technical indicators. A cross above zero is commonly read as a buy signal and a cross below zero as a sell signal.",
      watch: "It is a trend-following rule, so it lags turns in the market and can flip back and forth when prices go nowhere for a while.",
    },
  };

  const howWeTest = {
    title: "How we test",
    intro: "Every weekday after the market closes, BacktestBoard replays {n} well-known trading strategies on SPY, the ETF that tracks the S&P 500, over the most recent 12 months of trading. The rules below are the same for every strategy, so the results compare like with like.",
    sections: [
      {
        heading: "The test",
        items: [
          ["Data", "SPY daily prices, adjusted for splits and dividends."],
          ["Period", "the last 252 trading days, about one calendar year. Earlier prices are used only to warm up indicators like the 200-day moving average, so every strategy is ready on day one."],
          ["Starting balance", "$10,000."],
          ["Positions", "long only. A strategy is either fully invested in SPY or fully in cash. It never shorts or uses leverage."],
          ["Timing", "each rule is checked on the day's closing price. When a rule triggers, the trade happens at the next day's opening price, so no strategy acts on a price it couldn't have known."],
          ["Costs", "none. We assume no commissions and that every trade fills at the midpoint between the bid and ask."],
        ],
      },
      {
        heading: "The numbers on each page",
        items: [
          ["Total return", "how much $10,000 grew or shrank over the 12 months. A trade still open at the end is valued at the last close."],
          ["Vs. buy and hold", "the strategy's return minus the return from simply buying SPY on day one and holding it."],
          ["Max drawdown", "the largest drop from a high point to a later low point. It shows how painful the worst stretch was."],
          ["Sharpe ratio", "average daily return divided by how much daily returns swung, scaled to a year. Higher means steadier gains. We don't subtract a risk-free rate."],
          ["Win rate", "the share of completed trades that made money. Open trades aren't counted."],
          ["Trades", "how many times the strategy bought in the period."],
        ],
      },
      {
        heading: "What these results can't tell you",
        items: [
          [null, "A strategy's past results don't predict its future results, and the top strategy changes often."],
          [null, "Twelve months is a short window, and SPY is one market. A strategy that led this year may trail in a different market or year."],
          [null, "Real trading has costs, taxes and imperfect fills that these tests leave out."],
        ],
      },
    ],
    closing: "BacktestBoard is for education and research. Nothing on this site is a recommendation to buy or sell any security.",
  };

  return { categories, strategies, howWeTest };
});
