import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCapitalFlowChart,
  buildTurnoverChart,
  evaluateTrendFromHistory,
  parseEastMoneyCapitalFlowHistoryPayload,
  parseEastMoneyCapitalSnapshotPayload,
  parseSohuHistoryJsonp,
  parseTencentHistoryPayload,
} from "./analysis.js";

function createBar({
  date,
  open,
  close,
  high,
  low,
  volume,
}) {
  return { date, open, close, high, low, volume };
}

function createLiveQuote(overrides = {}) {
  return {
    price: 10.2,
    open: 10.1,
    high: 10.3,
    low: 10.0,
    previousClose: 10,
    changePercent: 1.2,
    volume: 0,
    turnoverRatePercent: null,
    amount: 5200000,
    updatedAt: "2026-04-13T02:30:00.000Z",
    ...overrides,
  };
}

function createQuoteQuality(overrides = {}) {
  return {
    freshness: {
      status: "fresh",
      maxAgeSeconds: 15,
      ageSeconds: 2,
    },
    authenticity: {
      status: "verified",
      primarySource: "qq",
      secondarySource: "sina",
      fallbackUsed: false,
    },
    completeness: {
      status: "complete",
      missingFields: [],
    },
    consistency: {
      status: "pass",
      mismatches: [],
    },
    score: 100,
    degraded: false,
    warnings: [],
    ...overrides,
  };
}

test("parseTencentHistoryPayload extracts qfq daily bars", () => {
  const bars = parseTencentHistoryPayload(
    {
      data: {
        sh513100: {
          qfqday: [
            ["2026-04-10", "1.800", "1.820", "1.830", "1.790", "123456"],
            ["2026-04-11", "1.820", "1.810", "1.835", "1.805", "120000"],
          ],
        },
      },
    },
    "513100",
  );

  assert.deepEqual(bars, [
    createBar({
      date: "2026-04-10",
      open: 1.8,
      close: 1.82,
      high: 1.83,
      low: 1.79,
      volume: 123456,
    }),
    createBar({
      date: "2026-04-11",
      open: 1.82,
      close: 1.81,
      high: 1.835,
      low: 1.805,
      volume: 120000,
    }),
  ]);
});

test("parseSohuHistoryJsonp extracts daily turnover rows", () => {
  const rows = parseSohuHistoryJsonp(
    'historySearchHandler([{"status":0,"hq":[["2026-04-07","1.731","1.732","0.001","0.06%","1.729","1.742","1481582","25726.221","1.57%"],["2026-04-08","1.789","1.833","0.101","5.83%","1.788","1.841","5227474","94695.070","5.52%"]],"stat":[["累计","2026-04-07","2026-04-08","0.102","5.89%","1.729","1.841","6709056","120421.291","7.09%"]]}])',
  );

  assert.deepEqual(rows, [
    { date: "2026-04-07", turnoverRatePercent: 1.57 },
    { date: "2026-04-08", turnoverRatePercent: 5.52 },
  ]);
});

test("buildTurnoverChart returns dates, daily values and moving averages", () => {
  const chart = buildTurnoverChart([
    { date: "2026-04-01", turnoverRatePercent: 1 },
    { date: "2026-04-02", turnoverRatePercent: 2 },
    { date: "2026-04-03", turnoverRatePercent: 3 },
    { date: "2026-04-04", turnoverRatePercent: 4 },
    { date: "2026-04-07", turnoverRatePercent: 5 },
  ]);

  assert.deepEqual(chart.dates, [
    "2026-04-01",
    "2026-04-02",
    "2026-04-03",
    "2026-04-04",
    "2026-04-07",
  ]);
  assert.deepEqual(chart.daily, [1, 2, 3, 4, 5]);
  assert.deepEqual(chart.ma5, [null, null, null, null, 3]);
});

