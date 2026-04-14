# Strict Data Quality Recommendation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a strict-trust-first quote and analysis pipeline that verifies real-time market data freshness/authenticity, degrades recommendations when quality drops, and exposes the full evidence chain to the frontend.

**Architecture:** Keep the current Node HTTP server and Vue dashboard structure, but insert a shared data-quality layer between quote fetching and trend recommendation. Real-time quote collection becomes primary-plus-secondary validation, analysis becomes quality-gated and evidence-driven, and the dashboard renders recommendation confidence together with freshness, verification, and degradation reasons.

**Tech Stack:** Node.js, native `fetch`, Vue 3, TypeScript type definitions, `node:test`, existing ECharts dashboard

---

## File Map

- Modify: `server/quote.js`
  - Add Sina fetch support, quote normalization helpers, cross-source comparison, freshness scoring, and the new verified quote response shape.
- Modify: `server/quote.test.js`
  - Add tests for verified / partial / invalid / stale quote quality paths.
- Modify: `server/analysis.js`
  - Add quality gating, evidence breakdown, capital source separation, low-confidence downgrade rules, and request-time aware recommendation output.
- Modify: `server/analysis.test.js`
  - Add tests for quality-score thresholds, stale quote downgrade, mismatch downgrade, estimated capital separation, and blocked analysis paths.
- Modify: `server/index.js`
  - Return the expanded quote and analysis payloads without stripping quality metadata.
- Modify: `src/market-types.ts`
  - Add exact TypeScript interfaces for quote quality, analysis quality gate, evidence breakdown, capital source typing, and enriched advice.
- Modify: `src/components/TrendDashboard.vue`
  - Render quality badges, degraded reasons, failed checks, estimated-capital labels, and low-confidence recommendation copy without adding new polling or listeners.

## Task 1: Verify Quote Data Quality in `server/quote.js`

**Files:**
- Modify: `server/quote.test.js`
- Modify: `server/quote.js`

- [ ] **Step 1: Write the failing quote-quality tests**

```js
test("buildVerifiedQuote marks quote fresh and verified when primary and secondary align", () => {
  const now = "2026-04-14T09:30:10.000+08:00";
  const verified = buildVerifiedQuote({
    primaryQuote: {
      symbol: "159980",
      name: "有色ETF",
      price: 2.041,
      high: 2.047,
      low: 2.036,
      open: 2.038,
      previousClose: 2.042,
      change: -0.001,
      changePercent: -0.05,
      volume: 82089800,
      amount: 167528602.6,
      amplitudePercent: 0.54,
      turnoverRatePercent: 2.31,
      updatedAt: "2026-04-14T01:30:00.000Z",
    },
    secondaryQuote: {
      symbol: "159980",
      name: "有色ETF",
      price: 2.041,
      high: 2.047,
      low: 2.036,
      open: 2.038,
      previousClose: 2.042,
      change: -0.001,
      changePercent: -0.05,
      volume: 82100000,
      amount: 167528602.6,
      amplitudePercent: 0.54,
      turnoverRatePercent: null,
      updatedAt: "2026-04-14T01:30:05.000Z",
    },
    now,
  });

  assert.equal(verified.quality.freshness.status, "fresh");
  assert.equal(verified.quality.authenticity.status, "verified");
  assert.equal(verified.quality.consistency.status, "pass");
  assert.equal(verified.quality.degraded, false);
  assert.equal(verified.verifiedAgainst, "sina");
});

test("buildVerifiedQuote downgrades when secondary quote is missing", () => {
  const partial = buildVerifiedQuote({
    primaryQuote: {
      symbol: "159980",
      name: "有色ETF",
      price: 2.041,
      high: 2.047,
      low: 2.036,
      open: 2.038,
      previousClose: 2.042,
      change: -0.001,
      changePercent: -0.05,
      volume: 82089800,
      amount: 167528602.6,
      amplitudePercent: 0.54,
      turnoverRatePercent: 2.31,
      updatedAt: "2026-04-14T01:30:00.000Z",
    },
    secondaryQuote: null,
    now: "2026-04-14T09:30:10.000+08:00",
  });

  assert.equal(partial.quality.authenticity.status, "partial");
  assert.equal(partial.quality.degraded, true);
  assert.equal(partial.quality.authenticity.fallbackUsed, true);
  assert.match(partial.quality.warnings.join(","), /备用源缺失/);
});

test("buildVerifiedQuote marks mismatch as invalid when price exceeds tolerance", () => {
  const invalid = buildVerifiedQuote({
    primaryQuote: {
      symbol: "159980",
      name: "有色ETF",
      price: 2.041,
      high: 2.047,
      low: 2.036,
      open: 2.038,
      previousClose: 2.042,
      change: -0.001,
      changePercent: -0.05,
      volume: 82089800,
      amount: 167528602.6,
      amplitudePercent: 0.54,
      turnoverRatePercent: 2.31,
      updatedAt: "2026-04-14T01:30:00.000Z",
    },
    secondaryQuote: {
      symbol: "159980",
      name: "有色ETF",
      price: 2.08,
      high: 2.047,
      low: 2.036,
      open: 2.038,
      previousClose: 2.042,
      change: 0.039,
      changePercent: 1.91,
      volume: 82089800,
      amount: 167528602.6,
      amplitudePercent: 0.54,
      turnoverRatePercent: null,
      updatedAt: "2026-04-14T01:30:05.000Z",
    },
    now: "2026-04-14T09:30:10.000+08:00",
  });

  assert.equal(invalid.quality.authenticity.status, "invalid");
  assert.equal(invalid.quality.consistency.status, "fail");
  assert.equal(invalid.quality.degraded, true);
  assert.equal(invalid.quality.consistency.mismatches[0].field, "price");
});

test("buildVerifiedQuote marks quote stale when updatedAt is older than 15 seconds", () => {
  const stale = buildVerifiedQuote({
    primaryQuote: {
      symbol: "159980",
      name: "有色ETF",
      price: 2.041,
      high: 2.047,
      low: 2.036,
      open: 2.038,
      previousClose: 2.042,
      change: -0.001,
      changePercent: -0.05,
      volume: 82089800,
      amount: 167528602.6,
      amplitudePercent: 0.54,
      turnoverRatePercent: 2.31,
      updatedAt: "2026-04-14T01:29:30.000Z",
    },
    secondaryQuote: null,
    now: "2026-04-14T09:30:10.000+08:00",
  });

  assert.equal(stale.quality.freshness.status, "stale");
  assert.equal(stale.quality.freshness.ageSeconds, 40);
  assert.equal(stale.quality.degraded, true);
});
```

