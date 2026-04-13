import { fetchQuoteBySymbol, getSecIdBySymbol } from "./quote.js";

const GBK_DECODER = new TextDecoder("gb18030");

function average(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value, digits = 3) {
  return Number(value.toFixed(digits));
}

function emaSeries(values, period) {
  const multiplier = 2 / (period + 1);
  const result = [];
  let previous = values[0] ?? 0;

  for (const value of values) {
    previous = result.length === 0
      ? value
      : (value - previous) * multiplier + previous;
    result.push(previous);
  }

  return result;
}

function movingAverageSeries(values, period) {
  return values.map((_, index) => {
    if (index + 1 < period) {
      return null;
    }

    return average(values.slice(index + 1 - period, index + 1));
  });
}

function nullableMovingAverageSeries(values, period, digits = 2) {
  return values.map((value, index) => {
    if (value == null || index + 1 < period) {
      return null;
    }

    const section = values.slice(index + 1 - period, index + 1);
    if (section.some((item) => item == null)) {
      return null;
    }

    return round(average(section), digits);
  });
}

function standardDeviation(values) {
  if (!values.length) {
    return 0;
  }

  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function rsiSeries(values, period = 14) {
  const result = Array(values.length).fill(null);

  if (values.length <= period) {
    return result;
  }

  let gains = 0;
  let losses = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    if (change >= 0) {
      gains += change;
    } else {
      losses -= change;
    }
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;
  result[period] = averageLoss === 0
    ? 100
    : 100 - (100 / (1 + averageGain / averageLoss));

  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    averageGain = ((averageGain * (period - 1)) + gain) / period;
    averageLoss = ((averageLoss * (period - 1)) + loss) / period;
    result[index] = averageLoss === 0
      ? 100
      : 100 - (100 / (1 + averageGain / averageLoss));
  }

  return result;
}

function determineCandleType(bar) {
  const body = Math.abs(bar.close - bar.open);
  const range = Math.max(bar.high - bar.low, 0.0001);
  const bodyRatio = body / range;

  if (bodyRatio < 0.12) {
    return "十字星";
  }

  if (bar.close > bar.open && bodyRatio > 0.6) {
    return "大阳";
  }

  if (bar.close < bar.open && bodyRatio > 0.6) {
    return "大阴";
  }

  return "小阴小阳";
}

function createMaState(maValues, latestClose) {
  const [ma5, ma10, ma20, ma60] = maValues;
  const spread = Math.max(...maValues) - Math.min(...maValues);

  if (ma5 > ma10 && ma10 > ma20 && ma20 > ma60) {
    return {
      state: "多头排列",
      bias: "偏多",
      value: maValues.map((value) => round(value, 3)),
      detail: "MA5 > MA10 > MA20 > MA60",
    };
  }

  if (ma5 < ma10 && ma10 < ma20 && ma20 < ma60) {
    return {
      state: "空头排列",
      bias: "偏空",
      value: maValues.map((value) => round(value, 3)),
      detail: "MA5 < MA10 < MA20 < MA60",
    };
  }

  return {
    state: spread / latestClose < 0.03 ? "粘合缠绕" : "分化震荡",
    bias: "中性",
    value: maValues.map((value) => round(value, 3)),
    detail: spread / latestClose < 0.03 ? "多周期均线间距收敛" : "多周期均线方向不一致",
  };
}

function createMacdState(difSeries, deaSeries, macdSeries) {
  const lastIndex = difSeries.length - 1;
  const previousIndex = Math.max(0, lastIndex - 1);
  const dif = difSeries[lastIndex];
  const dea = deaSeries[lastIndex];
  const macd = macdSeries[lastIndex];
  const previousDif = difSeries[previousIndex];
  const previousDea = deaSeries[previousIndex];

  let cross = "延续";
  if (previousDif <= previousDea && dif > dea) {
    cross = "金叉";
  } else if (previousDif >= previousDea && dif < dea) {
    cross = "死叉";
  }

  return {
    state: cross,
    bias: dif >= dea ? "偏多" : "偏空",
    zeroAxis: dif >= 0 ? "零轴上方" : "零轴下方",
    value: {
      dif: round(dif, 4),
      dea: round(dea, 4),
      macd: round(macd, 4),
    },
  };
}