test("parseEastMoneyCapitalFlowHistoryPayload extracts daily main net inflow rows", () => {
  const rows = parseEastMoneyCapitalFlowHistoryPayload({
    data: {
      klines: [
        "2026-04-07,-56900096.0,23094202.0,33805895.0,-68027152.0,11127056.0,1.825,0.83",
        "2026-04-08,-3313424.0,9733833.0,-6420422.0,-12469168.0,9155744.0,1.883,0.53",
      ],
    },
  });

  assert.deepEqual(rows, [
    {
      date: "2026-04-07",
      close: 1.825,
      changePercent: 0.83,
      mainNetInflow: 11127056,
    },
    {
      date: "2026-04-08",
      close: 1.883,
      changePercent: 0.53,
      mainNetInflow: 9155744,
    },
  ]);
});

test("parseEastMoneyCapitalSnapshotPayload extracts real-time main net inflow", () => {
  const snapshot = parseEastMoneyCapitalSnapshotPayload({
    data: {
      f57: "513100",
      f58: "纳指ETF国泰",
      f86: 1776067919,
      f137: 7630894.0,
    },
  });

  assert.equal(snapshot.symbol, "513100");
  assert.equal(snapshot.name, "纳指ETF国泰");
  assert.equal(snapshot.mainNetInflow, 7630894);
  assert.equal(snapshot.updatedAt, "2026-04-13T08:11:59.000Z");
});

test("buildCapitalFlowChart returns dates, bars, MA5 and MA10", () => {
  const chart = buildCapitalFlowChart([
    { date: "2026-04-01", close: 1.8, changePercent: 0.5, mainNetInflow: 100 },
    { date: "2026-04-02", close: 1.82, changePercent: 0.8, mainNetInflow: 200 },
    { date: "2026-04-03", close: 1.81, changePercent: -0.2, mainNetInflow: 300 },
    { date: "2026-04-04", close: 1.83, changePercent: 1.1, mainNetInflow: 400 },
    { date: "2026-04-07", close: 1.86, changePercent: 1.6, mainNetInflow: 500 },
    { date: "2026-04-08", close: 1.85, changePercent: -0.4, mainNetInflow: 600 },
    { date: "2026-04-09", close: 1.84, changePercent: -0.5, mainNetInflow: 700 },
    { date: "2026-04-10", close: 1.83, changePercent: -0.6, mainNetInflow: 800 },
    { date: "2026-04-11", close: 1.82, changePercent: -0.7, mainNetInflow: 900 },
    { date: "2026-04-14", close: 1.81, changePercent: -0.8, mainNetInflow: 1000 },
  ]);

  assert.deepEqual(chart.mainNetInflow, [
    100, 200, 300, 400, 500, 600, 700, 800, 900, 1000,
  ]);
  assert.deepEqual(chart.ma5, [
    null, null, null, null, 300, 400, 500, 600, 700, 800,
  ]);
  assert.deepEqual(chart.ma10, [
    null, null, null, null, null, null, null, null, null, 550,
  ]);
});

test("evaluateTrendFromHistory marks sideways when 3+ sideways rules hit", () => {
  const baseBars = Array.from({ length: 60 }, (_, index) => {
    const price = 10 + (index % 4) * 0.03;
    return createBar({
      date: `2026-02-${String(index + 1).padStart(2, "0")}`,
      open: price,
      close: price + 0.01,
      high: price + 0.08,
      low: price - 0.08,
      volume: 900 + (index % 3) * 15,
    });
  });

  const analysis = evaluateTrendFromHistory(baseBars, {
    price: 10.08,
    open: 10.02,
    high: 10.11,
    low: 9.98,
    previousClose: 10.03,
    changePercent: 0.5,
    volume: 620,
    turnoverRatePercent: null,
    amount: 5200000,
  });

  assert.equal(analysis.trendLabel, "横盘震荡");
  assert.ok(analysis.sidewaysSignals.length >= 3);
  assert.equal(analysis.indicators.rsi.state, "横盘");
});

