# Trend Advice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在看板模块中基于现有技术指标输出买入 / 卖出 / 观望建议，并展示目标价、止损 / 失效价、持续时间、依据和风险提示。

**Architecture:** 服务端继续以 `evaluateTrendFromHistory()` 作为唯一分析入口，在既有指标结果生成后同步推导 `analysis.advice`，不新增任何请求或异步状态。前端只扩展类型和展示层，在 `TrendDashboard.vue` 新增建议卡，复用现有 loading、error、refresh 和图表生命周期。

**Tech Stack:** Vue 3、TypeScript、Node.js 内置 `node:test`、Vite、ECharts

---

## 文件结构

- 修改 `server/analysis.js`
  - 新增建议生成相关纯函数；
  - 在 `evaluateTrendFromHistory()` 返回结构中挂入 `advice`；
  - 复用现有指标结果，不重复请求数据。
- 修改 `server/analysis.test.js`
  - 新增买入 / 卖出 / 观望与回退场景测试；
  - 覆盖目标价和止损价方向校验。
- 修改 `src/market-types.ts`
  - 为 `TrendAnalysisPayload["analysis"]` 补充 `advice` 类型定义。
- 修改 `src/components/TrendDashboard.vue`
  - 在趋势结论区域新增操作建议卡；
  - 扩展格式化、色彩映射和空值展示；
  - 不新增事件监听，不新增异步逻辑。

## 前置说明

- 项目当前没有 `lint` 脚本，本计划使用 `npm run build` 作为 TypeScript + Vue 模板校验门禁；
- 服务端测试使用 `node --test server/analysis.test.js`；
- 所有任务都保持最小改动，不触碰 `src/App.vue` 的轮询和请求竞态控制。

### Task 1: 服务端建议动作与置信度

**Files:**
- Modify: `server/analysis.test.js`
- Modify: `server/analysis.js`

- [ ] **Step 1: 先写失败测试，锁定买入 / 卖出 / 观望三类动作**

在 `server/analysis.test.js` 末尾追加以下测试：

```js
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
  );

  assert.equal(analysis.advice.action, "买入");
  assert.match(analysis.advice.confidence, /高|中/);
  assert.ok(analysis.advice.reasonTags.includes("多头排列"));
  assert.ok(analysis.advice.reasonTags.includes("MACD偏多"));
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

  const analysis = evaluateTrendFromHistory(
    fallingBars,
    createLiveQuote({
      price: 7.2,
      open: 7.35,
      high: 7.38,
      low: 7.12,
      previousClose: 7.48,
      changePercent: -3.74,
      volume: 4800,
      turnoverRatePercent: 4.12,
      amount: 45200000,
    }),
  );

  assert.equal(analysis.advice.action, "卖出");
  assert.match(analysis.advice.confidence, /高|中/);
  assert.ok(analysis.advice.reasonTags.includes("空头排列"));
  assert.ok(analysis.advice.reasonTags.includes("MACD偏空"));
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
```

- [ ] **Step 2: 运行测试确认当前失败**

Run:

```bash
node --test server/analysis.test.js
```

Expected:

```text
not ok ... Cannot read properties of undefined (reading 'action')
```

- [ ] **Step 3: 在 `server/analysis.js` 增加建议动作、置信度和依据标签的最小实现**

在 `buildSummary()` 之前加入以下辅助函数：