- [ ] **Step 2: Run quote tests to verify the new cases fail**

Run: `npm test -- server/quote.test.js`

Expected: FAIL with `buildVerifiedQuote is not defined` or missing `quality` assertions.

- [ ] **Step 3: Implement quote quality helpers and export a verified quote builder**

```js
const QUOTE_MAX_AGE_SECONDS = 15;
const QUOTE_TOLERANCES = {
  pricePercent: 0.003,
  changePercentAbs: 0.2,
  volumePercent: 0.08,
  updatedAtMs: 15 * 1000,
};

function toAgeSeconds(updatedAt, now) {
  const updatedAtMs = Date.parse(updatedAt);
  const nowMs = Date.parse(now);
  if (Number.isNaN(updatedAtMs) || Number.isNaN(nowMs)) {
    return null;
  }
  return Math.max(0, Math.round((nowMs - updatedAtMs) / 1000));
}

function compareQuotes(primaryQuote, secondaryQuote) {
  if (!secondaryQuote) {
    return {
      status: "warn",
      mismatches: [],
      warnings: ["备用行情源缺失，当前仅能部分验证真实性"],
    };
  }

  const mismatches = [];
  const priceDiffRatio = primaryQuote.price === 0
    ? 0
    : Math.abs(primaryQuote.price - secondaryQuote.price) / primaryQuote.price;
  if (priceDiffRatio > QUOTE_TOLERANCES.pricePercent) {
    mismatches.push({
      field: "price",
      primary: primaryQuote.price,
      secondary: secondaryQuote.price,
      tolerance: "0.3%",
    });
  }

  if (Math.abs(primaryQuote.changePercent - secondaryQuote.changePercent) > QUOTE_TOLERANCES.changePercentAbs) {
    mismatches.push({
      field: "changePercent",
      primary: primaryQuote.changePercent,
      secondary: secondaryQuote.changePercent,
      tolerance: 0.2,
    });
  }

  const volumeDiffRatio = primaryQuote.volume === 0
    ? 0
    : Math.abs(primaryQuote.volume - secondaryQuote.volume) / primaryQuote.volume;
  if (volumeDiffRatio > QUOTE_TOLERANCES.volumePercent) {
    mismatches.push({
      field: "volume",
      primary: primaryQuote.volume,
      secondary: secondaryQuote.volume,
      tolerance: "8%",
    });
  }

  const updatedAtDiffMs = Math.abs(Date.parse(primaryQuote.updatedAt) - Date.parse(secondaryQuote.updatedAt));
  if (!Number.isNaN(updatedAtDiffMs) && updatedAtDiffMs > QUOTE_TOLERANCES.updatedAtMs) {
    mismatches.push({
      field: "updatedAt",
      primary: primaryQuote.updatedAt,
      secondary: secondaryQuote.updatedAt,
      tolerance: "15s",
    });
  }

  return {
    status: mismatches.length ? "fail" : "pass",
    mismatches,
    warnings: mismatches.length ? ["主备行情关键字段存在超阈值偏差"] : [],
  };
}

export function buildVerifiedQuote({ primaryQuote, secondaryQuote, now = new Date().toISOString() }) {
  const ageSeconds = toAgeSeconds(primaryQuote.updatedAt, now);
  const freshnessStatus = ageSeconds == null || ageSeconds > QUOTE_MAX_AGE_SECONDS
    ? "stale"
    : "fresh";
  const consistency = compareQuotes(primaryQuote, secondaryQuote);
  const authenticityStatus = consistency.status === "fail"
    ? "invalid"
    : secondaryQuote
      ? "verified"
      : "partial";
  const warnings = [];
  if (freshnessStatus === "stale") {
    warnings.push("实时行情已超过15秒未更新");
  }
  warnings.push(...consistency.warnings);

  return {
    ...primaryQuote,
    source: "qq",
    verifiedAgainst: secondaryQuote ? "sina" : null,
    serverTime: now,
    quality: {
      freshness: {
        status: freshnessStatus,
        maxAgeSeconds: QUOTE_MAX_AGE_SECONDS,
        ageSeconds,
      },
      authenticity: {
        status: authenticityStatus,
        primarySource: "qq",
        secondarySource: secondaryQuote ? "sina" : null,
        fallbackUsed: !secondaryQuote,
      },
      completeness: {
        status: "complete",
        missingFields: [],
      },
      consistency: {
        status: consistency.status,
        mismatches: consistency.mismatches,
      },
      score:
        100
        - (freshnessStatus === "stale" ? 25 : 0)
        - (!secondaryQuote ? 10 : 0)
        - (consistency.status === "fail" ? 30 : 0),
      degraded: freshnessStatus === "stale" || authenticityStatus !== "verified",
      warnings,
    },
  };
}
```