test("evaluateTrendFromHistory marks uptrend when ma and macd align bullish", () => {
  const risingBars = Array.from({ length: 80 }, (_, index) => {
    const close = 5 + index * 0.12;
    return createBar({
      date: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
      open: close - 0.05,
      close,
      high: close + 0.08,
      low: close - 0.12,
      volume: 1800 + index * 10,
    });
  });

  const analysis = evaluateTrendFromHistory(risingBars, {
    price: 14.7,
    open: 14.55,
    high: 14.82,
    low: 14.5,
    previousClose: 14.42,
    changePercent: 1.94,
    volume: 4200,
    turnoverRatePercent: 3.25,
    amount: 61800000,
  });

  assert.equal(analysis.trendLabel, "上涨趋势");
  assert.equal(analysis.indicators.ma.state, "多头排列");
  assert.equal(analysis.indicators.macd.bias, "偏多");
  assert.match(analysis.summary, /多头|上涨/);
});

test("evaluateTrendFromHistory appends turnover chart without changing trend label", () => {
  const risingBars = Array.from({ length: 80 }, (_, index) => {
    const close = 5 + index * 0.12;
    return createBar({
      date: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
      open: close - 0.05,
      close,
      high: close + 0.08,
      low: close - 0.12,
      volume: 1800 + index * 10,
    });
  });

  const turnoverRows = Array.from({ length: 80 }, (_, index) => ({
    date: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
    turnoverRatePercent: Number((1.2 + index * 0.03).toFixed(2)),
  }));

  const analysis = evaluateTrendFromHistory(
    risingBars,
    createLiveQuote({
      price: 14.7,
      open: 14.55,
      high: 14.82,
      low: 14.5,
      previousClose: 14.42,
      changePercent: 1.94,
      volume: 4200,
      turnoverRatePercent: 3.25,
      amount: 61800000,
    }),
    turnoverRows,
  );

  assert.equal(analysis.trendLabel, "上涨趋势");
  assert.equal(analysis.charts.turnover.daily.length, 80);
  assert.equal(analysis.charts.turnover.ma5.at(-1), 3.51);
});

test("evaluateTrendFromHistory prefers real capital snapshot and appends capital flow chart", () => {
  const bars = Array.from({ length: 80 }, (_, index) => {
    const close = 5 + index * 0.08;
    return createBar({
      date: `2026-03-${String((index % 28) + 1).padStart(2, "0")}`,
      open: close - 0.04,
      close,
      high: close + 0.05,
      low: close - 0.06,
      volume: 1800 + index * 8,
    });
  });

  const analysis = evaluateTrendFromHistory(
    bars,
    createLiveQuote({
      price: 11.5,
      open: 11.4,
      high: 11.6,
      low: 11.2,
      previousClose: 11.3,
      changePercent: 1.6,
      volume: 480000,
      turnoverRatePercent: 2.35,
      amount: 86000000,
      updatedAt: "2026-04-13T08:11:59.000Z",
    }),
    [],
    {
      symbol: "513100",
      name: "纳指ETF国泰",
      mainNetInflow: 7630894,
      updatedAt: "2026-04-13T08:11:59.000Z",
    },
    [
      {
        date: "2026-04-07",
        close: 1.73,
        changePercent: 0.06,
        mainNetInflow: -17798900,
      },
      {
        date: "2026-04-08",
        close: 1.83,
        changePercent: 5.83,
        mainNetInflow: 88022600,
      },
      {
        date: "2026-04-09",
        close: 1.8,
        changePercent: -1.53,
        mainNetInflow: -19469200,
      },
      {
        date: "2026-04-10",
        close: 1.81,
        changePercent: 0.22,
        mainNetInflow: -3873000,
      },
      {
        date: "2026-04-13",
        close: 1.8,
        changePercent: -0.61,
        mainNetInflow: 7630900,
      },
    ],
  );

  assert.equal(analysis.indicators.capital.mainForceNetAmount, 7630894);
  assert.equal(analysis.indicators.capital.mainForceDirection, "净流入");
  assert.equal(analysis.charts.capitalFlow.mainNetInflow.at(-1), 7630900);
  assert.equal(analysis.charts.capitalFlow.ma5.at(-1), 10902480);
});