function createBollState(closeSeries) {
  const recent = closeSeries.slice(-20);
  const middle = average(recent);
  const deviation = standardDeviation(recent);
  const upper = middle + deviation * 2;
  const lower = middle - deviation * 2;
  const widthPercent = middle === 0 ? 0 : ((upper - lower) / middle) * 100;
  const previous = closeSeries.slice(-21, -1);
  const previousMiddle = average(previous);
  const previousDeviation = standardDeviation(previous);
  const previousWidthPercent = previousMiddle === 0
    ? 0
    : (((previousMiddle + previousDeviation * 2) - (previousMiddle - previousDeviation * 2)) / previousMiddle) * 100;
  const latestClose = closeSeries.at(-1) ?? 0;

  let position = "中轨附近";
  if (latestClose >= upper) {
    position = "贴近上轨";
  } else if (latestClose <= lower) {
    position = "贴近下轨";
  } else if (latestClose > middle) {
    position = "中轨上方";
  } else if (latestClose < middle) {
    position = "中轨下方";
  }

  return {
    state: widthPercent <= previousWidthPercent ? "收口" : "开口",
    position,
    value: {
      upper: round(upper, 3),
      middle: round(middle, 3),
      lower: round(lower, 3),
      widthPercent: round(widthPercent, 2),
    },
  };
}

function createRsiState(closeSeries) {
  const series = rsiSeries(closeSeries, 14);
  const latest = series.at(-1) ?? 50;

  let state = "横盘";
  let bias = "中性";
  if (latest > 60) {
    state = "强势";
    bias = "偏多";
  } else if (latest > 50) {
    state = "上涨";
    bias = "偏多";
  } else if (latest < 40) {
    state = "弱势";
    bias = "偏空";
  } else if (latest < 50) {
    state = "下跌";
    bias = "偏空";
  }

  return {
    state,
    bias,
    value: round(latest, 2),
    series: series.map((value) => (value == null ? null : round(value, 2))),
  };
}

function normalizeRealtimeVolume(volume) {
  return volume / 100;
}

function getChinaMinutes(updatedAt) {
  const timestamp = Date.parse(updatedAt);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  const chinaDate = new Date(timestamp + (8 * 60 * 60 * 1000));
  return chinaDate.getUTCHours() * 60 + chinaDate.getUTCMinutes();
}

function getTradingProgress(updatedAt) {
  const minutes = getChinaMinutes(updatedAt);

  if (minutes == null) {
    return null;
  }

  const morningOpen = 9 * 60 + 30;
  const morningClose = 11 * 60 + 30;
  const afternoonOpen = 13 * 60;
  const afternoonClose = 15 * 60;
  const minProgress = 5 / 240;

  if (minutes < morningOpen) {
    return minProgress;
  }

  if (minutes <= morningClose) {
    return Math.max(minProgress, (minutes - morningOpen) / 240);
  }

  if (minutes < afternoonOpen) {
    return 120 / 240;
  }

  if (minutes <= afternoonClose) {
    return (120 + (minutes - afternoonOpen)) / 240;
  }

  return 1;
}