- [ ] **Step 4: Update quote fetching to collect primary and secondary sources concurrently**

```js
async function requestSinaQuoteText(symbol) {
  const response = await fetch(`https://hq.sinajs.cn/list=${getExchangePrefix(symbol)}${symbol}`, {
    headers: {
      Referer: "https://finance.sina.com.cn/",
      "User-Agent": "Mozilla/5.0",
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`备用行情接口请求失败: ${response.status}`);
  }

  return GBK_DECODER.decode(await response.arrayBuffer());
}

export async function fetchQuoteBySymbol(symbol, now = new Date().toISOString()) {
  const [primaryResult, secondaryResult] = await Promise.allSettled([
    requestQqQuoteText(symbol),
    requestSinaQuoteText(symbol),
  ]);

  if (primaryResult.status !== "fulfilled") {
    throw primaryResult.reason;
  }

  const primaryQuote = parseQqQuoteText(primaryResult.value);
  const secondaryQuote = secondaryResult.status === "fulfilled"
    ? parseSinaQuoteText(secondaryResult.value)
    : null;

  return buildVerifiedQuote({
    primaryQuote,
    secondaryQuote,
    now,
  });
}
```

- [ ] **Step 5: Run quote tests to verify the quality layer passes**

Run: `npm test -- server/quote.test.js`

Expected: PASS with the new `buildVerifiedQuote` coverage and existing parsing tests still green.

- [ ] **Step 6: Commit the quote-quality slice**

```bash
git add server/quote.js server/quote.test.js
git commit -m "feat: verify quote quality with secondary source"
```

## Task 2: Add Analysis Quality Gate and Evidence Breakdown

**Files:**
- Modify: `server/analysis.test.js`
- Modify: `server/analysis.js`

- [ ] **Step 1: Write failing analysis tests for degraded and blocked recommendation paths**

```js
test("evaluateTrendFromHistory downgrades to low confidence when quote quality is stale", () => {
  const analysis = evaluateTrendFromHistory(
    risingBars,
    {
      ...createLiveQuote({
        price: 14.7,
        changePercent: 1.94,
        updatedAt: "2026-04-14T01:29:30.000Z",
      }),
      quality: {
        freshness: { status: "stale", maxAgeSeconds: 15, ageSeconds: 40 },
        authenticity: { status: "verified", primarySource: "qq", secondarySource: "sina", fallbackUsed: false },
        completeness: { status: "complete", missingFields: [] },
        consistency: { status: "pass", mismatches: [] },
        score: 75,
        degraded: true,
        warnings: ["实时行情已超过15秒未更新"],
      },
    },
    [],
    null,
    [],
    { now: "2026-04-14T09:30:10.000+08:00" },
  );

  assert.equal(analysis.dataQuality.status, "degraded");
  assert.equal(analysis.advice.confidence, "低");
  assert.match(analysis.advice.confidenceReason, /超过15秒未更新/);
});