test("evaluateTrendFromHistory uses intraday progress for standard volume ratio", () => {
  const bars = Array.from({ length: 60 }, (_, index) => {
    const close = 10 + index * 0.01;
    return createBar({
      date: `2026-03-${String((index % 28) + 1).padStart(2, "0")}`,
      open: close - 0.02,
      close,
      high: close + 0.05,
      low: close - 0.05,
      volume: 1000,
    });
  });

  const analysis = evaluateTrendFromHistory(bars, createLiveQuote({
    volume: 50000,
    updatedAt: "2026-04-13T02:30:00.000Z",
  }));

  assert.equal(analysis.indicators.volume.volumeRatio, 2);
  assert.equal(analysis.indicators.volume.state, "放量");
});

test("evaluateTrendFromHistory freezes progress at 0.5 during lunch break", () => {
  const bars = Array.from({ length: 60 }, (_, index) => {
    const close = 8 + index * 0.02;
    return createBar({
      date: `2026-03-${String((index % 28) + 1).padStart(2, "0")}`,
      open: close - 0.02,
      close,
      high: close + 0.05,
      low: close - 0.05,
      volume: 1000,
    });
  });

  const analysis = evaluateTrendFromHistory(bars, createLiveQuote({
    volume: 50000,
    updatedAt: "2026-04-13T04:00:00.000Z",
  }));

  assert.equal(analysis.indicators.volume.volumeRatio, 1);
  assert.equal(analysis.indicators.volume.state, "平量");
});

test("evaluateTrendFromHistory falls back to full-day average when updatedAt is invalid", () => {
  const bars = Array.from({ length: 60 }, (_, index) => {
    const close = 12 + index * 0.03;
    return createBar({
      date: `2026-03-${String((index % 28) + 1).padStart(2, "0")}`,
      open: close - 0.02,
      close,
      high: close + 0.05,
      low: close - 0.05,
      volume: 1000,
    });
  });

  const analysis = evaluateTrendFromHistory(bars, createLiveQuote({
    volume: 120000,
    updatedAt: "invalid-date",
  }));

  assert.equal(analysis.indicators.volume.volumeRatio, 1.2);
  assert.equal(analysis.indicators.volume.state, "放量");
});

test("evaluateTrendFromHistory returns a safe volume ratio when recent average volume is zero", () => {
  const bars = Array.from({ length: 60 }, (_, index) => {
    const close = 6 + index * 0.02;
    return createBar({
      date: `2026-03-${String((index % 28) + 1).padStart(2, "0")}`,
      open: close - 0.02,
      close,
      high: close + 0.05,
      low: close - 0.05,
      volume: index < 54 ? 900 : 0,
    });
  });

  const analysis = evaluateTrendFromHistory(bars, createLiveQuote({
    volume: 50000,
    updatedAt: "2026-04-13T02:30:00.000Z",
  }));

  assert.equal(analysis.indicators.volume.volumeRatio, 1);
  assert.equal(analysis.indicators.volume.state, "平量");
});