function createVolumeState(bars, liveQuote) {
  const recentVolumes = bars.slice(-6, -1).map((bar) => bar.volume);
  const averageVolume = average(recentVolumes);
  const normalizedLiveVolume = normalizeRealtimeVolume(liveQuote.volume);
  const tradingProgress = getTradingProgress(liveQuote.updatedAt);
  const referenceVolume = tradingProgress == null
    ? averageVolume
    : averageVolume * tradingProgress;
  const volumeRatio = referenceVolume <= 0 ? 1 : normalizedLiveVolume / referenceVolume;

  let state = "平量";
  if (volumeRatio >= 1.2) {
    state = "放量";
  } else if (volumeRatio <= 0.8) {
    state = "缩量";
  }

  let relation = "量价平衡";
  if (liveQuote.changePercent > 0 && volumeRatio >= 1) {
    relation = "价涨量增";
  } else if (liveQuote.changePercent < 0 && volumeRatio >= 1) {
    relation = "价跌量增";
  } else if (Math.abs(liveQuote.changePercent) < 1 && volumeRatio < 0.85) {
    relation = "无量震荡";
  }

  return {
    state,
    relation,
    volumeRatio: round(volumeRatio, 2),
    averageVolume: round(averageVolume, 0),
  };
}

function createPatternState(bars, liveQuote, sidewaysSignals) {
  const latest = bars.at(-1);
  const previous20 = bars.slice(-21, -1);
  const highest20 = Math.max(...previous20.map((bar) => bar.high));
  const lowest20 = Math.min(...previous20.map((bar) => bar.low));

  let shape = "整理";
  if (liveQuote.price > highest20) {
    shape = "突破";
  } else if (liveQuote.price < lowest20) {
    shape = "破位";
  } else if (sidewaysSignals.length >= 3) {
    shape = "横盘";
  }

  return {
    candleType: determineCandleType(latest),
    pattern: shape,
  };
}

function buildSidewaysSignals({ boll, ma, volume, bars, rsi, liveQuote }) {
  const recentBars = bars.slice(-20);
  const highest = Math.max(...recentBars.map((bar) => bar.high));
  const lowest = Math.min(...recentBars.map((bar) => bar.low));
  const wavePercent = liveQuote.price === 0 ? 0 : ((highest - lowest) / liveQuote.price) * 100;
  const signals = [];

  if (boll.state === "收口" && boll.value.widthPercent < 8) {
    signals.push("BOLL带收口变窄");
  }

  if (ma.state === "粘合缠绕") {
    signals.push("均线粘合缠绕");
  }

  if (volume.state === "缩量") {
    signals.push("成交量持续萎缩");
  }

  if (wavePercent < 5) {
    signals.push("股价波动幅度<5%");
  }

  if (rsi.value >= 40 && rsi.value <= 60) {
    signals.push("RSI在40-60之间");
  }

  return signals;
}

function buildSummary(trendLabel, indicators, sidewaysSignals, patternState, volumeState) {
  if (trendLabel === "横盘震荡") {
    return `当前更接近横盘震荡，命中 ${sidewaysSignals.join("、")}，且K线形态偏${patternState.candleType}。`;
  }

  if (trendLabel === "上涨趋势") {
    return `当前更接近上涨趋势，${indicators.ma.state}、MACD ${indicators.macd.state}/${indicators.macd.zeroAxis}，RSI 处于 ${indicators.rsi.state} 区间，量价关系表现为${volumeState.relation}。`;
  }

  return `当前更接近下跌趋势，${indicators.ma.state}、MACD ${indicators.macd.state}/${indicators.macd.zeroAxis}，RSI 处于 ${indicators.rsi.state} 区间，量价关系表现为${volumeState.relation}。`;
}

export function parseTencentHistoryPayload(payload, symbol) {
  const exchangePrefix = getSecIdBySymbol(symbol).startsWith("1.") ? "sh" : "sz";
  const rows = payload?.data?.[`${exchangePrefix}${symbol}`]?.qfqday
    ?? payload?.data?.[`${exchangePrefix}${symbol}`]?.day;

  if (!rows?.length) {
    throw new Error("历史K线数据为空");
  }

  return rows.map((row) => ({
    date: row[0],
    open: Number(row[1]),
    close: Number(row[2]),
    high: Number(row[3]),
    low: Number(row[4]),
    volume: Number(row[5]),
  }));
}

