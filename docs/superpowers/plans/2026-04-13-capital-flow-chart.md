# 历史主力资金图表实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为现有趋势看板补齐真实历史主力资金净流入/净流出图表，并把摘要中的主力资金口径从估算值切到东方财富 H5 实时资金数据。

**Architecture:** 保持现有 `/api/analysis` 单次聚合、前端请求取消、ECharts 生命周期不变。后端在 `server/analysis.js` 新增东方财富 `emdatah5` 资金接口解析，历史图表和实时主力资金摘要都在服务端一次性聚合后下发给 `TrendDashboard.vue`，资金子链路失败时回退为空图和估算摘要，不影响换手率图和既有趋势分析主流程。

**Tech Stack:** Vue 3, TypeScript, ECharts 6, Vite, Node.js test runner

---

> 当前目录缺少 `.git`，执行本计划时如果仍然不是 git worktree，所有 commit 步骤都先跳过；如果后续放入 git 仓库，再按计划中的提交信息执行提交。

## 文件职责

- `server/analysis.js`
  - 新增东方财富 H5 主力资金实时/历史请求函数
  - 解析 `getZJLXData` 与 `getDBHistoryData` 返回
  - 构造 `analysis.charts.capitalFlow`
  - 用真实主力资金覆盖当前 `mainForceNetAmount` 与 `mainForceDirection`
- `server/analysis.test.js`
  - 锁定主力资金历史解析、均线构造、空态回退和聚合逻辑
- `src/market-types.ts`
  - 扩展 `TrendAnalysisPayload.analysis.charts.capitalFlow`
- `src/components/TrendDashboard.vue`
  - 新增主力资金图卡片
  - 增加图表实例、option、resize 与 dispose 流程

### Task 1: 为分析接口补齐真实主力资金数据与回退路径

**Files:**
- Modify: `server/analysis.js`
- Test: `server/analysis.test.js`

- [ ] **Step 1: 先补失败用例，锁定东方财富 H5 主力资金解析规则**

```js
import {
  buildCapitalFlowChart,
  evaluateTrendFromHistory,
  parseEastMoneyCapitalFlowHistoryPayload,
  parseEastMoneyCapitalSnapshotPayload,
} from "./analysis.js";

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
  assert.deepEqual(chart.ma5, [null, null, null, null, 300, 400, 500, 600, 700, 800]);
  assert.deepEqual(chart.ma10, [null, null, null, null, null, null, null, null, null, 550]);
});

test("evaluateTrendFromHistory prefers real capital snapshot and falls back safely", () => {
  const bars = Array.from({ length: 80 }, (_, index) => {
    const close = 5 + index * 0.08;
    return {
      date: `2026-03-${String((index % 28) + 1).padStart(2, "0")}`,
      open: close - 0.04,
      close,
      high: close + 0.05,
      low: close - 0.06,
      volume: 1800 + index * 8,
    };
  });

  const analysis = evaluateTrendFromHistory(
    bars,
    {
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
    },
    [],
    {
      symbol: "513100",
      name: "纳指ETF国泰",
      mainNetInflow: 7630894,
      updatedAt: "2026-04-13T08:11:59.000Z",
    },
    [
      { date: "2026-04-07", close: 1.73, changePercent: 0.06, mainNetInflow: -17798900 },
      { date: "2026-04-08", close: 1.83, changePercent: 5.83, mainNetInflow: 88022600 },
      { date: "2026-04-09", close: 1.80, changePercent: -1.53, mainNetInflow: -19469200 },
      { date: "2026-04-10", close: 1.81, changePercent: 0.22, mainNetInflow: -3873000 },
      { date: "2026-04-13", close: 1.80, changePercent: -0.61, mainNetInflow: 7630900 },
    ],
  );

  assert.equal(analysis.indicators.capital.mainForceNetAmount, 7630894);
  assert.equal(analysis.indicators.capital.mainForceDirection, "净流入");
  assert.equal(analysis.charts.capitalFlow.mainNetInflow.at(-1), 7630900);
  assert.equal(analysis.charts.capitalFlow.ma5.at(-1), 9168480);
});
```

- [ ] **Step 2: 运行分析测试，确认当前实现失败**