test("evaluateTrendFromHistory returns buy advice for bullish alignment", () => {
  const risingBars = Array.from({ length: 80 }, (_, index) => {
    const close = 5 + index * 0.12;
    return createBar({
      date: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
      open: close - 0.05,
      close,
      high: close + 0.08,
      low: close - 0.12,
      volume: 1800 + index * 10,
    });
  });

  const quote = createLiveQuote({
    price: 14.7,
    open: 14.55,
    high: 14.82,
    low: 14.5,
    previousClose: 14.42,
    changePercent: 1.94,
    volume: 4200,
    turnoverRatePercent: 3.25,
    amount: 61800000,
  });
  const analysis = evaluateTrendFromHistory(risingBars, quote);

  assert.equal(analysis.advice.action, "买入");
  assert.match(analysis.advice.confidence, /高|中/);
  assert.ok(analysis.advice.reasonTags.includes("多头排列"));
  assert.ok(analysis.advice.reasonTags.includes("MACD偏多"));
  assert.ok(analysis.advice.targetPrice >= quote.price);
  assert.ok(analysis.advice.stopPrice < quote.price);
  assert.match(analysis.advice.holdingWindow, /3-5个交易日|1-2周/);
});

test("evaluateTrendFromHistory returns sell advice for bearish alignment", () => {
  const fallingBars = Array.from({ length: 80 }, (_, index) => {
    const close = 15 - index * 0.1;
    return createBar({
      date: `2026-02-${String((index % 28) + 1).padStart(2, "0")}`,
      open: close + 0.05,
      close,
      high: close + 0.09,
      low: close - 0.11,
      volume: 2200 + index * 12,
    });
  });

  const quote = createLiveQuote({
    price: 7.2,
    open: 7.35,
    high: 7.38,
    low: 7.12,
    previousClose: 7.48,
    changePercent: -3.74,
    volume: 4800,
    turnoverRatePercent: 4.12,
    amount: 45200000,
  });
  const analysis = evaluateTrendFromHistory(fallingBars, quote);

  assert.equal(analysis.advice.action, "卖出");
  assert.match(analysis.advice.confidence, /高|中/);
  assert.ok(analysis.advice.reasonTags.includes("空头排列"));
  assert.ok(analysis.advice.reasonTags.includes("MACD偏空"));
  assert.ok(analysis.advice.targetPrice <= quote.price);
  assert.ok(analysis.advice.stopPrice > quote.price);
});

test("evaluateTrendFromHistory returns watch advice when sideways signals dominate", () => {
  const baseBars = Array.from({ length: 60 }, (_, index) => {
    const price = 10 + (index % 4) * 0.03;
    return createBar({
      date: `2026-03-${String((index % 28) + 1).padStart(2, "0")}`,
      open: price,
      close: price + 0.01,
      high: price + 0.08,
      low: price - 0.08,
      volume: 900 + (index % 3) * 15,
    });
  });

  const analysis = evaluateTrendFromHistory(
    baseBars,
    createLiveQuote({
      price: 10.08,
      open: 10.02,
      high: 10.11,
      low: 9.98,
      previousClose: 10.03,
      changePercent: 0.5,
      volume: 620,
      amount: 5200000,
    }),
  );

  assert.equal(analysis.advice.action, "观望");
  assert.equal(analysis.advice.confidence, "低");
  assert.equal(analysis.advice.targetPrice, null);
  assert.equal(analysis.advice.stopPrice, null);
});

test("evaluateTrendFromHistory falls back to watch advice when target levels are invalid", () => {
  const bars = Array.from({ length: 80 }, (_, index) => {
    const close = 10 + index * 0.05;
    return createBar({
      date: `2026-04-${String((index % 28) + 1).padStart(2, "0")}`,
      open: close - 0.02,
      close,
      high: close + 0.04,
      low: close - 0.04,
      volume: 1500 + index,
    });
  });

  const analysis = evaluateTrendFromHistory(
    bars,
    createLiveQuote({
      price: 30,
      open: 29.8,
      high: 30.1,
      low: 29.7,
      previousClose: 29.5,
      changePercent: 1.69,
      volume: 6000,
      turnoverRatePercent: 2.1,
      amount: 90000000,
    }),
  );

  assert.equal(analysis.advice.action, "观望");
  assert.equal(analysis.advice.confidence, "低");
  assert.equal(analysis.advice.targetPrice, null);
  assert.equal(analysis.advice.stopPrice, null);
  assert.match(analysis.advice.rationale, /空间不清晰|空间不足/);
});