```js
function toReasonTags({ ma, macd, rsi, boll, volume, pattern, capital, sidewaysSignals }) {
  const tags = [];

  if (ma.state === "多头排列" || ma.state === "空头排列") {
    tags.push(ma.state);
  } else if (ma.state === "粘合缠绕") {
    tags.push("均线粘合");
  }

  tags.push(macd.bias === "偏多" ? "MACD偏多" : macd.bias === "偏空" ? "MACD偏空" : "MACD中性");

  if (rsi.value >= 40 && rsi.value <= 60) {
    tags.push("RSI横盘");
  } else {
    tags.push(`RSI${rsi.state}`);
  }

  if (boll.state === "收口") {
    tags.push("BOLL收口");
  } else {
    tags.push(boll.position);
  }

  if (volume.relation !== "量价平衡") {
    tags.push(volume.relation);
  }

  if (pattern.pattern !== "整理") {
    tags.push(pattern.pattern);
  }

  tags.push(capital.mainForceNetAmount >= 0 ? "主力净流入" : "主力净流出");

  if (sidewaysSignals.length >= 3) {
    tags.unshift("横盘信号密集");
  }

  return [...new Set(tags)].slice(0, 6);
}

function countDirectionalSignals({ ma, macd, rsi, volume, pattern, capital }) {
  let bullish = 0;
  let bearish = 0;

  if (ma.bias === "偏多") bullish += 1;
  if (ma.bias === "偏空") bearish += 1;
  if (macd.bias === "偏多") bullish += 1;
  if (macd.bias === "偏空") bearish += 1;
  if (rsi.bias === "偏多") bullish += 1;
  if (rsi.bias === "偏空") bearish += 1;
  if (volume.relation === "价涨量增") bullish += 1;
  if (volume.relation === "价跌量增") bearish += 1;
  if (pattern.pattern === "突破") bullish += 1;
  if (pattern.pattern === "破位") bearish += 1;
  if (capital.mainForceNetAmount >= 0) bullish += 1;
  if (capital.mainForceNetAmount < 0) bearish += 1;

  return { bullish, bearish };
}

function resolveAdviceAction({ ma, macd, rsi, sidewaysSignals, signalCounts }) {
  if (sidewaysSignals.length >= 3) {
    return { action: "观望", confidence: "低" };
  }

  const coreBullish = ma.bias === "偏多" && macd.bias === "偏多" && rsi.bias === "偏多";
  const coreBearish = ma.bias === "偏空" && macd.bias === "偏空" && rsi.bias === "偏空";

  if (coreBullish) {
    return {
      action: "买入",
      confidence: signalCounts.bullish - signalCounts.bearish >= 3 ? "高" : "中",
    };
  }

  if (coreBearish) {
    return {
      action: "卖出",
      confidence: signalCounts.bearish - signalCounts.bullish >= 3 ? "高" : "中",
    };
  }

  if (signalCounts.bullish - signalCounts.bearish >= 2) {
    return { action: "买入", confidence: "中" };
  }

  if (signalCounts.bearish - signalCounts.bullish >= 2) {
    return { action: "卖出", confidence: "中" };
  }

  return { action: "观望", confidence: "低" };
}
```

然后在 `evaluateTrendFromHistory()` 中 `mainForceDirection` 之后插入：

```js
  const signalCounts = countDirectionalSignals({
    ma,
    macd,
    rsi,
    volume,
    pattern,
    capital: {
      mainForceNetAmount,
    },
  });
  const adviceBase = resolveAdviceAction({
    ma,
    macd,
    rsi,
    sidewaysSignals,
    signalCounts,
  });
```

并先把返回结构中的 `advice` 挂上最小骨架：

```js
    advice: {
      action: adviceBase.action,
      confidence: adviceBase.confidence,
      targetPrice: adviceBase.action === "观望" ? null : liveQuote.price,
      stopPrice: null,
      holdingWindow: adviceBase.action === "观望" ? "1-3个交易日观察" : "3-5个交易日",
      reasonTags: toReasonTags({
        ma,
        macd,
        rsi,
        boll,
        volume,
        pattern,
        capital: {
          mainForceNetAmount,
        },
        sidewaysSignals,
      }),
      rationale: adviceBase.action === "观望"
        ? "当前横盘或多空信号冲突，暂不建议直接操作。"
        : `当前信号更偏${adviceBase.action === "买入" ? "多" : "空"}，建议结合目标价与失效价执行。`,
      riskNote: adviceBase.action === "观望"
        ? "等待突破或破位后再重新判断。"
        : "若关键趋势信号反向，需要重新评估当前建议。",
    },
```

- [ ] **Step 4: 再跑服务端测试，确认动作类测试通过**

Run:

```bash
node --test server/analysis.test.js
```

Expected:

```text
ok ... returns buy advice for bullish alignment
ok ... returns sell advice for bearish alignment
ok ... returns watch advice when sideways signals dominate
```

- [ ] **Step 5: 提交服务端动作判定基础实现**

```bash
git add server/analysis.js server/analysis.test.js
git commit -m "feat: add trend advice action evaluation"
```

### Task 2: 服务端目标价、止损价、周期与回退

**Files:**
- Modify: `server/analysis.test.js`
- Modify: `server/analysis.js`

- [ ] **Step 1: 写失败测试，锁定价位方向和异常回退**

在 `server/analysis.test.js` 末尾继续追加：