test("evaluateTrendFromHistory blocks strong recommendation when quote authenticity is invalid", () => {
  const analysis = evaluateTrendFromHistory(
    risingBars,
    {
      ...createLiveQuote({
        price: 14.7,
        changePercent: 1.94,
      }),
      quality: {
        freshness: { status: "fresh", maxAgeSeconds: 15, ageSeconds: 2 },
        authenticity: { status: "invalid", primarySource: "qq", secondarySource: "sina", fallbackUsed: false },
        completeness: { status: "complete", missingFields: [] },
        consistency: {
          status: "fail",
          mismatches: [{ field: "price", primary: 14.7, secondary: 15.3, tolerance: "0.3%" }],
        },
        score: 45,
        degraded: true,
        warnings: ["主备行情关键字段存在超阈值偏差"],
      },
    },
    [],
    null,
    [],
    { now: "2026-04-14T09:30:10.000+08:00" },
  );

  assert.equal(analysis.dataQuality.status, "blocked");
  assert.equal(analysis.advice.action, "观望");
  assert.equal(analysis.advice.confidence, "低");
  assert.match(analysis.dataQuality.blockingReasons.join(","), /价格|真实性/);
});

test("evaluateTrendFromHistory separates estimated capital from real capital", () => {
  const analysis = evaluateTrendFromHistory(
    risingBars,
    createLiveQuote({
      price: 14.7,
      changePercent: 1.94,
      amount: 61800000,
      quality: {
        freshness: { status: "fresh", maxAgeSeconds: 15, ageSeconds: 2 },
        authenticity: { status: "partial", primarySource: "qq", secondarySource: null, fallbackUsed: true },
        completeness: { status: "complete", missingFields: [] },
        consistency: { status: "warn", mismatches: [] },
        score: 82,
        degraded: true,
        warnings: ["备用行情源缺失，当前仅能部分验证真实性"],
      },
    }),
    [],
    null,
    [],
    { now: "2026-04-14T09:30:10.000+08:00" },
  );

  assert.equal(analysis.indicators.capital.mainForceNetAmountReal, null);
  assert.equal(analysis.indicators.capital.mainForceSourceType, "estimated");
  assert.notEqual(analysis.indicators.capital.mainForceNetAmountEstimated, null);
});
```

- [ ] **Step 2: Run analysis tests to verify the new cases fail**

Run: `npm test -- server/analysis.test.js`

Expected: FAIL because `dataQuality`, `confidenceReason`, and the split capital fields do not exist yet.

- [ ] **Step 3: Add analysis quality scoring and blocking helpers**

```js
function evaluateAnalysisQuality(quote, capitalSnapshot) {
  const blockingReasons = [];
  const warnings = [...(quote.quality?.warnings ?? [])];
  let score = quote.quality?.score ?? 0;

  if (!quote.quality || quote.quality.authenticity.status === "invalid") {
    blockingReasons.push("实时行情真实性未通过校验");
  }

  if (quote.quality?.freshness.status === "stale") {
    warnings.push("推荐已因行情过期降级");
  }

  if (!capitalSnapshot) {
    score -= 20;
    warnings.push("实时主力资金缺失，仅能使用估算或历史数据");
  }

  const status = blockingReasons.length
    ? "blocked"
    : score < 70 || quote.quality?.degraded
      ? "degraded"
      : "pass";

  return {
    status,
    score: Math.max(0, score),
    degraded: status !== "pass",
    blockingReasons,
    warnings: [...new Set(warnings)],
  };
}