test("evaluateTrendFromHistory downgrades to low confidence when quote quality is stale", () => {
  const risingBars = Array.from({ length: 80 }, (_, index) => {
    const close = 5 + index * 0.12;
    return createBar({
      date: `2026-05-${String((index % 28) + 1).padStart(2, "0")}`,
      open: close - 0.05,
      close,
      high: close + 0.08,
      low: close - 0.12,
      volume: 1800 + index * 10,
    });
  });

  const analysis = evaluateTrendFromHistory(
    risingBars,
    createLiveQuote({
      price: 14.7,
      changePercent: 1.94,
      updatedAt: "2026-04-14T01:29:30.000Z",
      quality: createQuoteQuality({
        freshness: { status: "stale", maxAgeSeconds: 15, ageSeconds: 40 },
        score: 75,
        degraded: true,
        warnings: ["实时行情已超过15秒未更新"],
      }),
    }),
    [],
    {
      symbol: "159980",
      name: "有色ETF",
      mainNetInflow: 8000000,
      updatedAt: "2026-04-14T01:30:05.000Z",
    },
  );

  assert.equal(analysis.dataQuality.status, "degraded");
  assert.equal(analysis.advice.confidence, "低");
  assert.match(analysis.advice.confidenceReason, /超过15秒未更新/);
});

test("evaluateTrendFromHistory blocks strong recommendation when quote authenticity is invalid", () => {
  const risingBars = Array.from({ length: 80 }, (_, index) => {
    const close = 5 + index * 0.12;
    return createBar({
      date: `2026-06-${String((index % 28) + 1).padStart(2, "0")}`,
      open: close - 0.05,
      close,
      high: close + 0.08,
      low: close - 0.12,
      volume: 1800 + index * 10,
    });
  });

  const analysis = evaluateTrendFromHistory(
    risingBars,
    createLiveQuote({
      price: 14.7,
      changePercent: 1.94,
      quality: createQuoteQuality({
        authenticity: {
          status: "invalid",
          primarySource: "qq",
          secondarySource: "sina",
          fallbackUsed: false,
        },
        consistency: {
          status: "fail",
          mismatches: [{ field: "price", primary: 14.7, secondary: 15.3, tolerance: "0.3%" }],
        },
        score: 45,
        degraded: true,
        warnings: ["主备行情关键字段存在超阈值偏差"],
      }),
    }),
  );

  assert.equal(analysis.dataQuality.status, "blocked");
  assert.equal(analysis.advice.action, "观望");
  assert.equal(analysis.advice.confidence, "低");
  assert.match(analysis.dataQuality.blockingReasons.join(","), /真实性/);
});

test("evaluateTrendFromHistory separates estimated capital from real capital", () => {
  const risingBars = Array.from({ length: 80 }, (_, index) => {
    const close = 5 + index * 0.12;
    return createBar({
      date: `2026-07-${String((index % 28) + 1).padStart(2, "0")}`,
      open: close - 0.05,
      close,
      high: close + 0.08,
      low: close - 0.12,
      volume: 1800 + index * 10,
    });
  });

  const analysis = evaluateTrendFromHistory(
    risingBars,
    createLiveQuote({
      price: 14.7,
      changePercent: 1.94,
      amount: 61800000,
      quality: createQuoteQuality({
        authenticity: {
          status: "partial",
          primarySource: "qq",
          secondarySource: null,
          fallbackUsed: true,
        },
        consistency: {
          status: "warn",
          mismatches: [],
        },
        score: 82,
        degraded: true,
        warnings: ["备用行情源缺失，当前仅能部分验证真实性"],
      }),
    }),
  );

  assert.equal(analysis.indicators.capital.mainForceNetAmountReal, null);
  assert.equal(analysis.indicators.capital.mainForceSourceType, "estimated");
  assert.notEqual(analysis.indicators.capital.mainForceNetAmountEstimated, null);
});