export function parseSohuHistoryJsonp(rawText) {
  const matched = rawText.trim().match(/^historySearchHandler\((.+)\)$/);

  if (!matched) {
    throw new Error("历史换手率接口返回格式异常");
  }

  const payload = JSON.parse(matched[1]);
  const rows = payload?.[0]?.hq;

  if (!rows?.length) {
    throw new Error("历史换手率数据为空");
  }

  return rows.map((row) => {
    return {
      date: row[0],
      turnoverRatePercent: row[9] ? round(Number(String(row[9]).replace("%", "")), 2) : null,
    };
  });
}

export function buildTurnoverChart(rows) {
  const daily = rows.map((row) => row.turnoverRatePercent);

  return {
    dates: rows.map((row) => row.date),
    daily,
    ma5: nullableMovingAverageSeries(daily, 5),
    ma10: nullableMovingAverageSeries(daily, 10),
    ma20: nullableMovingAverageSeries(daily, 20),
    ma60: nullableMovingAverageSeries(daily, 60),
  };
}

export function parseEastMoneyCapitalSnapshotPayload(payload) {
  const raw = payload?.data;

  if (!raw?.f57 || !raw?.f58 || raw?.f86 == null || raw?.f137 == null) {
    throw new Error("主力资金实时接口返回格式异常");
  }

  return {
    symbol: String(raw.f57),
    name: String(raw.f58),
    mainNetInflow: round(Number(raw.f137), 0),
    updatedAt: new Date(Number(raw.f86) * 1000).toISOString(),
  };
}

export function parseEastMoneyCapitalFlowHistoryPayload(payload) {
  const rows = payload?.data?.klines;

  if (!rows?.length) {
    throw new Error("历史主力资金数据为空");
  }

  return rows.map((row) => {
    const fields = String(row).split(",");

    return {
      date: fields[0],
      close: round(Number(fields[6]), 3),
      changePercent: round(Number(fields[7]), 2),
      mainNetInflow: round(Number(fields[5]), 0),
    };
  });
}

export function buildCapitalFlowChart(rows) {
  const mainNetInflow = rows.map((row) => row.mainNetInflow);

  return {
    dates: rows.map((row) => row.date),
    mainNetInflow,
    ma5: nullableMovingAverageSeries(mainNetInflow, 5, 0),
    ma10: nullableMovingAverageSeries(mainNetInflow, 10, 0),
  };
}