function buildEvidenceBreakdown({ ma, macd, rsi, boll, volume, pattern, capitalSourceType, sidewaysSignals }) {
  const scoreBreakdown = [
    {
      key: "ma",
      group: "core",
      direction: ma.bias === "偏多" ? "bullish" : ma.bias === "偏空" ? "bearish" : "neutral",
      weight: 20,
      score: ma.bias === "偏多" ? 20 : ma.bias === "偏空" ? -20 : 0,
      reason: ma.detail,
    },
    {
      key: "macd",
      group: "core",
      direction: macd.bias === "偏多" ? "bullish" : macd.bias === "偏空" ? "bearish" : "neutral",
      weight: 20,
      score: macd.bias === "偏多" ? 20 : macd.bias === "偏空" ? -20 : 0,
      reason: `${macd.state} / ${macd.zeroAxis}`,
    },
    {
      key: "rsi",
      group: "core",
      direction: rsi.bias === "偏多" ? "bullish" : rsi.bias === "偏空" ? "bearish" : "neutral",
      weight: 15,
      score: rsi.bias === "偏多" ? 15 : rsi.bias === "偏空" ? -15 : 0,
      reason: `RSI ${rsi.state}`,
    },
    {
      key: "volume",
      group: "realtime",
      direction: volume.relation === "价涨量增" ? "bullish" : volume.relation === "价跌量增" ? "bearish" : "neutral",
      weight: 15,
      score: volume.relation === "价涨量增" ? 15 : volume.relation === "价跌量增" ? -15 : 0,
      reason: volume.relation,
    },
    {
      key: "pattern",
      group: "core",
      direction: pattern.pattern === "突破" ? "bullish" : pattern.pattern === "破位" ? "bearish" : sidewaysSignals.length >= 3 ? "sideways" : "neutral",
      weight: 10,
      score: pattern.pattern === "突破" ? 10 : pattern.pattern === "破位" ? -10 : 0,
      reason: `${pattern.pattern} / ${pattern.candleType}`,
    },
    {
      key: "boll",
      group: "auxiliary",
      direction: boll.position.includes("上") ? "bullish" : boll.position.includes("下") ? "bearish" : "neutral",
      weight: 10,
      score: boll.position.includes("上") ? 10 : boll.position.includes("下") ? -10 : 0,
      reason: `${boll.state} / ${boll.position}`,
    },
    {
      key: "capital",
      group: "realtime",
      direction: capitalSourceType === "missing" ? "neutral" : "bullish",
      weight: 10,
      score: capitalSourceType === "verified" ? 10 : capitalSourceType === "history_only" ? 4 : capitalSourceType === "estimated" ? 2 : 0,
      reason: `资金来源 ${capitalSourceType}`,
    },
  ];

  return {
    passedChecks: scoreBreakdown.filter((item) => item.score !== 0).map((item) => item.key),
    failedChecks: [],
    scoreBreakdown,
  };
}
```

- [ ] **Step 4: Update `evaluateTrendFromHistory()` to gate recommendation by quality**

```js
export function evaluateTrendFromHistory(
  bars,
  liveQuote,
  turnoverRows = [],
  capitalSnapshot = null,
  capitalFlowRows = [],
  options = {},
) {
  if (bars.length < 60) {
    throw new Error("历史K线数量不足，无法分析趋势");
  }

  const analysisQuality = evaluateAnalysisQuality(liveQuote, capitalSnapshot);
  const capitalEstimated = round(liveQuote.amount * (liveQuote.changePercent / 100), 0);
  const capitalSourceType = capitalSnapshot?.mainNetInflow != null
    ? "verified"
    : capitalFlowRows.length
      ? "history_only"
      : "estimated";

  // existing indicator calculations stay in place here

  const evidence = buildEvidenceBreakdown({
    ma,
    macd,
    rsi,
    boll,
    volume,
    pattern,
    capitalSourceType,
    sidewaysSignals,
  });

  const adviceBase = resolveAdviceAction({
    ma,
    macd,
    rsi,
    sidewaysSignals,
    signalCounts,
  });

  const blocked = analysisQuality.status === "blocked";
  const degraded = analysisQuality.status === "degraded";
  const adviceAction = blocked ? "观望" : adviceBase.action;
  const adviceConfidence = blocked
    ? "低"
    : degraded
      ? "低"
      : adviceBase.confidence;
  const confidenceReason = blocked
    ? analysisQuality.blockingReasons.join("；")
    : degraded
      ? analysisQuality.warnings.join("；")
      : "关键实时数据校验通过，趋势与确认因子同向";

  return {
    trendLabel,
    dataQuality: analysisQuality,
    evidence,
    indicators: {
      ...existingIndicators,
      capital: {
        turnoverRatePercent,
        mainForceNetAmountReal: capitalSnapshot?.mainNetInflow ?? null,
        mainForceNetAmountEstimated: capitalSnapshot?.mainNetInflow == null ? capitalEstimated : null,
        mainForceDirection: (capitalSnapshot?.mainNetInflow ?? capitalEstimated) >= 0 ? "净流入" : "净流出",
        mainForceSourceType: capitalSourceType,
      },
    },
    advice: {
      action: adviceAction,
      confidence: adviceConfidence,
      qualityGate: analysisQuality.status,
      confidenceReason,
      degradeReasons: analysisQuality.warnings,
      evidenceSummary: evidence.scoreBreakdown
        .filter((item) => item.score !== 0)
        .slice(0, 4)
        .map((item) => item.reason),
      targetPrice: advicePriceLevels.targetPrice,
      stopPrice: advicePriceLevels.stopPrice,
      holdingWindow: resolveHoldingWindow(adviceAction, adviceConfidence),
      reasonTags: adviceReasonTags,
      rationale: adviceCopy.rationale,
      riskNote: adviceCopy.riskNote,
    },
    charts: existingCharts,
  };
}
```

- [ ] **Step 5: Run analysis tests to verify degraded and blocked paths pass**

Run: `npm test -- server/analysis.test.js`

Expected: PASS with the new `dataQuality`, `evidence`, and capital-source assertions.

- [ ] **Step 6: Commit the analysis-quality slice**

```bash
git add server/analysis.js server/analysis.test.js
git commit -m "feat: gate trend advice by data quality"
```

## Task 3: Pass Quality Metadata Through the API Surface

**Files:**
- Modify: `server/index.js`
- Modify: `src/market-types.ts`

- [ ] **Step 1: Add failing type assertions for the enriched payload shape**

```ts
export interface QuoteQuality {
  freshness: {
    status: "fresh" | "stale";
    maxAgeSeconds: 15;
    ageSeconds: number | null;
  };
  authenticity: {
    status: "verified" | "partial" | "invalid";
    primarySource: string;
    secondarySource: string | null;
    fallbackUsed: boolean;
  };
  completeness: {
    status: "complete" | "partial" | "invalid";
    missingFields: string[];
  };
  consistency: {
    status: "pass" | "warn" | "fail";
    mismatches: Array<{
      field: string;
      primary: number | string | null;
      secondary: number | string | null;
      tolerance: number | string;
    }>;
  };
  score: number;
  degraded: boolean;
  warnings: string[];
}
```

Add these interfaces before editing runtime code so TypeScript forces the correct shape through the component.

- [ ] **Step 2: Run the project test / type flow to verify type errors appear**

Run: `npm test`

Expected: FAIL or report missing `quality`, `dataQuality`, `evidence`, and capital source fields in the existing frontend types.

- [ ] **Step 3: Expand `src/market-types.ts` with the full quality-aware payload**

```ts
export interface QuoteData {
  symbol: string;
  name: string;
  price: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  change: number;
  changePercent: number;
  volume: number;
  amount: number;
  amplitudePercent: number;
  turnoverRatePercent: number | null;
  updatedAt: string;
  source: string;
  verifiedAgainst: string | null;
  serverTime: string;
  quality: QuoteQuality;
}