Run: `node --test server/analysis.test.js`
Expected: FAIL because `parseEastMoneyCapitalFlowHistoryPayload`、`parseEastMoneyCapitalSnapshotPayload`、`buildCapitalFlowChart` 和新的 `evaluateTrendFromHistory` 参数还不存在

- [ ] **Step 3: 在 `analysis.js` 实现主力资金解析与空态图表构造**

```js
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
```

- [ ] **Step 4: 接入东方财富 H5 资金接口，并对失败做局部回退**

```js
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
```

- [ ] **Step 5: 用真实主力资金覆盖摘要，并把图表并入 `analysis.charts`**

```js
export function evaluateTrendFromHistory(
  bars,
  liveQuote,
  turnoverRows = [],
  capitalSnapshot = null,
  capitalFlowRows = [],
) {
  // 保留现有均线、MACD、BOLL、RSI、volume、pattern 逻辑

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
      capitalFlow: buildCapitalFlowChart(capitalFlowRows),
    },
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
```

- [ ] **Step 6: 再跑一次分析测试**

Run: `node --test server/analysis.test.js`
Expected: PASS with old turnover and trend assertions still green, plus the new capital flow assertions green

- [ ] **Step 7: 记录本任务变更**

```bash
git add server/analysis.js server/analysis.test.js
git commit -m "feat: add capital flow analysis data"
```

### Task 2: 扩展前端类型并在趋势看板中渲染主力资金图

**Files:**
- Modify: `src/market-types.ts`
- Modify: `src/components/TrendDashboard.vue`

- [ ] **Step 1: 先扩展前端类型，让主力资金图可被安全消费**

```ts
export interface TrendAnalysisPayload {
  symbol: string;
  quote: QuoteData;
  analysis: {
    trendLabel: string;
    summary: string;
    sidewaysSignals: string[];
    indicators: {
      ma: { state: string; bias: string; value: number[]; detail: string };
      macd: {
        state: string;
        bias: string;
        zeroAxis: string;
        value: { dif: number; dea: number; macd: number };
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
      rsi: { state: string; bias: string; value: number };
      volume: {
        state: string;
        relation: string;
        volumeRatio: number;
        averageVolume: number;
      };
      pattern: { candleType: string; pattern: string };
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
      macd: { dif: number[]; dea: number[]; histogram: number[] };
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
      capitalFlow: {
        dates: string[];
        mainNetInflow: Array<number | null>;
        ma5: Array<number | null>;
        ma10: Array<number | null>;
      };
    };
  };
}
```

- [ ] **Step 2: 在模板中新增主力资金图卡片**

```vue
<article class="chart-card">
  <div class="panel-head">
    <h4>主力资金净流入 / 净流出</h4>
    <span>真实历史主力资金与 5 / 10 日均线</span>
  </div>
  <div ref="capitalFlowChartRef" class="chart-canvas"></div>
</article>
```

- [ ] **Step 3: 增加图表实例、金额格式化 helper 和 option 构造**

```ts
const capitalFlowChartRef = ref<HTMLDivElement | null>(null);

let capitalFlowChart: EChartsType | null = null;

function formatMoneyCompact(value: number | null) {
  if (value == null) {
    return "--";
  }

  const abs = Math.abs(value);
  if (abs >= 1e8) {
    return `${(value / 1e8).toFixed(2)}亿`;
  }
  if (abs >= 1e4) {
    return `${(value / 1e4).toFixed(2)}万`;
  }
  return `${value.toFixed(0)}`;
}

function buildCapitalFlowOption(): EChartsOption {
  const capitalFlowData = props.analysis?.analysis.charts.capitalFlow;
  const tone = palette.value;

  return {
    animation: false,
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      valueFormatter: (value) => formatMoney(value == null ? null : Number(value)),
    },
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
      data: capitalFlowData?.dates ?? [],
      axisLine: { lineStyle: { color: tone.axis } },
      axisLabel: { color: tone.axis, show: false },
    },
    yAxis: {
      axisLabel: {
        color: tone.axis,
        formatter: (value: number) => formatMoneyCompact(value),
      },
      splitLine: { lineStyle: { color: tone.split } },
    },
    series: [
      {
        name: "主力净流向",
        type: "bar",
        data: capitalFlowData?.mainNetInflow ?? [],
        itemStyle: {
          color: (params) => Number(params.value) >= 0 ? tone.up : tone.down,
        },
      },
      {
        name: "MA5",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: capitalFlowData?.ma5 ?? [],
        lineStyle: { color: tone.lineA, width: 1.4 },
      },
      {
        name: "MA10",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: capitalFlowData?.ma10 ?? [],
        lineStyle: { color: tone.lineC, width: 1.4 },
      },
    ],
  };
}
```