export function evaluateTrendFromHistory(
  bars,
  liveQuote,
  turnoverRows = [],
  capitalSnapshot = null,
  capitalFlowRows = [],
) {
  if (bars.length < 60) {
    throw new Error("历史K线数量不足，无法分析趋势");
  }

  const closes = bars.map((bar) => bar.close);
  const ma5Series = movingAverageSeries(closes, 5);
  const ma10Series = movingAverageSeries(closes, 10);
  const ma20Series = movingAverageSeries(closes, 20);
  const ma60Series = movingAverageSeries(closes, 60);
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const difSeries = ema12.map((value, index) => value - ema26[index]);
  const deaSeries = emaSeries(difSeries, 9);
  const macdSeries = difSeries.map((value, index) => (value - deaSeries[index]) * 2);

  const ma = createMaState([
    ma5Series.at(-1) ?? closes.at(-1) ?? 0,
    ma10Series.at(-1) ?? closes.at(-1) ?? 0,
    ma20Series.at(-1) ?? closes.at(-1) ?? 0,
    ma60Series.at(-1) ?? closes.at(-1) ?? 0,
  ], liveQuote.price);
  const macd = createMacdState(difSeries, deaSeries, macdSeries);
  const boll = createBollState(closes);
  const rsi = createRsiState(closes);
  const volume = createVolumeState(bars, liveQuote);
  const sidewaysSignals = buildSidewaysSignals({ boll, ma, volume, bars, rsi, liveQuote });
  const pattern = createPatternState(bars, liveQuote, sidewaysSignals);

  let trendLabel = "横盘震荡";
  if (sidewaysSignals.length >= 3) {
    trendLabel = "横盘震荡";
  } else if (ma.bias === "偏多" && macd.bias === "偏多" && rsi.bias === "偏多") {
    trendLabel = "上涨趋势";
  } else if (ma.bias === "偏空" && macd.bias === "偏空" && rsi.bias === "偏空") {
    trendLabel = "下跌趋势";
  } else if (liveQuote.changePercent >= 0) {
    trendLabel = "上涨趋势";
  } else {
    trendLabel = "下跌趋势";
  }

  const turnoverRatePercent = liveQuote.turnoverRatePercent == null
    ? null
    : round(liveQuote.turnoverRatePercent, 2);
  const capitalFlowEstimate = liveQuote.amount * (liveQuote.changePercent / 100);
  const mainForceNetAmount = capitalSnapshot?.mainNetInflow == null
    ? round(capitalFlowEstimate, 0)
    : round(capitalSnapshot.mainNetInflow, 0);
  const mainForceDirection = mainForceNetAmount >= 0
    ? capitalSnapshot ? "净流入" : "净流入估算"
    : capitalSnapshot ? "净流出" : "净流出估算";

  return {
    trendLabel,
    indicators: {
      ma,
      macd,
      boll,
      rsi: {
        state: rsi.value >= 40 && rsi.value <= 60 ? "横盘" : rsi.state,
        bias: rsi.bias,
        value: rsi.value,
      },
      volume,
      pattern,
      capital: {
        turnoverRatePercent,
        mainForceNetAmount,
        mainForceDirection,
      },
    },
    sidewaysSignals,
    summary: buildSummary(trendLabel, { ma, macd, rsi }, sidewaysSignals, pattern, volume),
    charts: {
      candles: bars.map((bar) => ({
        date: bar.date,
        open: bar.open,
        close: bar.close,
        high: bar.high,
        low: bar.low,
        volume: bar.volume,
      })),
      ma: {
        ma5: ma5Series.map((value) => (value == null ? null : round(value, 3))),
        ma10: ma10Series.map((value) => (value == null ? null : round(value, 3))),
        ma20: ma20Series.map((value) => (value == null ? null : round(value, 3))),
        ma60: ma60Series.map((value) => (value == null ? null : round(value, 3))),
      },
      macd: {
        dif: difSeries.map((value) => round(value, 4)),
        dea: deaSeries.map((value) => round(value, 4)),
        histogram: macdSeries.map((value) => round(value, 4)),
      },
      boll: {
        upper: bars.map((_, index) => {
          if (index < 19) {
            return null;
          }
          const section = closes.slice(index - 19, index + 1);
          const middle = average(section);
          const std = standardDeviation(section);
          return round(middle + std * 2, 3);
        }),
        middle: ma20Series.map((value) => (value == null ? null : round(value, 3))),
        lower: bars.map((_, index) => {
          if (index < 19) {
            return null;
          }
          const section = closes.slice(index - 19, index + 1);
          const middle = average(section);
          const std = standardDeviation(section);
          return round(middle - std * 2, 3);
        }),
      },
      rsi: rsi.series,
      turnover: buildTurnoverChart(turnoverRows),
      capitalFlow: buildCapitalFlowChart(capitalFlowRows),
    },
  };
}

export async function fetchHistoricalBarsBySymbol(symbol, limit = 120) {
  const exchangePrefix = getSecIdBySymbol(symbol).startsWith("1.") ? "sh" : "sz";
  const response = await fetch(
    `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${exchangePrefix}${symbol},day,,,${limit},qfq`,
    {
      headers: {
        Referer: "https://gu.qq.com/",
        "User-Agent": "Mozilla/5.0",
      },
      signal: AbortSignal.timeout(8000),
    },
  );

  if (!response.ok) {
    throw new Error(`历史K线接口请求失败: ${response.status}`);
  }

  const payload = await response.json();
  return parseTencentHistoryPayload(payload, symbol);
}