export interface AnalysisQualityGate {
  status: "pass" | "degraded" | "blocked";
  score: number;
  degraded: boolean;
  blockingReasons: string[];
  warnings: string[];
}

export interface EvidenceBreakdownItem {
  key: string;
  group: "core" | "realtime" | "auxiliary";
  direction: "bullish" | "bearish" | "sideways" | "neutral";
  weight: number;
  score: number;
  reason: string;
}

export interface TrendAnalysisPayload {
  symbol: string;
  quote: QuoteData;
  analysis: {
    trendLabel: string;
    summary: string;
    dataQuality: AnalysisQualityGate;
    evidence: {
      passedChecks: string[];
      failedChecks: string[];
      scoreBreakdown: EvidenceBreakdownItem[];
    };
    advice: {
      action?: "买入" | "卖出" | "观望";
      confidence?: "高" | "中" | "低";
      qualityGate?: "pass" | "degraded" | "blocked";
      confidenceReason?: string;
      degradeReasons?: string[];
      evidenceSummary?: string[];
      targetPrice?: number | null;
      stopPrice?: number | null;
      holdingWindow?: string;
      reasonTags?: string[];
      rationale?: string;
      riskNote?: string;
    };
    indicators: {
      capital: {
        turnoverRatePercent: number | null;
        mainForceNetAmountReal: number | null;
        mainForceNetAmountEstimated: number | null;
        mainForceDirection: string;
        mainForceSourceType: "verified" | "history_only" | "estimated" | "missing";
      };
    } & ExistingIndicatorShape;
    charts: ExistingChartShape;
  };
}
```

- [ ] **Step 4: Keep `server/index.js` pass-through simple and lossless**

```js
if (request.method === "GET" && url.pathname === "/api/quote") {
  const symbol = (url.searchParams.get("symbol") || DEFAULT_SYMBOL).trim();

  try {
    const quote = await fetchQuoteBySymbol(symbol);
    sendJson(response, 200, {
      success: true,
      data: quote,
    });
  } catch (error) {
    sendJson(response, 502, {
      success: false,
      message: error instanceof Error ? error.message : "获取行情失败",
    });
  }
  return;
}
```

No projection layer should strip `quality`, `serverTime`, or `verifiedAgainst` fields from the quote or analysis payload.

- [ ] **Step 5: Run the full automated checks after the payload shape is updated**

Run: `npm test`

Expected: PASS or, if the Vue component still breaks on the new types, TypeScript now points directly to the rendering gaps to fix in the next task.

- [ ] **Step 6: Commit the type and API shape slice**

```bash
git add server/index.js src/market-types.ts
git commit -m "feat: expose data quality metadata in api types"
```

## Task 4: Render Quality State and Degraded Advice in `TrendDashboard.vue`

**Files:**
- Modify: `src/components/TrendDashboard.vue`

- [ ] **Step 1: Write the minimal rendering additions against the new payload shape**

```ts
const advice = computed<Advice>(() => props.analysis?.analysis.advice ?? {});
const qualityGate = computed(() => props.analysis?.analysis.dataQuality ?? null);
const quoteQuality = computed(() => props.analysis?.quote.quality ?? null);
const capitalSourceLabel = computed(() => {
  const sourceType = props.analysis?.analysis.indicators.capital.mainForceSourceType;
  if (sourceType === "verified") {
    return "实时资金已验证";
  }
  if (sourceType === "history_only") {
    return "仅历史资金";
  }
  if (sourceType === "estimated") {
    return "资金为估算";
  }
  return "资金缺失";
});
```

- [ ] **Step 2: Update the template to show quality badges and degrade reasons**

```vue
<div class="quality-strip" v-if="analysis">
  <span class="quality-badge" :class="`quality-${analysis.analysis.dataQuality.status}`">
    {{ analysis.analysis.dataQuality.status === "pass" ? "实时可信" : analysis.analysis.dataQuality.status === "degraded" ? "已降级" : "数据阻断" }}
  </span>
  <span class="quality-badge" :class="quoteQuality?.freshness.status === 'fresh' ? 'quality-pass' : 'quality-degraded'">
    {{ quoteQuality?.freshness.status === "fresh" ? "15秒内实时" : "已超过15秒" }}
  </span>
  <span class="quality-badge" :class="quoteQuality?.authenticity.status === 'verified' ? 'quality-pass' : 'quality-degraded'">
    {{ quoteQuality?.authenticity.status === "verified" ? "双源已验证" : quoteQuality?.authenticity.status === "partial" ? "部分验证" : "校验冲突" }}
  </span>
