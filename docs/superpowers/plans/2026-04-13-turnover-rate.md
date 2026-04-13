# Turnover Rate Backfill And Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backfill real-time turnover rate in `/api/quote` and add a turnover comparison chart with daily turnover plus `MA5/MA10/MA20/MA60` in `TrendDashboard.vue`.

**Architecture:** Keep the existing quote polling, analysis polling, request cancellation, and chart lifecycle intact. Switch real-time quote fetching to Eastmoney so `turnoverRatePercent` becomes a real field, and add a second Eastmoney daily-kline source inside `server/analysis.js` to provide historical turnover data that is merged into the existing `TrendAnalysisPayload`.

**Tech Stack:** Vue 3, TypeScript, ECharts 6, Vite, Node.js test runner

---

> 当前目录缺少 `.git`，执行本计划时如果仍然不是 git worktree，所有 commit 步骤都先跳过；如果后续放入 git 仓库，再按计划中的提交信息执行提交。

### Task 1: 切换实时行情来源并补齐当日换手率

**Files:**

- Modify: `server/quote.js`
- Test: `server/quote.test.js`

- [ ] **Step 1: 先补失败用例，锁定东方财富实时换手率映射规则**

```js
import {
  getSecIdBySymbol,
  mapEastMoneyQuote,
  parseEastMoneyQuotePayload,
} from "./quote.js";

test("parseEastMoneyQuotePayload extracts eastmoney quote data", () => {
  const mapped = parseEastMoneyQuotePayload({
    data: {
      f43: 2041,
      f44: 2047,
      f45: 2036,
      f46: 2038,
      f47: 820898,
      f48: 167528602.6,
      f57: "159980",
      f58: "有色ETF大成",
      f60: 2042,
      f86: 1776051264,
      f168: 253,
      f169: -1,
      f170: -5,
      f171: 54,
    },
  });

  assert.equal(mapped.turnoverRatePercent, 2.53);
  assert.equal(mapped.symbol, "159980");
});

test("mapEastMoneyQuote keeps turnover as null when f168 is absent", () => {
  const mapped = mapEastMoneyQuote({
    f43: 2041,
    f44: 2047,
    f45: 2036,
    f46: 2038,
    f47: 820898,
    f48: 167528602.6,
    f57: "159980",
    f58: "有色ETF大成",
    f60: 2042,
    f86: 1776051264,
    f169: -1,
    f170: -5,
    f171: 54,
  });

  assert.equal(mapped.turnoverRatePercent, null);
});
```

- [ ] **Step 2: 运行目标测试，确认当前实现失败**

Run: `node --test server/quote.test.js`
Expected: FAIL because `parseEastMoneyQuotePayload` does not exist yet and `mapEastMoneyQuote()` still falls back to `0` instead of `null`

- [ ] **Step 3: 以最小改动接入东方财富实时接口**

```js
function buildEastMoneyQuoteUrl(symbol) {
  const secid = getSecIdBySymbol(symbol);
  const fields = [
    "f43",
    "f44",
    "f45",
    "f46",
    "f47",
    "f48",
    "f57",
    "f58",
    "f60",
    "f86",
    "f168",
    "f169",
    "f170",
    "f171",
  ];

  return `https://push2.eastmoney.com/api/qt/stock/get?fltt=1&invt=2&fields=${fields.join(",")}&secid=${secid}`;
}

export function parseEastMoneyQuotePayload(payload) {
  if (!payload?.data) {
    throw new Error("行情接口返回格式异常");
  }

  return mapEastMoneyQuote(payload.data);
}