export async function fetchTurnoverHistoryBySymbol(symbol, limit = 120) {
  const response = await fetch(
    `https://q.stock.sohu.com/hisHq?code=cn_${symbol}&stat=1&order=D&period=d&callback=historySearchHandler&rt=jsonp`,
    {
      headers: {
        Referer: `https://q.stock.sohu.com/cn/${symbol}/lshq.shtml`,
        "User-Agent": "Mozilla/5.0",
      },
      signal: AbortSignal.timeout(8000),
    },
  );

  if (!response.ok) {
    throw new Error(`历史换手率接口请求失败: ${response.status}`);
  }

  const payload = GBK_DECODER.decode(await response.arrayBuffer());
  const rows = parseSohuHistoryJsonp(payload)
    .sort((left, right) => left.date.localeCompare(right.date));

  return rows.slice(-limit);
}

async function fetchCapitalSnapshotBySymbol(symbol) {
  const secid = getSecIdBySymbol(symbol);
  const fields = [
    "f57",
    "f58",
    "f135",
    "f136",
    "f137",
    "f138",
    "f139",
    "f140",
    "f141",
    "f142",
    "f143",
    "f144",
    "f145",
    "f146",
    "f147",
    "f148",
    "f149",
    "f86",
  ];
  const response = await fetch(
    `https://emdatah5.eastmoney.com/dc/ZJLX/getZJLXData?secid=${secid}&fields=${fields.join(",")}&ut=`,
    {
      headers: {
        Referer: `https://emdatah5.eastmoney.com/dc/zjlx/stock?fc=${secid}`,
        "User-Agent": "Mozilla/5.0",
      },
      signal: AbortSignal.timeout(8000),
    },
  );

  if (!response.ok) {
    throw new Error(`主力资金实时接口请求失败: ${response.status}`);
  }

  const payload = await response.json();
  return parseEastMoneyCapitalSnapshotPayload(payload);
}

async function fetchCapitalFlowHistoryBySymbol(symbol, limit = 80) {
  const secid = getSecIdBySymbol(symbol);
  const response = await fetch(
    `https://emdatah5.eastmoney.com/dc/ZJLX/getDBHistoryData?secid=${secid}&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56,f62,f63&ut=`,
    {
      headers: {
        Referer: `https://emdatah5.eastmoney.com/dc/zjlx/stock?fc=${secid}`,
        "User-Agent": "Mozilla/5.0",
      },
      signal: AbortSignal.timeout(8000),
    },
  );

  if (!response.ok) {
    throw new Error(`历史主力资金接口请求失败: ${response.status}`);
  }

  const payload = await response.json();
  return parseEastMoneyCapitalFlowHistoryPayload(payload).slice(-limit);
}

async function fetchCapitalBundleBySymbol(symbol) {
  const [snapshotResult, historyResult] = await Promise.allSettled([
    fetchCapitalSnapshotBySymbol(symbol),
    fetchCapitalFlowHistoryBySymbol(symbol),
  ]);

  return {
    snapshot: snapshotResult.status === "fulfilled" ? snapshotResult.value : null,
    historyRows: historyResult.status === "fulfilled" ? historyResult.value : [],
  };
}

export async function fetchAnalysisBySymbol(symbol) {
  const [quote, bars, turnoverRows, capitalBundle] = await Promise.all([
    fetchQuoteBySymbol(symbol),
    fetchHistoricalBarsBySymbol(symbol),
    fetchTurnoverHistoryBySymbol(symbol),
    fetchCapitalBundleBySymbol(symbol),
  ]);

  return {
    symbol,
    quote,
    analysis: evaluateTrendFromHistory(
      bars,
      quote,
      turnoverRows,
      capitalBundle.snapshot,
      capitalBundle.historyRows,
    ),
  };
}