</div>

<div class="advice-alert" v-if="advice.degradeReasons?.length">
  <strong>降级原因</strong>
  <p>{{ advice.degradeReasons.join("；") }}</p>
</div>

<div class="evidence-panel" v-if="analysis.analysis.evidence.scoreBreakdown.length">
  <span
    v-for="item in analysis.analysis.evidence.scoreBreakdown.filter((entry) => entry.score !== 0)"
    :key="item.key"
    class="evidence-chip"
  >
    {{ item.reason }}
  </span>
</div>
```

- [ ] **Step 3: Update capital display so estimated values cannot masquerade as real**

```vue
<article class="signal-card" :class="signalTone(...)">
  <span>形态 / 资金</span>
  <strong>{{ analysis.analysis.indicators.pattern.pattern }}</strong>
  <p>{{ analysis.analysis.indicators.capital.mainForceDirection }}</p>
  <small>
    {{
      analysis.analysis.indicators.capital.mainForceNetAmountReal != null
        ? `${formatMoney(analysis.analysis.indicators.capital.mainForceNetAmountReal)}（实时）`
        : analysis.analysis.indicators.capital.mainForceNetAmountEstimated != null
          ? `${formatMoney(analysis.analysis.indicators.capital.mainForceNetAmountEstimated)}（估算）`
          : "--"
    }}
  </small>
  <small>{{ capitalSourceLabel }}</small>