export function mapEastMoneyQuote(rawQuote) {
  const requiredFields = [
    "f43",
    "f44",
    "f45",
    "f46",
    "f57",
    "f58",
    "f60",
    "f86",
  ];
  const missingField = requiredFields.find(
    (field) => rawQuote?.[field] == null,
  );

  if (missingField) {
    throw new Error(`缺少必要行情字段: ${missingField}`);
  }

  return {
    symbol: String(rawQuote.f57),
    name: String(rawQuote.f58),
    price: fromPriceUnit(rawQuote.f43),
    high: fromPriceUnit(rawQuote.f44),
    low: fromPriceUnit(rawQuote.f45),
    open: fromPriceUnit(rawQuote.f46),
    previousClose: fromPriceUnit(rawQuote.f60),
    change: fromPriceUnit(rawQuote.f169 ?? 0),
    changePercent: fromPercentUnit(rawQuote.f170 ?? 0),
    volume: Number(rawQuote.f47 ?? 0),
    amount: Number(rawQuote.f48 ?? 0),
    amplitudePercent: fromPercentUnit(rawQuote.f171 ?? 0),
    turnoverRatePercent:
      rawQuote.f168 == null ? null : fromPercentUnit(rawQuote.f168),
    updatedAt: new Date(Number(rawQuote.f86) * 1000).toISOString(),
  };
}