```js
test("evaluateTrendFromHistory derives upward target and downward stop for buy advice", () => {
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
  assert.ok(analysis.advice.targetPrice >= quote.price);
  assert.ok(analysis.advice.stopPrice < quote.price);
  assert.match(analysis.advice.holdingWindow, /3-5个交易日|1-2周/);
});

test("evaluateTrendFromHistory derives downward target and upward stop for sell advice", () => {
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
  assert.ok(analysis.advice.targetPrice <= quote.price);
  assert.ok(analysis.advice.stopPrice > quote.price);
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
});
```

- [ ] **Step 2: 运行测试确认价位与回退规则尚未实现**

Run:

```bash
node --test server/analysis.test.js
```

Expected:

```text
not ok ... targetPrice >= quote.price
not ok ... stopPrice > quote.price
```

- [ ] **Step 3: 在 `server/analysis.js` 补齐技术位推导与回退函数**

在 `evaluateTrendFromHistory()` 之前加入：

```js
function pickClosestLevel(levels, predicate, compare) {
  const filtered = levels.filter((value) => value != null && Number.isFinite(value) && predicate(value));
  if (!filtered.length) {
    return null;
  }
  return filtered.sort(compare)[0];
}

function resolveAdvicePriceLevels({ action, liveQuote, bars, ma20, boll }) {
  const recentBars = bars.slice(-20);
  const highest20 = Math.max(...recentBars.map((bar) => bar.high));
  const lowest20 = Math.min(...recentBars.map((bar) => bar.low));
  const currentPrice = liveQuote.price;
  const supportCandidates = [ma20, boll.middle, lowest20];
  const resistanceCandidates = [boll.upper, highest20];

  if (action === "买入") {
    const targetPrice = pickClosestLevel(
      [boll.upper, highest20, currentPrice],
      (value) => value >= currentPrice,
      (left, right) => left - right,
    );
    const stopPrice = pickClosestLevel(
      supportCandidates,
      (value) => value < currentPrice,
      (left, right) => right - left,
    );

    if (targetPrice == null || stopPrice == null) {
      return null;
    }

    return { targetPrice: round(targetPrice, 3), stopPrice: round(stopPrice, 3) };
  }

  if (action === "卖出") {
    const targetPrice = pickClosestLevel(
      [boll.lower, lowest20, currentPrice],
      (value) => value <= currentPrice,
      (left, right) => right - left,
    );
    const stopPrice = pickClosestLevel(
      [ma20, boll.middle, highest20],
      (value) => value > currentPrice,
      (left, right) => left - right,
    );

    if (targetPrice == null || stopPrice == null) {
      return null;
    }

    return { targetPrice: round(targetPrice, 3), stopPrice: round(stopPrice, 3) };
  }

  return { targetPrice: null, stopPrice: null };
}

function resolveHoldingWindow(action, confidence) {
  if (action === "观望") {
    return "1-3个交易日观察";
  }
  if (confidence === "高") {
    return "1-2周";
  }
  return "3-5个交易日";
}

function buildAdviceCopy({ action, confidence, priceLevels, reasonTags }) {
  if (action === "观望") {
    return {
      rationale: "当前横盘或多空信号冲突，暂不建议直接操作，优先等待突破或破位确认。",
      riskNote: "若突破观察区间上沿或跌破下沿，需要重新评估趋势方向。",
    };
  }

  const directionText = action === "买入" ? "上方压力位" : "下方支撑位";
  const invalidationText = action === "买入" ? "跌破失效价" : "反抽站回失效价";

  return {
    rationale: `当前建议${action}，置信度${confidence}，主要依据包括 ${reasonTags.join("、")}，目标价参考${directionText}。`,
    riskNote: `${invalidationText} 或核心指标反向时，需重新评估当前建议。`,
  };
}
```

然后替换 Task 1 中的最小 `advice` 骨架为：

```js
  const priceLevels = resolveAdvicePriceLevels({
    action: adviceBase.action,
    liveQuote,
    bars,
    ma20: ma20Series.at(-1) ?? closes.at(-1) ?? 0,
    boll: boll.value,
  });
  const adviceAction = adviceBase.action !== "观望" && priceLevels == null
    ? "观望"
    : adviceBase.action;
  const adviceConfidence = adviceAction === "观望" ? "低" : adviceBase.confidence;
  const adviceReasonTags = toReasonTags({
    ma,
    macd,
    rsi,
    boll,
    volume,
    pattern,
    capital: {
      mainForceNetAmount,
    },
    sidewaysSignals,
  });
  const advicePriceLevels = adviceAction === "观望"
    ? { targetPrice: null, stopPrice: null }
    : priceLevels;
  const adviceCopy = buildAdviceCopy({
    action: adviceAction,
    confidence: adviceConfidence,
    priceLevels: advicePriceLevels,
    reasonTags: adviceReasonTags,
  });
```

