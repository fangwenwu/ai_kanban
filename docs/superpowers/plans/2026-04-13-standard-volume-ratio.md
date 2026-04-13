# Standard Volume Ratio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current custom volume multiple with an industry-aligned volume ratio that compares current cumulative volume against the 5-day average volume adjusted by intraday trading-session progress.

**Architecture:** Keep the change fully inside `server/analysis.js` so the API response shape and Vue rendering stay unchanged. Add two pure helpers there: one converts Sina real-time volume from shares to lots, and another computes A-share trading-session progress from `updatedAt` in China time; then update `createVolumeState()` to use the normalized volume and progress-adjusted denominator. Validate behavior with focused Node tests in `server/analysis.test.js`.

**Tech Stack:** Node.js ESM, Node test runner, Vue 3 frontend consuming unchanged JSON

---

### Task 1: Lock down the new volume-ratio behavior with tests

**Files:**
- Modify: `server/analysis.test.js`
- Verify: `server/analysis.js`

- [ ] **Step 1: Write the failing tests**

```js
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
      volume: index < 55 ? 900 : 0,
    });
  });

  const analysis = evaluateTrendFromHistory(bars, createLiveQuote({
    volume: 50000,
    updatedAt: "2026-04-13T02:30:00.000Z",
  }));

  assert.equal(analysis.indicators.volume.volumeRatio, 1);
  assert.equal(analysis.indicators.volume.state, "平量");
});
```

- [ ] **Step 2: Run the targeted test file and verify it fails**

Run: `node --test server/analysis.test.js`
Expected: FAIL because `evaluateTrendFromHistory()` still uses the old full-day ratio and does not normalize Sina real-time volume or trading-session progress

- [ ] **Step 3: Commit the red test**

```bash
git add server/analysis.test.js
git commit -m "test: define standard volume ratio behavior"
```

### Task 2: Implement standard volume ratio in the analysis service

**Files:**
- Modify: `server/analysis.js`
- Verify: `server/analysis.test.js`

- [ ] **Step 1: Add pure helpers for unit normalization and trading-session progress**

```js
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
```

- [ ] **Step 2: Replace the old ratio formula inside `createVolumeState()`**

```js
function createVolumeState(bars, liveQuote) {
  const recentVolumes = bars.slice(-6, -1).map((bar) => bar.volume);
  const averageVolume = average(recentVolumes);
  const normalizedLiveVolume = normalizeRealtimeVolume(liveQuote.volume);
  const tradingProgress = getTradingProgress(liveQuote.updatedAt);
  const referenceVolume = tradingProgress == null
    ? averageVolume
    : averageVolume * tradingProgress;
  const volumeRatio = referenceVolume <= 0
    ? 1
    : normalizedLiveVolume / referenceVolume;

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
```

- [ ] **Step 3: Run the targeted tests and verify they pass**

Run: `node --test server/analysis.test.js`
Expected: PASS with the new intraday-progress assertions green and the existing sideways/uptrend tests still passing

- [ ] **Step 4: Commit the implementation**

```bash
git add server/analysis.js server/analysis.test.js
git commit -m "feat: align volume ratio with market convention"
```

### Task 3: Validate project health after the service change

**Files:**
- Verify: `server/analysis.js`
- Verify: `server/analysis.test.js`

- [ ] **Step 1: Run the production type/build check**

Run: `npm run build`
Expected: PASS

- [ ] **Step 2: Check edited-file diagnostics**

Check diagnostics for:

```text
/Users/fangteng/Desktop/ai-ui/server/analysis.js
/Users/fangteng/Desktop/ai-ui/server/analysis.test.js
```

Expected: no new diagnostics introduced by the standard volume-ratio change

- [ ] **Step 3: Commit the verification state**

```bash
git add server/analysis.js server/analysis.test.js
git commit -m "chore: verify standard volume ratio change"
```