async function requestEastMoneyQuotePayload(symbol) {
  const response = await fetch(buildEastMoneyQuoteUrl(symbol), {
    headers: {
      Referer: "https://quote.eastmoney.com/",
      "User-Agent": "Mozilla/5.0",
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`行情接口请求失败: ${response.status}`);
  }

  return response.json();
}

export async function fetchQuoteBySymbol(symbol) {
  const payload = await requestEastMoneyQuotePayload(symbol);
  return parseEastMoneyQuotePayload(payload);
}
```

- [ ] **Step 4: 再跑一次行情测试**

Run: `node --test server/quote.test.js`
Expected: PASS with the old secid tests and the new Eastmoney turnover assertions green

- [ ] **Step 5: 记录本任务变更**

```bash
git add server/quote.js server/quote.test.js
git commit -m "feat: backfill realtime turnover rate"
```

### Task 2: 为分析接口补齐历史换手率与均线序列

**Files:**

- Modify: `server/analysis.js`
- Test: `server/analysis.test.js`

- [ ] **Step 1: 先补失败用例，锁定历史换手率解析和均线结构**

```js
import {
  buildTurnoverChart,
  evaluateTrendFromHistory,
  parseEastMoneyTurnoverHistoryPayload,
  parseTencentHistoryPayload,
} from "./analysis.js";

test("parseEastMoneyTurnoverHistoryPayload extracts daily turnover rows", () => {
  const rows = parseEastMoneyTurnoverHistoryPayload({
    data: {
      klines: [
        "2026-04-07,2.100,2.130,2.150,2.080,820898,167528602.6,3.32,1.43,0.03,2.41",
        "2026-04-08,2.130,2.180,2.200,2.110,920000,186000000,4.23,2.35,0.05,2.88",
      ],
    },
  });

  assert.deepEqual(rows, [
    { date: "2026-04-07", turnoverRatePercent: 2.41 },
    { date: "2026-04-08", turnoverRatePercent: 2.88 },
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

test("evaluateTrendFromHistory appends turnover chart without changing trend label", () => {
  const bars = Array.from({ length: 80 }, (_, index) => {
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
    bars,
    createLiveQuote({ turnoverRatePercent: 3.25, amount: 61800000 }),
    turnoverRows,
  );

  assert.equal(analysis.trendLabel, "上涨趋势");
  assert.equal(analysis.charts.turnover.daily.length, 80);
  assert.equal(analysis.charts.turnover.ma5.at(-1), 3.51);
});
```

- [ ] **Step 2: 运行分析测试，确认当前实现失败**

Run: `node --test server/analysis.test.js`
Expected: FAIL because the turnover parser, turnover chart builder, and `analysis.charts.turnover` do not exist yet

- [ ] **Step 3: 实现东方财富历史换手率解析与图表构造**

```js
function round(value, digits = 3) {
  return Number(value.toFixed(digits));
}

export function parseEastMoneyTurnoverHistoryPayload(payload) {
  const rows = payload?.data?.klines;

  if (!rows?.length) {
    throw new Error("历史换手率数据为空");
  }

  return rows.map((row) => {
    const fields = String(row).split(",");

    return {
      date: fields[0],
      turnoverRatePercent: fields[10] ? round(Number(fields[10]), 2) : null,
    };
  });
}

export function buildTurnoverChart(rows) {
  const values = rows.map((row) => row.turnoverRatePercent);
  const normalizeSeries = (period) =>
    values.map((value, index) => {
      if (value == null) {
        return null;
      }

      const section = values.slice(index + 1 - period, index + 1);
      if (index + 1 < period || section.some((item) => item == null)) {
        return null;
      }

      return round(average(section), 2);
    });

  return {
    dates: rows.map((row) => row.date),
    daily: values,
    ma5: normalizeSeries(5),
    ma10: normalizeSeries(10),
    ma20: normalizeSeries(20),
    ma60: normalizeSeries(60),
  };
}

export function evaluateTrendFromHistory(bars, liveQuote, turnoverRows = []) {
  // 保留现有趋势判断逻辑
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
        mainForceNetAmount: round(capitalFlowEstimate, 0),
        mainForceDirection:
          capitalFlowEstimate >= 0 ? "净流入估算" : "净流出估算",
      },
    },
    sidewaysSignals,
    summary: buildSummary(
      trendLabel,
      { ma, macd, rsi },
      sidewaysSignals,
      pattern,
      volume,
    ),
    charts: {
      candles,
      ma: {
        ma5,
        ma10,
        ma20,
        ma60,
      },
      macd,
      boll,
      rsi: rsi.series,
      turnover: buildTurnoverChart(turnoverRows),
    },
  };
}
```

- [ ] **Step 4: 把历史换手率请求接入分析聚合**

```js
async function fetchTurnoverHistoryBySymbol(symbol, limit = 120) {
  const secid = getSecIdBySymbol(symbol);
  const fields2 = [
    "f51",
    "f52",
    "f53",
    "f54",
    "f55",
    "f56",
    "f57",
    "f58",
    "f59",
    "f60",
    "f61",
  ];
  const response = await fetch(
    `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&klt=101&fqt=1&lmt=${limit}&end=20500101&fields1=f1,f2,f3&fields2=${fields2.join(",")}`,
    {
      headers: {
        Referer: "https://quote.eastmoney.com/",
        "User-Agent": "Mozilla/5.0",
      },
      signal: AbortSignal.timeout(8000),
    },
  );

  if (!response.ok) {
    throw new Error(`历史换手率接口请求失败: ${response.status}`);
  }

  const payload = await response.json();
  return parseEastMoneyTurnoverHistoryPayload(payload);
}

export async function fetchAnalysisBySymbol(symbol) {
  const [quote, bars, turnoverRows] = await Promise.all([
    fetchQuoteBySymbol(symbol),
    fetchHistoricalBarsBySymbol(symbol),
    fetchTurnoverHistoryBySymbol(symbol),
  ]);

  return {
    symbol,
    quote,
    analysis: evaluateTrendFromHistory(bars, quote, turnoverRows),
  };
}
```

- [ ] **Step 5: 再跑分析测试**

Run: `node --test server/analysis.test.js`
Expected: PASS with the old trend and volume assertions still green, plus the new turnover assertions green

- [ ] **Step 6: 记录本任务变更**

```bash
git add server/analysis.js server/analysis.test.js
git commit -m "feat: add turnover history analysis data"
```

### Task 3: 扩展前端类型并在 `TrendDashboard.vue` 渲染换手率图

**Files:**

- Modify: `src/market-types.ts`
- Modify: `src/components/TrendDashboard.vue`
- Verify: `src/App.vue`

- [ ] **Step 1: 先扩展前端类型，让新字段可被安全消费**

```ts
export interface TrendAnalysisPayload {
  symbol: string;
  quote: QuoteData;
  analysis: {
    trendLabel: string;
    summary: string;
    sidewaysSignals: string[];
    indicators: {
      ma: {
        state: string;
        bias: string;
        value: number[];
        detail: string;
      };
      macd: {
        state: string;
        bias: string;
        zeroAxis: string;
        value: {
          dif: number;
          dea: number;
          macd: number;
        };
      };
      boll: {
        state: string;
        position: string;
        value: {
          upper: number;
          middle: number;
          lower: number;
          widthPercent: number;
        };
      };
      rsi: {
        state: string;
        bias: string;
        value: number;
      };
      volume: {
        state: string;
        relation: string;
        volumeRatio: number;
        averageVolume: number;
      };
      pattern: {
        candleType: string;
        pattern: string;
      };
      capital: {
        turnoverRatePercent: number | null;
        mainForceNetAmount: number;
        mainForceDirection: string;
      };
    };
    charts: {
      candles: Array<{
        date: string;
        open: number;
        close: number;
        high: number;
        low: number;
        volume: number;
      }>;
      ma: {
        ma5: Array<number | null>;
        ma10: Array<number | null>;
        ma20: Array<number | null>;
        ma60: Array<number | null>;
      };
      macd: {
        dif: number[];
        dea: number[];
        histogram: number[];
      };
      boll: {
        upper: Array<number | null>;
        middle: Array<number | null>;
        lower: Array<number | null>;
      };
      rsi: Array<number | null>;
      turnover: {
        dates: string[];
        daily: Array<number | null>;
        ma5: Array<number | null>;
        ma10: Array<number | null>;
        ma20: Array<number | null>;
        ma60: Array<number | null>;
      };
    };
  };
}
```

- [ ] **Step 2: 在面板中增加图表卡片、实例引用和渲染逻辑**

```vue
<article class="chart-card">
  <div class="panel-head">
    <h4>换手率对比</h4>
    <span>当日与 5 / 10 / 20 / 60 日均线</span>
  </div>
  <div ref="turnoverChartRef" class="chart-canvas"></div>
</article>
```

```ts
const turnoverChartRef = ref<HTMLDivElement | null>(null);

let turnoverChart: EChartsType | null = null;

function buildTurnoverOption(): EChartsOption {
  const turnover = props.analysis?.analysis.charts.turnover;
  const tone = palette.value;

  return {
    animation: false,
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    legend: {
      top: 0,
      textStyle: { color: tone.text },
    },
    grid: {
      left: 12,
      right: 12,
      top: 38,
      bottom: 14,
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: turnover?.dates ?? [],
      axisLine: { lineStyle: { color: tone.axis } },
      axisLabel: { color: tone.axis, show: false },
    },
    yAxis: {
      axisLabel: {
        color: tone.axis,
        formatter: "{value}%",
      },
      splitLine: { lineStyle: { color: tone.split } },
    },
    series: [
      {
        name: "当日换手率",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: turnover?.daily ?? [],
        lineStyle: { color: "#38bdf8", width: 1.8 },
      },
      {
        name: "MA5",
        type: "line",
        showSymbol: false,
        data: turnover?.ma5 ?? [],
        lineStyle: { color: tone.lineA, width: 1.4 },
      },
      {
        name: "MA10",
        type: "line",
        showSymbol: false,
        data: turnover?.ma10 ?? [],
        lineStyle: { color: tone.lineB, width: 1.4 },
      },
      {
        name: "MA20",
        type: "line",
        showSymbol: false,
        data: turnover?.ma20 ?? [],
        lineStyle: { color: tone.lineC, width: 1.2 },
      },
      {
        name: "MA60",
        type: "line",
        showSymbol: false,
        data: turnover?.ma60 ?? [],
        lineStyle: { color: tone.lineD, width: 1.2 },
      },
    ],
  };
}

function disposeCharts() {
  priceChart = disposeChart(priceChart);
  volumeChart = disposeChart(volumeChart);
  macdChart = disposeChart(macdChart);
  rsiChart = disposeChart(rsiChart);
  turnoverChart = disposeChart(turnoverChart);
}

function renderCharts() {
  if (!props.analysis) {
    disposeCharts();
    return;
  }

  priceChart = initChart(priceChartRef.value, priceChart);
  volumeChart = initChart(volumeChartRef.value, volumeChart);
  macdChart = initChart(macdChartRef.value, macdChart);
  rsiChart = initChart(rsiChartRef.value, rsiChart);
  turnoverChart = initChart(turnoverChartRef.value, turnoverChart);

  priceChart?.setOption(buildPriceOption(), true);
  volumeChart?.setOption(buildVolumeOption(), true);
  macdChart?.setOption(buildMacdOption(), true);
  rsiChart?.setOption(buildRsiOption(), true);
  turnoverChart?.setOption(buildTurnoverOption(), true);
}

function handleResize() {
  priceChart?.resize();
  volumeChart?.resize();
  macdChart?.resize();
  rsiChart?.resize();
  turnoverChart?.resize();
}
```

- [ ] **Step 3: 确认 `App.vue` 不需要额外模板改动**

```vue
<div>
  <dt>换手率</dt>
  <dd>{{ quote ? formatPercent(quote.turnoverRatePercent) : '--' }}</dd>
</div>
```

这段现有模板已经满足展示需求；只要 `/api/quote` 返回真实值，这里自然会展示“当日换手率”，因此本任务不改 `src/App.vue`。

- [ ] **Step 4: 跑构建验证前端类型和图表代码**

Run: `npm run build`
Expected: PASS with `vue-tsc` and `vite build` both succeeding after the new turnover chart is wired in

- [ ] **Step 5: 检查编辑文件的 IDE diagnostics**

```text
检查文件：
- src/market-types.ts
- src/components/TrendDashboard.vue
预期：
- 无新的 TypeScript 或 Vue diagnostics
```

- [ ] **Step 6: 记录本任务变更**

```bash
git add src/market-types.ts src/components/TrendDashboard.vue
git commit -m "feat: add turnover comparison chart"
```

### Task 4: 回归验证异步稳定性与交付质量

**Files:**

- Verify: `server/quote.test.js`
- Verify: `server/analysis.test.js`
- Verify: `src/components/TrendDashboard.vue`
- Verify: `src/App.vue`

- [ ] **Step 1: 运行后端目标测试集**

Run: `node --test server/quote.test.js server/analysis.test.js`
Expected: PASS with realtime turnover mapping, historical turnover chart, and existing trend logic assertions all green

- [ ] **Step 2: 再跑一次整包构建**

Run: `npm run build`
Expected: PASS and produce the Vite production bundle without new type errors

- [ ] **Step 3: 手工核查异步与图表生命周期**

```text
核查清单：
- 快速切换不同标的，确认旧分析响应不会覆盖新标的的换手率图
- 点击“立即刷新”，确认 quote 与 analysis 都能退出 loading / refreshing
- 切换主题，确认换手率图跟随主题重绘
- 调整窗口尺寸，确认新增图表能跟随 resize 且无控制台报错
- 离开页面或热更新时，确认新增图表实例能被 dispose，不出现重复初始化报错
```

- [ ] **Step 4: 汇总交付结果**

```text
交付说明应包含：
- 当日换手率空值问题的根因与修复方式
- 新增历史换手率数据源与图表字段
- 已运行的测试与构建命令
- 剩余风险：外部东方财富接口波动会同时影响当日换手率和历史换手率图
```

- [ ] **Step 5: 记录最终验证变更**

```bash
git add server/quote.js server/quote.test.js server/analysis.js server/analysis.test.js src/market-types.ts src/components/TrendDashboard.vue
git commit -m "test: verify turnover dashboard changes"
```