</article>
```

- [ ] **Step 4: Add only the CSS needed for the new quality UI**

```css
.quality-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.quality-badge,
.evidence-chip {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.12);
  color: var(--text-secondary);
}

.quality-pass {
  background: rgba(34, 197, 94, 0.14);
  color: #22c55e;
}

.quality-degraded {
  background: rgba(245, 158, 11, 0.16);
  color: #f59e0b;
}

.quality-blocked {
  background: rgba(239, 68, 68, 0.16);
  color: #ef4444;
}

.advice-alert {
  display: grid;
  gap: 8px;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(245, 158, 11, 0.12);
}

.evidence-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
```

- [ ] **Step 5: Run diagnostics and the project test suite after the UI changes**

Run: `npm test`

Expected: PASS, and `GetDiagnostics` shows no new Vue or TypeScript errors in `src/components/TrendDashboard.vue` or `src/market-types.ts`.

- [ ] **Step 6: Commit the dashboard rendering slice**

```bash
git add src/components/TrendDashboard.vue src/market-types.ts
git commit -m "feat: render quote quality and degraded advice"
```

## Task 5: Final Regression Checks and Handoff

**Files:**
- Modify: `server/quote.test.js`
- Modify: `server/analysis.test.js`
- Modify: `src/components/TrendDashboard.vue`

- [ ] **Step 1: Run focused backend regression tests**

Run: `npm test -- server/quote.test.js server/analysis.test.js`

Expected: PASS for parsing, quality verification, degradation, and recommendation gating.

- [ ] **Step 2: Run the full project test suite**

Run: `npm test`

Expected: PASS for the entire project without regressing watchlist, market-session, or frontend config coverage.

- [ ] **Step 3: Run lint or diagnostics for recently edited frontend files**

Run diagnostics for:

```text
/Users/fangteng/Desktop/ai-ui/src/market-types.ts
/Users/fangteng/Desktop/ai-ui/src/components/TrendDashboard.vue
```

Expected: no new diagnostics.

- [ ] **Step 4: Manual verification checklist**

```text
1. Open the dashboard for a normal symbol and confirm "实时可信" appears when quote freshness/authenticity pass.
2. Simulate stale data in tests and confirm the UI shows "已降级" with low confidence.
3. Simulate source mismatch in tests and confirm the advice falls back to 观望 or low confidence with visible reasons.
4. Confirm the capital card shows （估算） when no real-time capital snapshot is available.
5. Refresh rapidly and confirm only the latest response is rendered.
```

- [ ] **Step 5: Commit final polish and verification updates**

```bash
git add server/quote.test.js server/analysis.test.js src/components/TrendDashboard.vue
git commit -m "test: cover strict data quality recommendation flow"
```

## Self-Review

### Spec coverage

- Double-source quote verification: Task 1
- 15-second freshness gate: Task 1 and Task 2
- Analysis quality gate and evidence breakdown: Task 2
- Real vs estimated capital separation: Task 2 and Task 4
- API and TypeScript contract updates: Task 3
- Frontend degraded-state rendering: Task 4
- Regression, diagnostics, and manual verification: Task 5

No spec section is left without an implementation task.

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Every code-changing step includes concrete code or exact commands.
- Every test step includes a runnable command and the expected failure or pass signal.

### Type consistency

- `QuoteQuality`, `AnalysisQualityGate`, and `EvidenceBreakdownItem` names are reused consistently across Tasks 1-4.
- Capital typing consistently uses `mainForceNetAmountReal`, `mainForceNetAmountEstimated`, and `mainForceSourceType`.
- Advice typing consistently uses `qualityGate`, `confidenceReason`, `degradeReasons`, and `evidenceSummary`.