返回结构中的 `advice` 更新为：

```js
    advice: {
      action: adviceAction,
      confidence: adviceConfidence,
      targetPrice: advicePriceLevels.targetPrice,
      stopPrice: advicePriceLevels.stopPrice,
      holdingWindow: resolveHoldingWindow(adviceAction, adviceConfidence),
      reasonTags: adviceReasonTags,
      rationale: adviceCopy.rationale,
      riskNote: adviceCopy.riskNote,
    },
```

- [ ] **Step 4: 跑测试确认服务端建议结构完整且通过**

Run:

```bash
node --test server/analysis.test.js
```

Expected:

```text
ok ... derives upward target and downward stop for buy advice
ok ... derives downward target and upward stop for sell advice
ok ... falls back to watch advice when target levels are invalid
```

- [ ] **Step 5: 提交服务端价位推导实现**

```bash
git add server/analysis.js server/analysis.test.js
git commit -m "feat: add trend advice price levels"
```

### Task 3: 前端类型与建议卡渲染

**Files:**
- Modify: `src/market-types.ts`
- Modify: `src/components/TrendDashboard.vue`

- [ ] **Step 1: 先更新类型定义，让前端编译先报出缺少渲染逻辑的位置**

在 `src/market-types.ts` 中把 `TrendAnalysisPayload["analysis"]` 扩展为：

```ts
    advice: {
      action: "买入" | "卖出" | "观望";
      confidence: "高" | "中" | "低";
      targetPrice: number | null;
      stopPrice: number | null;
      holdingWindow: string;
      reasonTags: string[];
      rationale: string;
      riskNote: string;
    };
```

- [ ] **Step 2: 在 `TrendDashboard.vue` 写建议卡模板和辅助格式化**

在趋势结论区域 `.trend-hero` 内、`.trend-summary-grid` 之后加入：

```vue
        <article class="advice-card" :class="adviceToneClass">
          <div class="advice-head">
            <span class="trend-label">操作建议</span>
            <strong>{{ analysis.analysis.advice.action }}</strong>
            <em>置信度 {{ analysis.analysis.advice.confidence }}</em>
          </div>
          <div class="advice-metrics">
            <span>目标价 {{ formatAdvicePrice(analysis.analysis.advice.targetPrice) }}</span>
            <span>失效价 {{ formatAdvicePrice(analysis.analysis.advice.stopPrice) }}</span>
            <span>建议周期 {{ analysis.analysis.advice.holdingWindow }}</span>
          </div>
          <div class="advice-tags">
            <span
              v-for="tag in analysis.analysis.advice.reasonTags"
              :key="tag"
              class="advice-tag"
            >
              {{ tag }}
            </span>
          </div>
          <p class="advice-copy">{{ analysis.analysis.advice.rationale }}</p>
          <p class="advice-risk">风险提示：{{ analysis.analysis.advice.riskNote }}</p>
        </article>
```

在 `<script setup>` 中 `trendToneClass` 下方加入：

```ts
const adviceToneClass = computed(() => {
  const action = props.analysis?.analysis.advice.action;
  if (action === "买入") {
    return "tone-bullish";
  }
  if (action === "卖出") {
    return "tone-bearish";
  }
  return "tone-neutral";
});

function formatAdvicePrice(value: number | null) {
  if (value == null) {
    return "--";
  }
  return value.toFixed(3);
}
```

在 `<style scoped>` 中加入：

```css
.advice-card {
  display: grid;
  gap: 12px;
  padding: 18px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.04);
}

.advice-head {
  display: grid;
  gap: 6px;
}

.advice-head strong {
  font-size: 1.5rem;
}

.advice-head em,
.advice-copy,
.advice-risk,
.advice-metrics span {
  color: var(--text-secondary);
  font-style: normal;
}

.advice-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.advice-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.advice-tag {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.12);
  color: var(--text-secondary);
}
```

并在小屏媒体查询中补一条：