- [ ] **Step 4: 把新图纳入现有生命周期，不新增额外监听**

```ts
function disposeCharts() {
  priceChart = disposeChart(priceChart);
  volumeChart = disposeChart(volumeChart);
  macdChart = disposeChart(macdChart);
  rsiChart = disposeChart(rsiChart);
  turnoverChart = disposeChart(turnoverChart);
  capitalFlowChart = disposeChart(capitalFlowChart);
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
  capitalFlowChart = initChart(capitalFlowChartRef.value, capitalFlowChart);

  priceChart?.setOption(buildPriceOption(), true);
  volumeChart?.setOption(buildVolumeOption(), true);
  macdChart?.setOption(buildMacdOption(), true);
  rsiChart?.setOption(buildRsiOption(), true);
  turnoverChart?.setOption(buildTurnoverOption(), true);
  capitalFlowChart?.setOption(buildCapitalFlowOption(), true);
}

function handleResize() {
  priceChart?.resize();
  volumeChart?.resize();
  macdChart?.resize();
  rsiChart?.resize();
  turnoverChart?.resize();
  capitalFlowChart?.resize();
}
```

- [ ] **Step 5: 跑构建验证前端类型和图表代码**

Run: `npm run build`
Expected: PASS with `vue-tsc` and `vite build` succeeding after the new capital flow chart is wired in

- [ ] **Step 6: 检查编辑文件的 IDE diagnostics**

```text
检查文件：
- src/market-types.ts
- src/components/TrendDashboard.vue
预期：
- 无新的 TypeScript 或 Vue diagnostics
```

- [ ] **Step 7: 记录本任务变更**

```bash
git add src/market-types.ts src/components/TrendDashboard.vue
git commit -m "feat: add capital flow comparison chart"
```

### Task 3: 回归验证异步稳定性与交付质量

**Files:**
- Verify: `server/analysis.test.js`
- Verify: `src/components/TrendDashboard.vue`
- Verify: `src/market-types.ts`

- [ ] **Step 1: 运行后端目标测试集**

Run: `node --test server/analysis.test.js`
Expected: PASS with turnover, capital flow, trend, and volume assertions all green

- [ ] **Step 2: 再跑一次整包构建**

Run: `npm run build`
Expected: PASS and produce the Vite production bundle without new type errors

- [ ] **Step 3: 手工核查异步稳定性与局部失败路径**

```text
核查清单：
- 快速切换不同标的，确认旧 analysis 响应不会覆盖新标的的换手率图和主力资金图
- 点击“刷新分析”，确认页面能退出 loading / refreshing
- 切换主题，确认主力资金图与换手率图都能跟随主题重绘
- 调整窗口尺寸，确认新增图表能跟随 resize 且无控制台报错
- 临时让 `fetchCapitalSnapshotBySymbol()` 或 `fetchCapitalFlowHistoryBySymbol()` 抛错，确认页面仍能展示其它图表，且主力资金图为空态或空序列而不是整页报错
- 离开页面或热更新时，确认新增图表实例能被 dispose，不出现重复初始化报错
```

- [ ] **Step 4: 汇总交付结果**

```text
交付说明应包含：
- 当前主力资金图的数据源是东方财富 H5 资金流接口
- 513100 这类 ETF 走 H5 `getDBHistoryData`，不再依赖仅对股票有数据的 `RPT_DMSK_TS_FUNDFLOWHIS`
- 主力资金摘要已从估算值切到真实实时净流向；若资金接口失败，则摘要回退到估算口径
- 已运行的测试与构建命令
- 剩余风险：外部 H5 资金接口波动会导致主力资金图为空，但不应拖垮整体分析页
```

- [ ] **Step 5: 记录最终验证变更**

```bash
git add server/analysis.js server/analysis.test.js src/market-types.ts src/components/TrendDashboard.vue
git commit -m "test: verify capital flow dashboard changes"
```