```css
  .advice-metrics {
    grid-template-columns: 1fr;
  }
```

- [ ] **Step 3: 运行构建检查类型和模板**

Run:

```bash
npm run build
```

Expected:

```text
vite build completed successfully
```

- [ ] **Step 4: 如果构建报样式或模板错误，按以下成品结构收敛**

建议卡最终应位于 `.trend-hero` 的第二列内部，因此把 `.trend-summary-grid` 调整为“指标摘要 + 建议卡”共同存在的网格容器：

```vue
        <div class="trend-summary-grid">
          <article class="summary-chip">
            <span>横盘命中数</span>
            <strong>{{ analysis.analysis.sidewaysSignals.length }} / 5</strong>
          </article>
          <article class="summary-chip">
            <span>K线形态</span>
            <strong>{{ analysis.analysis.indicators.pattern.candleType }}</strong>
          </article>
          <article class="summary-chip">
            <span>量价关系</span>
            <strong>{{ analysis.analysis.indicators.volume.relation }}</strong>
          </article>
          <article class="summary-chip">
            <span>主力资金</span>
            <strong>{{ analysis.analysis.indicators.capital.mainForceDirection }}</strong>
          </article>
          <article class="advice-card" :class="adviceToneClass">
            <div class="advice-head">
              <span class="trend-label">操作建议</span>
              <strong>{{ analysis.analysis.advice.action }}</strong>
              <em>置信度 {{ analysis.analysis.advice.confidence }}</em>
            </div>
            <div class="advice-metrics">
              <span>目标价 {{ formatAdvicePrice(analysis.analysis.advice.targetPrice) }}</span>
              <span>失效价 {{ formatAdvicePrice(analysis.analysis.advice.stopPrice) }}</span>
              <span>建议周期 {{ analysis.analysis.advice.holdingWindow }}</span>
            </div>
            <div class="advice-tags">
              <span
                v-for="tag in analysis.analysis.advice.reasonTags"
                :key="tag"
                class="advice-tag"
              >
                {{ tag }}
              </span>
            </div>
            <p class="advice-copy">{{ analysis.analysis.advice.rationale }}</p>
            <p class="advice-risk">风险提示：{{ analysis.analysis.advice.riskNote }}</p>
          </article>
        </div>
```

同时让建议卡跨两列：

```css
.advice-card {
  grid-column: span 2;
}
```

- [ ] **Step 5: 提交前端展示接入**

```bash
git add src/market-types.ts src/components/TrendDashboard.vue
git commit -m "feat: render trend advice card"
```

### Task 4: 完整回归与交付

**Files:**
- Modify: `server/analysis.js`
- Modify: `server/analysis.test.js`
- Modify: `src/market-types.ts`
- Modify: `src/components/TrendDashboard.vue`

- [ ] **Step 1: 跑服务端测试全量确认没有回归**

Run:

```bash
node --test server/analysis.test.js
```

Expected:

```text
# tests ... pass
# fail 0
```

- [ ] **Step 2: 跑构建校验 Vue 模板、TS 类型和产物**

Run:

```bash
npm run build
```

Expected:

```text
dist/...
✓ built in ...
```

- [ ] **Step 3: 手动验证主路径与失败路径**

启动开发环境：

```bash
npm run dev
```

在浏览器中逐项验证：

```text
1. 选择强势上涨标的，确认展示“买入”，目标价 >= 最新价，失效价 < 最新价。
2. 选择明显走弱标的，确认展示“卖出”，目标价 <= 最新价，失效价 > 最新价。
3. 选择横盘震荡标的，确认展示“观望”，目标价和失效价显示 --。
4. 点击“立即刷新”并切换标的，确认建议卡随最新分析更新，不出现旧标的建议残留。
5. 制造分析接口失败，确认仍然展示原有错误态，不出现额外脚本报错。
```

- [ ] **Step 4: 清理最终文案和边界**

确认以下成品要求已经满足：

```text
- 不新增请求，不新增 setInterval / setTimeout，不新增事件监听。
- 观望场景不显示伪造目标价。
- 建议卡文案使用“建议”和“风险提示”，不使用确定性语气。
- reasonTags 数量不超过 6 个。
```

- [ ] **Step 5: 提交最终交付**

```bash
git add server/analysis.js server/analysis.test.js src/market-types.ts src/components/TrendDashboard.vue
git commit -m "feat: add trend advice to dashboard"
```
